import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAuditReport, validateAllowlist } from './audit-policy.mjs';
import { collectBundleAssets } from './measure-bundle.mjs';
import { planClean, planDefaultClean } from './safe-clean.mjs';
import { collectSourceContracts, extractCanonicalSnippets } from './verify-docs.mjs';
import { PACKAGE_DECLARATION_EXPORT_SNAPSHOT, PACKAGE_RUNTIME_EXPORT_SNAPSHOT, assertNamedExports, assertPackedExports } from './release/packed-contract.mjs';
import { assertCanonicalTarballs } from './release/publish-guard.mjs';
import { resolveCorepackInvocation, resolvePnpmInvocation } from './pnpm-command.mjs';
import { SOURCE_PUBLISH_GUARD } from './release/pack-package.mjs';

test('audit policy reports low findings and rejects unapproved moderate findings', () => {
  const report = {
    vulnerabilities: {
      low: { severity: 'low', via: [{ source: 1, name: 'low-package', url: 'https://example.test/low' }] },
      moderate: { severity: 'moderate', via: [{ source: 2, name: 'moderate-package', url: 'https://example.test/moderate' }] },
    },
  };
  const findings = parseAuditReport(report);
  assert.equal(findings.length, 2);
  assert.deepEqual(validateAllowlist(findings, []), {
    failures: ['moderate-package#2'],
    reported: ['low-package#1', 'moderate-package#2'],
  });
});

test('audit allowlist requires a future expiry and complete ownership record', () => {
  const finding = { id: 'GHSA-example', packageName: 'fixture', severity: 'high' };
  assert.deepEqual(validateAllowlist([finding], [{
    id: 'GHSA-example',
    scope: 'fixture',
    owner: 'security@example.test',
    reason: 'Upstream fix pending.',
    expires: '2999-01-01',
  }]), { failures: [], reported: ['fixture#GHSA-example'] });
  assert.throws(() => validateAllowlist([finding], [{ id: 'GHSA-example', scope: 'fixture' }]), /owner/);
});

test('safe clean only plans an explicit repository allowlist', () => {
  const root = path.resolve(process.cwd());
  assert.deepEqual(planClean(root, ['dist', 'node_modules'], { dryRun: true }).map((entry) => entry.relative), ['dist', 'node_modules']);
  assert.throws(() => planClean(root, ['..'], { dryRun: true }), /allowlist/);
});

test('safe clean confines a public package clean script to that package dist directory', () => {
  const root = path.resolve(process.cwd());
  const [entry] = planClean(root, ['dist'], { dryRun: true, packagePath: 'packages/core' });
  assert.equal(entry.target, path.join(root, 'packages', 'core', 'dist'));
  assert.throws(() => planClean(root, ['dist'], { dryRun: true, packagePath: 'packages/not-public' }), /public package/);
});

test('root safe clean plans every public package dist while intentionally retaining node_modules', () => {
  const plan = planDefaultClean(process.cwd(), { dryRun: true });
  assert.equal(plan.some((entry) => entry.target.endsWith(path.join('packages', 'core', 'dist'))), true);
  assert.equal(plan.some((entry) => entry.target.endsWith(path.join('packages', 'storage-postgres', 'dist'))), true);
  assert.equal(plan.some((entry) => entry.relative === 'node_modules'), false);
});

test('root and package clean CLIs complete real dry runs without deleting files', () => {
  for (const args of [['scripts/safe-clean.mjs', '--dry-run'], ['scripts/safe-clean.mjs', '--package=packages/core', '--dry-run']]) {
    const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Would remove dist/);
  }
});

test('all public manifests use the portable clean command, preserve the CLI side effect, and omit redundant module fields', async () => {
  const packagePaths = ['core', 'react', 'backend', 'node', 'next', 'storage-sqlite', 'storage-postgres'];
  const manifests = await Promise.all(packagePaths.map(async (packageName) => JSON.parse(await readFile(`packages/${packageName}/package.json`, 'utf8'))));

  for (const manifest of manifests.filter((manifest) => manifest.name !== '@copypatch/node')) {
    assert.equal(manifest.sideEffects, false, `${manifest.name} must declare sideEffects: false`);
    assert.match(manifest.scripts.clean, /^node \.\.\/\.\.\/scripts\/safe-clean\.mjs --package=packages\//);
    assert.equal('module' in manifest, false, `${manifest.name} has a redundant module field`);
    assert.equal(manifest.scripts.prepublishOnly, SOURCE_PUBLISH_GUARD);
  }
  const nodeManifest = manifests.find((manifest) => manifest.name === '@copypatch/node');
  assert.deepEqual(nodeManifest.sideEffects, ['./dist/cli/bin.js']);
  assert.match(nodeManifest.scripts.clean, /^node \.\.\/\.\.\/scripts\/safe-clean\.mjs --package=packages\/node$/);
  assert.equal('module' in nodeManifest, false);
  assert.equal(nodeManifest.scripts.prepublishOnly, SOURCE_PUBLISH_GUARD);
});

test('npm publish dry-run is rejected from a source package directory', () => {
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const invocation = process.platform === 'win32' && existsSync(npmCli)
    ? { command: process.execPath, args: [npmCli, 'publish', '--dry-run'] }
    : { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['publish', '--dry-run'] };
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: path.join(process.cwd(), 'packages', 'core'),
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, 'source package publish dry-run must fail');
  assert.match(`${result.stdout}\n${result.stderr}`, /Direct publishing from a package source directory is forbidden/);
});

