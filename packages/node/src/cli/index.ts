import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { createInitFiles, type Framework, type Storage } from './templates.js';

export { createInitFiles, type Framework, type InitFile, type Storage } from './templates.js';

export interface CliDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  write?: (message: string) => void;
  readSecret?: () => Promise<string>;
  migrate?: (options: { storage: Storage; cwd: string }) => Promise<void>;
}

export interface CliResult { exitCode: 0 | 1 | 2; }

export async function runCli(argv: readonly string[], dependencies: CliDependencies = {}): Promise<CliResult> {
  const write = dependencies.write ?? ((message) => process.stdout.write(message));
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') return usage(write, 0);
  if (command === 'serve') return fail(write, 'The copypatch CLI does not provide a serve command. Mount an adapter in your application instead.\n', 2);
  if (command === 'init') return init(args, dependencies, write);
  if (command === 'migrate') return migrate(args, dependencies, write);
  if (command === 'doctor') return doctor(args, dependencies, write);
  if (command === 'hash') return hashPassphrase(args, dependencies, write);
  return fail(write, `Unknown command: ${command}\n`, 2);
}

async function init(args: readonly string[], dependencies: CliDependencies, write: (message: string) => void): Promise<CliResult> {
  const parsed = parse(args);
  const framework = parsed.value('--framework');
  const storage = parsed.value('--storage');
  if (!isFramework(framework) || !isStorage(storage) || parsed.invalid) return usage(write, 2);
  const cwd = safeCwd(parsed.value('--cwd'), dependencies.cwd);
  if (!cwd) return fail(write, 'Refusing --cwd path traversal.\n', 1);
  const plan = createInitPlan({ framework, storage }, await currentCopyPatchRange());
  const packagePath = resolve(cwd, 'package.json');
  const packageUpdate = await planPackageUpdate(packagePath, plan.requiredPackages);
  if (!packageUpdate) return fail(write, 'CopyPatch init requires a valid package.json with an object dependencies field.\n', 1);
  const outcomes = await Promise.all(plan.files.map(async (file) => ({ file, path: resolve(cwd, file.path), current: await readOptional(resolve(cwd, file.path)) })));
  if (outcomes.some(({ path }) => !inside(cwd, path))) return fail(write, 'Refusing template path outside cwd.\n', 1);
  const conflicts = outcomes.filter(({ current, file }) => current !== undefined && current !== file.contents);
  if (conflicts.length > 0) return fail(write, `Refusing to overwrite: ${conflicts.map(({ file }) => file.path).join(', ')}\n`, 1);
  if (parsed.flag('--dry-run')) {
    if (packageUpdate.added.length > 0) write(`Would update package.json dependencies: ${packageUpdate.added.join(', ')}\n`);
    write(`Would create: ${outcomes.filter(({ current }) => current === undefined).map(({ file }) => file.path).join(', ') || 'nothing'}\n`);
    return { exitCode: 0 };
  }
  if (packageUpdate.added.length > 0) {
    await writeFile(packagePath, packageUpdate.contents, { encoding: 'utf8' });
    write(`Updated package.json dependencies: ${packageUpdate.added.join(', ')}\n`);
  }
  for (const outcome of outcomes) {
    if (outcome.current === undefined) {
      await mkdir(resolve(outcome.path, '..'), { recursive: true });
      await writeFile(outcome.path, outcome.file.contents, { encoding: 'utf8', flag: 'wx' });
      write(`Created ${outcome.file.path}\n`);
    }
  }
  if (packageUpdate.added.length > 0) write(`Run ${await detectPackageManager(cwd, packageUpdate.manifest)} install to install the required CopyPatch packages.\n`);
  return { exitCode: 0 };
}

async function migrate(args: readonly string[], dependencies: CliDependencies, write: (message: string) => void): Promise<CliResult> {
  const parsed = parse(args);
  const storage = parsed.value('--storage');
  if (!isStorage(storage) || parsed.invalid) return usage(write, 2);
  const cwd = safeCwd(parsed.value('--cwd'), dependencies.cwd);
  if (!cwd) return fail(write, 'Refusing --cwd path traversal.\n', 1);
  try {
    if (dependencies.migrate) await dependencies.migrate({ storage, cwd });
    else await migrateStorage(storage, cwd, dependencies.env ?? process.env);
  } catch (error) {
    if (error instanceof MissingOptionalPackageError) return fail(write, `${error.message}\n`, 1);
    return fail(write, 'Migration failed. Check your storage configuration and permissions.\n', 1);
  }
  write(`Applied ${storage} migrations.\n`);
  return { exitCode: 0 };
}

