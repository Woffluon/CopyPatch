import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { discoverRelease } from './discover-release.mjs';
import { getValidatedVersionHistory, runGit } from './git-history.mjs';
import {
  MANIFEST_PATHS,
  PUBLISH_PACKAGES,
  assertManifestConsistency,
  readManifestEntries,
  updateManifestVersionsAtomically,
} from './manifests.mjs';
import { buildPackageTarball, transformWorkspaceDependencies } from './pack-package.mjs';
import { packAllPackages } from './pack-packages.mjs';
import { prepareVersion } from './prepare-version.mjs';
import { classifyRegistryRecords } from './registry-status.mjs';
import { getNextVersion, getVersionBump, parseVersion } from './versioning.mjs';

async function withTemporaryDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'copypatch-release-test-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function manifestFor(relativePath, version, files = []) {
  const packageEntry = PUBLISH_PACKAGES.find((entry) => `${entry.path}/package.json` === relativePath);
  return {
    name: relativePath === 'package.json' ? 'fixture-root' : packageEntry.name,
    version,
    private: relativePath === 'package.json',
    type: 'module',
    ...(files.length ? { files } : {}),
  };
}

async function writeManifestFixture(repoRoot, version = '0.1.0') {
  for (const relativePath of MANIFEST_PATHS) {
    const absolutePath = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(manifestFor(relativePath, version), null, 2)}\n`, 'utf8');
  }
}

function commit(repoRoot, message) {
  runGit(repoRoot, ['add', '--all']);
  runGit(repoRoot, ['-c', 'user.name=CopyPatch-Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', message]);
  return runGit(repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
}

async function createVersionedRepository(repoRoot) {
  await writeManifestFixture(repoRoot);
  runGit(repoRoot, ['init', '--quiet', '--initial-branch=main']);
  commit(repoRoot, 'chore: initialize fixture');
  const markerPath = path.join(repoRoot, 'scripts/release/versioning.mjs');
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(markerPath, '// version contract marker\n', 'utf8');
  const prepared = await prepareVersion(repoRoot, 'feat!: establish public release contract');
  assert.deepEqual(prepared, { changed: true, from: '0.1.0', to: '1.0.0', bump: 'major' });
  assert.deepEqual(await prepareVersion(repoRoot, 'feat!: establish public release contract'), {
    changed: false,
    from: '0.1.0',
    to: '1.0.0',
    bump: 'major',
  });
  const releaseCommit = commit(repoRoot, 'feat!: establish public release contract');
  return { releaseCommit };
}

function readTarEntry(archive, wantedName) {
  const tar = gunzipSync(archive);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const sizeText = tar.subarray(offset + 124, offset + 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const start = offset + 512;
    if (name === wantedName) return tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Tar entry not found: ${wantedName}`);
}

test('Conventional Commit policy maps exact SemVer bumps', () => {
  assert.equal(getVersionBump('feat(parser): add ranges'), 'minor');
  assert.equal(getVersionBump('fix(ui): avoid crash'), 'patch');
  assert.equal(getVersionBump('perf: reduce copies'), 'patch');
  assert.equal(getVersionBump('refactor(core): split parser'), 'patch');
  assert.equal(getVersionBump('build: update artifacts'), 'patch');
  assert.equal(getVersionBump('security(auth): reject replay'), 'patch');
  for (const type of ['docs', 'ci', 'test', 'chore']) assert.equal(getVersionBump(`${type}: routine update`), 'none');
  assert.equal(getVersionBump('fix(ci): update workflow actions'), 'none');
  assert.equal(getVersionBump('feat!: initial stable API'), 'major');
  assert.equal(getVersionBump('fix: migrate format\n\nBREAKING CHANGE: old files are unsupported'), 'major');
  assert.equal(getNextVersion('0.1.0', 'major'), '1.0.0');
  assert.deepEqual(parseVersion('12.34.56'), { major: 12, minor: 34, patch: 56 });
  assert.throws(() => getVersionBump('style: unsupported type'), /Invalid Conventional Commit/);
  assert.throws(() => getVersionBump('feat(Bad): invalid scope'), /Invalid Conventional Commit/);
  assert.throws(() => parseVersion('01.0.0'), /Unsupported release version/);
});