test('Windows pnpm resolution uses the executable behind a pnpm.cmd shim', () => {
  const command = 'C:\\pnpm\\bin\\pnpm.cmd';
  const executable = 'C:\\pnpm\\global\\pnpm.exe';
  assert.deepEqual(resolvePnpmInvocation({
    platform: 'win32',
    env: { PNPM_HOME: 'C:\\pnpm\\bin' },
    readFile: (file) => {
      assert.equal(file, command);
      return '@"%~dp0\\..\\global\\pnpm.exe" %*';
    },
    exists: (file) => file === executable,
  }), { command: executable, prefix: [] });
});

test('Windows Corepack resolution invokes its JavaScript CLI without spawning a cmd shim', () => {
  const directory = 'C:\\Program Files\\nodejs';
  const corepackCli = `${directory}\\node_modules\\corepack\\dist\\corepack.js`;
  assert.deepEqual(resolveCorepackInvocation({
    platform: 'win32',
    env: { PATH: directory },
    exists: (file) => [
      `${directory}\\corepack.cmd`,
      `${directory}\\node.exe`,
      corepackCli,
    ].includes(file),
  }), { command: `${directory}\\node.exe`, prefix: [corepackCli] });
});

test('bundle accounting separates public initial assets from lazy editor-only assets', () => {
  const assets = collectBundleAssets({
    'out/public.js': { entryPoint: 'public', bytes: 100, imports: [{ path: 'out/shared.js', kind: 'import-statement' }] },
    'out/editor.js': { entryPoint: 'editor', bytes: 90, imports: [{ path: 'out/shared.js', kind: 'import-statement' }, { path: 'out/editor-only.js', kind: 'import-statement' }] },
    'out/shared.js': { bytes: 50, imports: [] },
    'out/editor-only.js': { bytes: 40, imports: [] },
  });
  assert.deepEqual(assets.initial.sort(), ['out/public.js', 'out/shared.js']);
  assert.deepEqual(assets.lazy.sort(), ['out/editor-only.js', 'out/editor.js']);
});

test('documentation verifier extracts canonical snippets and derives source contracts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'copypatch-docs-contract-'));
  try {
    const source = path.join(directory, 'source.ts');
    await writeFile(source, "export type ErrorCode = 'ONE' | 'TWO';\nexport const API_PATH = '/api';\n", 'utf8');
    const snippets = extractCanonicalSnippets('```ts canonical\nexport const value: number = 1;\n```');
    assert.deepEqual(snippets, [{ language: 'ts', code: 'export const value: number = 1;\n' }]);
    const contracts = await collectSourceContracts(directory, [{ file: 'source.ts', kind: 'core' }]);
    assert.deepEqual(contracts.errorCodes, ['ONE', 'TWO']);
    assert.deepEqual(contracts.paths, ['/api']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('packed export contract rejects an undeclared public runtime export', () => {
  assert.throws(() => assertPackedExports({
    name: '@copypatch/core', exports: { '.': { types: './dist/index.d.ts', import: './dist/private.js' } },
  }, ['package/package.json', 'package/dist/index.js', 'package/dist/index.d.ts', 'package/dist/private.js']), /undeclared/);
});

test('packed export contract rejects a missing canonical API snapshot and publishing rejects source directories', async () => {
  assert.throws(() => assertPackedExports({
    name: '@copypatch/core', exports: {},
  }, ['package/package.json', 'package/dist/index.js', 'package/dist/index.d.ts']), /API snapshot/);
  await assert.rejects(assertCanonicalTarballs(['packages/core']), /Direct source publishing is forbidden/);
});

test('named export snapshots reject backend and React internal export leaks', () => {
  assert.throws(() => assertNamedExports('runtime', '@copypatch/backend', [
    ...PACKAGE_RUNTIME_EXPORT_SNAPSHOT['@copypatch/backend'],
    'internalBackendHelper',
  ], PACKAGE_RUNTIME_EXPORT_SNAPSHOT), /named exports/);
  assert.throws(() => assertNamedExports('declaration', '@copypatch/react', [
    ...PACKAGE_DECLARATION_EXPORT_SNAPSHOT['@copypatch/react'],
    'InternalReactState',
  ], PACKAGE_DECLARATION_EXPORT_SNAPSHOT), /named exports/);
});