async function doctor(args: readonly string[], dependencies: CliDependencies, write: (message: string) => void): Promise<CliResult> {
  if (args.length > 0) return usage(write, 2);
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  write(`cwd: ${cwd}\n`);
  const configPath = resolve(cwd, 'copypatch.config.ts');
  const config = await readOptional(configPath);
  write(`filesystem: ${await exists(cwd) ? 'available' : 'missing'}\n`);
  write(`config: ${config === undefined ? 'missing' : 'present'}\n`);
  write(`backend: ${config?.includes('@copypatch/backend') ? 'configured' : 'mount required'}\n`);
  write(`storage: ${storageFromConfig(config) ?? 'not configured'}\n`);
  for (const key of Object.keys(env).filter((name) => name.startsWith('COPYPATCH_')).sort()) write(`${key}=[redacted]\n`);
  return { exitCode: 0 };
}

async function hashPassphrase(args: readonly string[], dependencies: CliDependencies, write: (message: string) => void): Promise<CliResult> {
  const parsed = parse(args);
  if (parsed.invalid) return usage(write, 2);
  const explicit = parsed.value('--passphrase');
  const stdin = parsed.flag('--stdin');
  if (!explicit && !stdin) return usage(write, 2);
  if (explicit) write('Warning: --passphrase may be visible in your process list; use --stdin instead.\n');
  const secret = explicit ?? await (dependencies.readSecret?.() ?? readStdin());
  if (!secret) return fail(write, 'A non-empty passphrase is required.\n', 1);
  try {
    const argon2 = await loadOptionalModule<Argon2Module>('@node-rs/argon2', 'The copypatch hash command requires @node-rs/argon2. Install it in this project, then retry.');
    write(`${await argon2.hash(secret, { algorithm: 2 })}\n`);
  } catch (error) {
    if (error instanceof MissingOptionalPackageError) return fail(write, `${error.message}\n`, 1);
    return fail(write, 'Passphrase hashing failed. Check the local Argon2 installation and retry.\n', 1);
  }
  return { exitCode: 0 };
}

function parse(args: readonly string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let invalid = false;
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === '--dry-run' || item === '--stdin') { flags.add(item); continue; }
    if (item === '--framework' || item === '--storage' || item === '--cwd' || item === '--passphrase') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) { invalid = true; continue; }
      values.set(item, value); index += 1; continue;
    }
    invalid = true;
  }
  return { flag: (name: string) => flags.has(name), value: (name: string) => values.get(name), invalid };
}

function safeCwd(value: string | undefined, fallback: string | undefined): string | undefined {
  if (value && !isAbsolute(value) && value.split(/[\\/]/).includes('..')) return undefined;
  return resolve(value ?? fallback ?? process.cwd());
}
function inside(root: string, target: string): boolean { return target === root || target.startsWith(`${root}${sep}`); }
function isFramework(value: string | undefined): value is Framework { return value === 'next' || value === 'astro' || value === 'react-router' || value === 'vite-node'; }
function isStorage(value: string | undefined): value is Storage { return value === 'sqlite' || value === 'postgres'; }
function storageFromConfig(config: string | undefined): Storage | undefined {
  if (!config) return undefined;
  if (config.includes("from '@copypatch/storage-sqlite'")) return 'sqlite';
  if (config.includes("from '@copypatch/storage-postgres'")) return 'postgres';
  const legacy = config.match(/storage: '(sqlite|postgres)'/)?.[1];
  return isStorage(legacy) ? legacy : undefined;
}
async function exists(path: string): Promise<boolean> { try { await access(path, constants.F_OK); return true; } catch { return false; } }
async function readOptional(path: string): Promise<string | undefined> { try { return await readFile(path, 'utf8'); } catch { return undefined; } }
async function readStdin(): Promise<string> {
  let value = '';
  for await (const chunk of process.stdin) value += String(chunk);
  return value.trim();
}
async function migrateStorage(storage: Storage, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (storage === 'sqlite') {
    const module = await loadOptionalModule<SQLiteStorageModule>('@copypatch/storage-sqlite', 'The copypatch migrate command for SQLite requires @copypatch/storage-sqlite. Install it in this project, then retry.');
    const persistence = module.createSQLitePersistence(env.COPYPATCH_SQLITE_PATH ?? resolve(cwd, 'copypatch.sqlite'));
    try { await persistence.migrate(); } finally { persistence.close(); }
    return;
  }
  const databaseUrl = env.COPYPATCH_DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing PostgreSQL connection configuration.');
  const module = await loadOptionalModule<PostgresStorageModule>('@copypatch/storage-postgres', 'The copypatch migrate command for PostgreSQL requires @copypatch/storage-postgres. Install it in this project, then retry.');
  const persistence = module.createPostgresPersistence(databaseUrl);
  try { await persistence.migrate(); } finally { await persistence.close(); }
}