test('v2 release publishes the seven embedded-runtime packages in lockstep', () => {
  assert.deepEqual(PUBLISH_PACKAGES, [
    { name: '@copypatch/core', path: 'packages/core' },
    { name: '@copypatch/react', path: 'packages/react' },
    { name: '@copypatch/backend', path: 'packages/backend' },
    { name: '@copypatch/node', path: 'packages/node' },
    { name: '@copypatch/next', path: 'packages/next' },
    { name: '@copypatch/storage-sqlite', path: 'packages/storage-sqlite' },
    { name: '@copypatch/storage-postgres', path: 'packages/storage-postgres' },
  ]);
  assert.deepEqual(MANIFEST_PATHS, [
    'package.json',
    ...PUBLISH_PACKAGES.map(({ path: packagePath }) => `${packagePath}/package.json`),
  ]);
});

test('CI verifies Node 20 and 24 with PostgreSQL, coverage, and browser acceptance', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}/);
  assert.match(workflow, /node-version:\s*\[20,\s*24\]/);
  assert.match(workflow, /services:\s*\r?\n\s+postgres:/);
  assert.match(workflow, /pnpm test:coverage/);
  assert.match(workflow, /pnpm test:e2e/);
});

test('publish gate re-runs PostgreSQL contracts, coverage, and seven-package tarball inspection', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /publish:\s*\r?\n[\s\S]*?services:\s*\r?\n\s+postgres:/);
  assert.match(workflow, /COPYPATCH_TEST_POSTGRES_URL:/);
  assert.match(workflow, /pnpm test:coverage/);
  assert.match(workflow, /pnpm release:pack/);
});

test('lockstep manifest update is idempotent and rolls back every file on failure', async () => {
  await withTemporaryDirectory(async (repoRoot) => {
    await writeManifestFixture(repoRoot);
    assert.equal(assertManifestConsistency(await readManifestEntries(repoRoot)), '0.1.0');
    assert.equal(await updateManifestVersionsAtomically(repoRoot, '1.0.0'), true);
    assert.equal(await updateManifestVersionsAtomically(repoRoot, '1.0.0'), false);
    assert.equal(assertManifestConsistency(await readManifestEntries(repoRoot)), '1.0.0');

    await updateManifestVersionsAtomically(repoRoot, '0.1.0');
    await assert.rejects(
      updateManifestVersionsAtomically(repoRoot, '1.0.0', {
        afterReplace(index) {
          if (index === 0) throw new Error('injected transaction failure');
        },
      }),
      /injected transaction failure/,
    );
    assert.equal(assertManifestConsistency(await readManifestEntries(repoRoot)), '0.1.0');
  });
});

