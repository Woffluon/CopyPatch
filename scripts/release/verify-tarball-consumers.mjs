import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { packAllPackages } from './pack-packages.mjs';
import { PUBLISH_PACKAGES } from './manifests.mjs';
import { assertCanonicalTarballs } from './publish-guard.mjs';
import {
  PACKAGE_DECLARATION_EXPORT_SNAPSHOT,
  PACKAGE_RUNTIME_EXPORT_SNAPSHOT,
  assertNamedExports,
} from './packed-contract.mjs';
import { resolveCorepackInvocation, resolvePnpmInvocation } from '../pnpm-command.mjs';

const ROOT_IMPORTS = PUBLISH_PACKAGES.map((item) => item.name);
const SUBPATH_IMPORTS = ['@copypatch/react/editor', '@copypatch/next/server', '@copypatch/node/cli'];
const PUBLIC_IMPORTS = [...ROOT_IMPORTS, ...SUBPATH_IMPORTS];
const COPY_PATCH_SCAFFOLD_PACKAGES = [
  '@copypatch/backend',
  '@copypatch/next',
  '@copypatch/storage-postgres',
  '@copypatch/storage-sqlite',
];

function command(manager, args) {
  if (manager === 'node') return { executable: process.execPath, args };
  if (manager === 'pnpm') {
    const pnpm = resolvePnpmInvocation();
    return { executable: pnpm.command, args: [...pnpm.prefix, ...args] };
  }
  if (manager === 'yarn') {
    const corepack = resolveCorepackInvocation();
    return { executable: corepack.command, args: [...corepack.prefix, 'yarn', ...args] };
  }
  if (manager === 'npm' && process.platform === 'win32') {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (existsSync(npmCli)) return { executable: process.execPath, args: [npmCli, ...args] };
  }
  return { executable: process.platform === 'win32' ? `${manager}.cmd` : manager, args };
}

function run(manager, args, cwd) {
  const invocation = command(manager, args);
  const result = spawnSync(invocation.executable, invocation.args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${manager} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}

function assertCanonicalPublishDryRun(tarball, cwd) {
  const invocation = command('npm', ['publish', '--dry-run', tarball]);
  const result = spawnSync(invocation.executable, invocation.args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status === 0) return;
  const output = `${result.stdout}\n${result.stderr}`;
  const immutableVersionCollision = output.includes('Tarball Details')
    && output.includes('You cannot publish over the previously published versions');
  if (!immutableVersionCollision) throw new Error(`npm canonical publish dry-run failed: ${output}`);
}

function assertDeclarationExports(directory, sourcePath) {
  const program = ts.createProgram([sourcePath], {
    strict: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: false,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => directory,
      getNewLine: () => '\n',
    }));
  }
  const source = program.getSourceFile(sourcePath);
  if (!source) throw new Error(`TypeScript did not load ${sourcePath}.`);
  const checker = program.getTypeChecker();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (!module) throw new Error(`TypeScript did not resolve declaration module ${specifier}.`);
    assertNamedExports('declaration', specifier, checker.getExportsOfModule(module).map((symbol) => symbol.getName()), PACKAGE_DECLARATION_EXPORT_SNAPSHOT);
  }
}