interface InitPlan {
  files: readonly ReturnType<typeof createInitFiles>[number][];
  requiredPackages: readonly RequiredPackage[];
}

interface RequiredPackage { name: string; version: string; }

interface PackageManifest {
  version?: unknown;
  packageManager?: unknown;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface PackageUpdate {
  manifest: PackageManifest;
  contents: string;
  added: readonly string[];
}

interface Argon2Module {
  hash(value: string, options: { algorithm: number }): Promise<string>;
}

interface SQLiteStorageModule {
  createSQLitePersistence(filename: string): { migrate(): Promise<void>; close(): void; };
}

interface PostgresStorageModule {
  createPostgresPersistence(input: string): { migrate(): Promise<void>; close(): Promise<void>; };
}

class MissingOptionalPackageError extends Error {}

async function currentCopyPatchRange(): Promise<string> {
  const manifest = parsePackageManifest(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const version = typeof manifest?.version === 'string' ? manifest.version : '';
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error('The installed @copypatch/node package has an invalid version.');
  return `^${match[1]}.0.0`;
}

function createInitPlan(options: { framework: Framework; storage: Storage }, version: string): InitPlan {
  const requiredPackages: RequiredPackage[] = [
    { name: '@copypatch/backend', version },
    { name: options.storage === 'sqlite' ? '@copypatch/storage-sqlite' : '@copypatch/storage-postgres', version },
  ];
  if (options.framework === 'next') requiredPackages.push({ name: '@copypatch/next', version });
  if (options.framework === 'vite-node') requiredPackages.push({ name: '@copypatch/node', version });
  return { files: createInitFiles(options), requiredPackages };
}

async function planPackageUpdate(path: string, requiredPackages: readonly RequiredPackage[]): Promise<PackageUpdate | undefined> {
  const contents = await readOptional(path);
  if (contents === undefined) return undefined;
  const manifest = parsePackageManifest(contents);
  if (!manifest) return undefined;
  const dependencies = manifest.dependencies ?? {};
  const added = requiredPackages.filter(({ name }) => dependencies[name] === undefined);
  if (added.length === 0) return { manifest, contents, added: [] };
  manifest.dependencies = { ...dependencies, ...Object.fromEntries(added.map(({ name, version }) => [name, version])) };
  return { manifest, contents: formatPackageManifest(manifest, contents), added: added.map(({ name }) => name) };
}

function parsePackageManifest(contents: string): PackageManifest | undefined {
  try {
    const value: unknown = JSON.parse(contents);
    if (!isRecord(value)) return undefined;
    if (value.dependencies !== undefined && (!isRecord(value.dependencies) || Object.values(value.dependencies).some((dependency) => typeof dependency !== 'string'))) return undefined;
    return value as PackageManifest;
  } catch {
    return undefined;
  }
}

function formatPackageManifest(manifest: PackageManifest, original: string): string {
  const indentation = original.match(/\r?\n([\t ]+)"/)?.[1] ?? '  ';
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  return `${JSON.stringify(manifest, null, indentation).replace(/\n/g, newline)}${newline}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function detectPackageManager(cwd: string, manifest: PackageManifest): Promise<'npm' | 'pnpm' | 'yarn'> {
  const declared = typeof manifest.packageManager === 'string' ? manifest.packageManager.split('@')[0] : undefined;
  if (declared === 'npm' || declared === 'pnpm' || declared === 'yarn') return declared;
  if (await exists(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(resolve(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

async function loadOptionalModule<TModule>(name: string, message: string): Promise<TModule> {
  try {
    return await import(name) as TModule;
  } catch (error) {
    if (isMissingModuleError(error)) throw new MissingOptionalPackageError(message);
    throw error;
  }
}

function isMissingModuleError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND');
}
function fail(write: (message: string) => void, message: string, exitCode: 1 | 2): CliResult { write(message); return { exitCode }; }
function usage(write: (message: string) => void, exitCode: 0 | 2): CliResult { write('Usage: copypatch init --framework next|astro|react-router|vite-node --storage sqlite|postgres [--dry-run] [--cwd PATH]\n'); return { exitCode }; }