test('major release preparation supports the legacy server-to-seven-package topology transition', async () => {
  await withTemporaryDirectory(async (repoRoot) => {
    const legacyPaths = [
      'package.json',
      'packages/core/package.json',
      'packages/react/package.json',
      'packages/server/package.json',
      'packages/next/package.json',
    ];
    for (const relativePath of legacyPaths) {
      const absolutePath = path.join(repoRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      const name = relativePath === 'package.json'
        ? 'fixture-root'
        : `@copypatch/${relativePath.split('/')[1]}`;
      await writeFile(absolutePath, `${JSON.stringify({ name, version: '1.0.1', private: relativePath === 'package.json' }, null, 2)}\n`, 'utf8');
    }
    runGit(repoRoot, ['init', '--quiet', '--initial-branch=main']);
    commit(repoRoot, 'chore: legacy release topology');

    await writeManifestFixture(repoRoot, '1.0.1');
    const prepared = await prepareVersion(repoRoot, 'feat!: replace standalone server with embedded backend');
    assert.deepEqual(prepared, { changed: true, from: '1.0.1', to: '2.0.0', bump: 'major' });
    assert.equal(assertManifestConsistency(await readManifestEntries(repoRoot)), '2.0.0');
  });
});

test('prepare, first-parent validation, discovery, and tag recovery form one contract', async () => {
  await withTemporaryDirectory(async (repoRoot) => {
    const { releaseCommit } = await createVersionedRepository(repoRoot);
    assert.equal(assertManifestConsistency(await readManifestEntries(repoRoot)), '1.0.0');
    assert.equal(getValidatedVersionHistory(repoRoot, 'HEAD').length, 1);

    await writeFile(path.join(repoRoot, 'notes.txt'), 'one\n', 'utf8');
    const docsCommit = commit(repoRoot, 'docs: add release notes');
    const discovered = discoverRelease(repoRoot, docsCommit);
    assert.deepEqual(discovered, { sha: docsCommit, version: '1.0.0', tag: 'v1.0.0', reason: 'version-change' });

    runGit(repoRoot, ['tag', 'v1.0.0', docsCommit]);
    assert.equal(discoverRelease(repoRoot, docsCommit).reason, 'matching-tag-recovery');
    await writeFile(path.join(repoRoot, 'notes.txt'), 'two\n', 'utf8');
    const laterDocsCommit = commit(repoRoot, 'docs: clarify release notes');
    assert.equal(discoverRelease(repoRoot, laterDocsCommit), null);
    assert.equal(releaseCommit.length, 40);
  });
});

test('history rejects a version transition that disagrees with commit type', async () => {
  await withTemporaryDirectory(async (repoRoot) => {
    await createVersionedRepository(repoRoot);
    await updateManifestVersionsAtomically(repoRoot, '1.1.0');
    commit(repoRoot, 'docs: invalid version transition');
    assert.throws(() => getValidatedVersionHistory(repoRoot, 'HEAD'), /requires version 1\.0\.0 \(none\), but contains 1\.1\.0/);
  });
});

test('registry states distinguish bootstrap, rerun, and partial publication', () => {
  const records = PUBLISH_PACKAGES.map(({ name }) => ({ name, packageExists: false, versionExists: false }));
  assert.equal(classifyRegistryRecords(records), 'bootstrap');
  records[0] = { name: records[0].name, packageExists: true, versionExists: true };
  assert.equal(classifyRegistryRecords(records), 'partial-bootstrap');
  for (const record of records) record.packageExists = true;
  assert.equal(classifyRegistryRecords(records), 'publish');
  for (const record of records) record.versionExists = true;
  assert.equal(classifyRegistryRecords(records), 'complete');
});

test('temporary npm tarball contains exact lockstep dependencies, never workspace protocol', async () => {
  await withTemporaryDirectory(async (repoRoot) => {
    await writeManifestFixture(repoRoot, '1.2.3');
    const corePath = path.join(repoRoot, 'packages/core/package.json');
    const core = JSON.parse(await readFile(corePath, 'utf8'));
    core.files = ['dist'];
    core.dependencies = { '@copypatch/react': 'workspace:*' };
    await writeFile(corePath, `${JSON.stringify(core, null, 2)}\n`, 'utf8');
    await mkdir(path.join(repoRoot, 'packages/core/dist'), { recursive: true });
    await writeFile(path.join(repoRoot, 'packages/core/dist/index.js'), 'export const fixture = true;\n', 'utf8');
    await writeFile(path.join(repoRoot, 'packages/core/README.md'), '# Core fixture\n', 'utf8');
    await writeFile(path.join(repoRoot, 'LICENSE'), `fixture-${randomUUID()}\n`, 'utf8');
    const outputDirectory = path.join(repoRoot, 'packs');
    const packed = await buildPackageTarball(repoRoot, 'packages/core', outputDirectory);
    assert.equal(packed.manifest.dependencies['@copypatch/react'], '1.2.3');
    const archiveManifest = JSON.parse(readTarEntry(await readFile(packed.tarball), 'package/package.json').toString('utf8'));
    assert.equal(archiveManifest.dependencies['@copypatch/react'], '1.2.3');
    assert.equal(JSON.stringify(archiveManifest).includes('workspace:'), false);
    assert.equal(readTarEntry(await readFile(packed.tarball), 'package/README.md').toString('utf8'), '# Core fixture\n');
    assert.throws(
      () => transformWorkspaceDependencies({ name: 'bad', dependencies: { x: 'workspace:^' } }, '1.2.3'),
      /Unsupported workspace range/,
    );
  });
});

test('seven-package pack inspection rejects unexpected files and returns every public package', async () => {
  await withTemporaryDirectory(async (repoRoot) => {
    await writeManifestFixture(repoRoot, '2.0.0');
    await writeFile(path.join(repoRoot, 'LICENSE'), 'fixture license\n', 'utf8');
    for (const { path: packagePath } of PUBLISH_PACKAGES) {
      const manifestPath = path.join(repoRoot, packagePath, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.files = ['dist'];
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await mkdir(path.join(repoRoot, packagePath, 'dist'), { recursive: true });
      await writeFile(path.join(repoRoot, packagePath, 'dist/index.js'), 'export {};\n', 'utf8');
      await writeFile(path.join(repoRoot, packagePath, 'README.md'), `# ${manifest.name}\n`, 'utf8');
    }
    const results = await packAllPackages(repoRoot, path.join(repoRoot, 'packs'));
    assert.deepEqual(results.map(({ name }) => name), PUBLISH_PACKAGES.map(({ name }) => name));
    for (const result of results) {
      assert.equal(result.entries.includes('package/package.json'), true);
      assert.equal(result.entries.includes('package/dist/index.js'), true);
    }
  });
});