function assertRuntimeExports(directory) {
  const result = spawnSync(process.execPath, ['runtime.mjs'], { cwd: directory, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`runtime export consumer failed: ${result.stderr || result.stdout}`);
  const exportsBySpecifier = JSON.parse(result.stdout);
  for (const specifier of PUBLIC_IMPORTS) {
    assertNamedExports('runtime', specifier, exportsBySpecifier[specifier] ?? [], PACKAGE_RUNTIME_EXPORT_SNAPSHOT);
  }
}

async function assertScaffold(directory, framework, storage) {
  const scaffold = path.join(directory, 'scaffolds', `${framework}-${storage}`);
  await mkdir(scaffold, { recursive: true });
  const hostDependencies = framework === 'next'
    ? { next: '*' }
    : framework === 'astro'
      ? { astro: '*' }
      : framework === 'react-router'
        ? { '@react-router/dev': '*' }
        : {};
  await writeFile(path.join(scaffold, 'package.json'), JSON.stringify({
    name: `copypatch-${framework}-${storage}-scaffold`,
    private: true,
    type: 'module',
    dependencies: hostDependencies,
  }), 'utf8');
  run('node', [
    path.join(directory, 'node_modules/@copypatch/node/dist/cli/bin.js'),
    'init',
    '--framework', framework,
    '--storage', storage,
    '--cwd', scaffold,
  ], directory);

  const manifest = JSON.parse(await readFile(path.join(scaffold, 'package.json'), 'utf8'));
  const expected = [
    '@copypatch/backend',
    storage === 'sqlite' ? '@copypatch/storage-sqlite' : '@copypatch/storage-postgres',
    ...(framework === 'next' ? ['@copypatch/next'] : []),
  ];
  for (const packageName of expected) {
    if (typeof manifest.dependencies?.[packageName] !== 'string') {
      throw new Error(`${framework}/${storage} scaffold did not add direct dependency ${packageName}.`);
    }
  }
  for (const packageName of COPY_PATCH_SCAFFOLD_PACKAGES.filter((name) => !expected.includes(name))) {
    if (packageName in manifest.dependencies) throw new Error(`${framework}/${storage} scaffold added unused dependency ${packageName}.`);
  }

  await writeFile(path.join(scaffold, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['**/*.ts'],
  }), 'utf8');
  run('node', [path.join(directory, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'], scaffold);
}

async function assertConsumer(manager, packed) {
  const directory = await mkdtemp(path.join(os.tmpdir(), `copypatch-${manager}-consumer-`));
  try {
    const tarballs = packed.map((item) => item.tarball);
    const localPackages = Object.fromEntries(packed.map((item) => [
      item.name,
      manager === 'pnpm'
        ? pathToFileURL(item.tarball).href
        : `file:${item.tarball.split(path.sep).join('/')}`,
    ]));
    const manifest = { name: 'copypatch-consumer', private: true, type: 'module' };
    if (manager === 'yarn') manifest.resolutions = localPackages;
    await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest), 'utf8');
    if (manager === 'pnpm') {
      const overrides = Object.entries(localPackages).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`);
      await writeFile(path.join(directory, 'pnpm-workspace.yaml'), [
        'packages: []',
        'allowBuilds:',
        '  "@node-rs/argon2": true',
        '  better-sqlite3: true',
        '  esbuild: true',
        '  sharp: true',
        'overrides:',
        ...overrides,
        '',
      ].join('\n'), 'utf8');
    }
    const install = manager === 'npm'
      ? ['install', '--no-audit', '--no-fund']
      : manager === 'pnpm'
        ? ['add', '--workspace-root']
        : ['add'];
    run(manager, [
      ...install,
      ...tarballs,
      'typescript@5.9.3',
      '@types/node@24',
      '@types/react@19',
      '@types/react-dom@19',
      'react@19',
      'react-dom@19',
      'next@15',
      'astro@7',
      '@react-router/dev@7',
    ], directory);
    await writeFile(path.join(directory, 'types.ts'), PUBLIC_IMPORTS.map((name) => `import '${name}';`).join('\n'), 'utf8');
    await writeFile(path.join(directory, 'runtime.mjs'), [
      `const specifiers = ${JSON.stringify(PUBLIC_IMPORTS)};`,
      'const entries = await Promise.all(specifiers.map(async (specifier) => [specifier, Object.keys(await import(specifier)).sort()]));',
      'process.stdout.write(JSON.stringify(Object.fromEntries(entries)));',
    ].join('\n'), 'utf8');
    await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, module: 'NodeNext', moduleResolution: 'NodeNext', noEmit: true, skipLibCheck: false, types: ['node', 'react', 'react-dom'] }, include: ['types.ts'] }), 'utf8');
    run('node', ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], directory);
    assertDeclarationExports(directory, path.join(directory, 'types.ts'));
    assertRuntimeExports(directory);
    const cjs = spawnSync('node', ['--no-experimental-require-module', '--input-type=commonjs', '-e', "require('@copypatch/core')"], { cwd: directory, encoding: 'utf8', windowsHide: true });
    if (cjs.status === 0) throw new Error(`${manager} consumer unexpectedly accepted a CommonJS CopyPatch import.`);
    run('node', ['node_modules/@copypatch/node/dist/cli/bin.js', '--help'], directory);
    for (const framework of ['next', 'astro', 'react-router', 'vite-node']) {
      for (const storage of ['sqlite', 'postgres']) await assertScaffold(directory, framework, storage);
    }
  } finally {
    if (process.env.COPYPATCH_KEEP_CONSUMER_FIXTURE === '1') console.log(`Retained ${manager} consumer fixture: ${directory}`);
    else await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); const output = await mkdtemp(path.join(os.tmpdir(), 'copypatch-consumer-packs-'));
  try {
    const packed = await packAllPackages(root, output); const tarballs = packed.map((item) => item.tarball);
    await assertCanonicalTarballs(tarballs, PUBLISH_PACKAGES.map((item) => item.name));
    for (const tarball of tarballs) assertCanonicalPublishDryRun(tarball, output);
    const managers = ['npm', 'pnpm', 'yarn'];
    const selectedManager = process.env.COPYPATCH_TEST_PACKAGE_MANAGER;
    if (selectedManager && !managers.includes(selectedManager)) throw new Error(`Unsupported package manager fixture: ${selectedManager}.`);
    const testedManagers = selectedManager ? [selectedManager] : managers;
    for (const manager of testedManagers) await assertConsumer(manager, packed);
    console.log(`Canonical publish dry-runs and ${testedManagers.join(', ')} tarball consumers passed runtime, NodeNext, CJS, CLI, and ${testedManagers.length * 8} compiled scaffold contracts.`);
  } finally { await rm(output, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
