import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set(['dist', '.turbo', 'node_modules', 'coverage', '.astro']);
const PUBLIC_PACKAGE_PATHS = new Set([
  'packages/core',
  'packages/react',
  'packages/backend',
  'packages/node',
  'packages/next',
  'packages/storage-sqlite',
  'packages/storage-postgres',
]);
const ROOT_DEFAULT_ENTRIES = ['dist', '.turbo', 'coverage'];

function cleanRoot(repoRoot, packagePath) {
  const root = path.resolve(repoRoot);
  if (packagePath === undefined) return root;
  if (typeof packagePath !== 'string' || packagePath.length === 0 || path.isAbsolute(packagePath)) {
    throw new Error('Package clean target must be a public package path.');
  }
  const target = path.resolve(root, packagePath);
  const relative = path.relative(root, target);
  const normalized = relative.split(path.sep).join('/');
  if (relative.startsWith('..') || path.isAbsolute(relative) || !PUBLIC_PACKAGE_PATHS.has(normalized)) {
    throw new Error(`Package clean target is not a public package: ${packagePath}`);
  }
  return target;
}

export function planClean(repoRoot, entries, { dryRun = false, packagePath } = {}) {
  const root = cleanRoot(repoRoot, packagePath);
  return entries.map((entry) => {
    if (!ALLOWED.has(entry) || entry.includes('..') || path.isAbsolute(entry)) throw new Error(`Clean target is not in the allowlist: ${entry}`);
    const target = path.resolve(root, entry);
    if (path.relative(root, target) !== entry) throw new Error(`Clean target escapes repository root: ${entry}`);
    return { relative: entry, target, exists: existsSync(target), dryRun };
  });
}

export async function clean(repoRoot, entries, options) {
  const plan = planClean(repoRoot, entries, options);
  if (!options.dryRun) await Promise.all(plan.filter((item) => item.exists).map((item) => rm(item.target, { recursive: true, force: true, maxRetries: 3 })));
  return plan;
}

export function planDefaultClean(repoRoot, { dryRun = false } = {}) {
  return [
    ...planClean(repoRoot, ROOT_DEFAULT_ENTRIES, { dryRun }),
    ...[...PUBLIC_PACKAGE_PATHS].sort().flatMap((packagePath) => planClean(repoRoot, ['dist'], { dryRun, packagePath })),
  ];
}

export async function cleanDefault(repoRoot, options = {}) {
  const plan = planDefaultClean(repoRoot, options);
  if (!options.dryRun) await Promise.all(plan.filter((item) => item.exists).map((item) => rm(item.target, { recursive: true, force: true, maxRetries: 3 })));
  return plan;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const packageArgument = args.find((arg) => arg.startsWith('--package='));
  const packagePath = packageArgument?.slice('--package='.length);
  if (args.includes('--package') || args.filter((arg) => arg.startsWith('--package=')).length > 1) {
    throw new Error('Use a single --package=<public-package-path> option.');
  }
  const targets = args.filter((arg) => !arg.startsWith('--'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const plan = targets.length || packagePath
    ? await clean(root, targets.length ? targets : ['dist'], { dryRun, packagePath })
    : await cleanDefault(root, { dryRun });
  for (const item of plan) console.log(`${dryRun ? 'Would remove' : 'Removed'} ${item.relative}${item.exists ? '' : ' (absent)'}`);
  if (!packagePath && targets.length === 0) console.log('Retained node_modules; remove dependency trees only with an explicit scoped clean target.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
