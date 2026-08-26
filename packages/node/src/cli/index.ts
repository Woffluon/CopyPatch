import { hash } from '@node-rs/argon2';
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
  const files = createInitFiles({ framework, storage });
  const outcomes = await Promise.all(files.map(async (file) => ({ file, path: resolve(cwd, file.path), current: await readOptional(resolve(cwd, file.path)) })));
  if (outcomes.some(({ path }) => !inside(cwd, path))) return fail(write, 'Refusing template path outside cwd.\n', 1);
  const conflicts = outcomes.filter(({ current, file }) => current !== undefined && current !== file.contents);
  if (conflicts.length > 0) return fail(write, `Refusing to overwrite: ${conflicts.map(({ file }) => file.path).join(', ')}\n`, 1);
  if (parsed.flag('--dry-run')) {
    write(`Would create: ${outcomes.filter(({ current }) => current === undefined).map(({ file }) => file.path).join(', ') || 'nothing'}\n`);
    return { exitCode: 0 };
  }
  for (const outcome of outcomes) {
    if (outcome.current === undefined) {
      await mkdir(resolve(outcome.path, '..'), { recursive: true });
      await writeFile(outcome.path, outcome.file.contents, { encoding: 'utf8', flag: 'wx' });
      write(`Created ${outcome.file.path}\n`);
    }
  }
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
  } catch {
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
  write(`${await hash(secret, { algorithm: 2 })}\n`);
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
    const moduleName = '@copypatch/storage-sqlite';
    const module = await import(moduleName) as { createSQLitePersistence(filename: string): { migrate(): Promise<void>; close(): void; } };
    const persistence = module.createSQLitePersistence(env.COPYPATCH_SQLITE_PATH ?? resolve(cwd, 'copypatch.sqlite'));
    try { await persistence.migrate(); } finally { persistence.close(); }
    return;
  }
  const databaseUrl = env.COPYPATCH_DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing PostgreSQL connection configuration.');
  const moduleName = '@copypatch/storage-postgres';
  const module = await import(moduleName) as { createPostgresPersistence(input: string): { migrate(): Promise<void>; close(): Promise<void>; } };
  const persistence = module.createPostgresPersistence(databaseUrl);
  try { await persistence.migrate(); } finally { await persistence.close(); }
}
function fail(write: (message: string) => void, message: string, exitCode: 1 | 2): CliResult { write(message); return { exitCode }; }
function usage(write: (message: string) => void, exitCode: 0 | 2): CliResult { write('Usage: copypatch init --framework next|astro|react-router|vite-node --storage sqlite|postgres [--dry-run] [--cwd PATH]\n'); return { exitCode }; }
