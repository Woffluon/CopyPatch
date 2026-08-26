import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseVersion } from './versioning.mjs';

export const MANIFEST_PATHS = Object.freeze([
  'package.json',
  'packages/core/package.json',
  'packages/react/package.json',
  'packages/backend/package.json',
  'packages/node/package.json',
  'packages/next/package.json',
  'packages/storage-sqlite/package.json',
  'packages/storage-postgres/package.json',
]);

export const PUBLISH_PACKAGES = Object.freeze([
  { name: '@copypatch/core', path: 'packages/core' },
  { name: '@copypatch/react', path: 'packages/react' },
  { name: '@copypatch/backend', path: 'packages/backend' },
  { name: '@copypatch/node', path: 'packages/node' },
  { name: '@copypatch/next', path: 'packages/next' },
  { name: '@copypatch/storage-sqlite', path: 'packages/storage-sqlite' },
  { name: '@copypatch/storage-postgres', path: 'packages/storage-postgres' },
]);

export function parseManifest(content, source) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${source}: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Manifest must contain a JSON object: ${source}`);
  }
  parseVersion(manifest.version);
  return manifest;
}

export function assertManifestConsistency(entries, expectedVersion) {
  if (entries.length !== MANIFEST_PATHS.length) {
    throw new Error(`Expected ${MANIFEST_PATHS.length} lockstep manifests, found ${entries.length}.`);
  }

  const root = entries.find((entry) => entry.path === 'package.json');
  if (!root) throw new Error('Root package.json is missing from manifest set.');
  const version = root.manifest.version;
  parseVersion(version);

  const mismatches = entries.filter((entry) => entry.manifest.version !== version);
  if (mismatches.length > 0) {
    throw new Error(`Manifest versions must equal root ${version}: ${mismatches.map((entry) => `${entry.path}=${entry.manifest.version}`).join(', ')}`);
  }
  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`Root package version is ${version}; expected ${expectedVersion}.`);
  }
  return version;
}

export async function readManifestEntries(repoRoot) {
  return Promise.all(MANIFEST_PATHS.map(async (relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath);
    const content = await readFile(absolutePath, 'utf8');
    return {
      path: relativePath,
      absolutePath,
      content,
      manifest: parseManifest(content, relativePath),
    };
  }));
}

function renderManifest(entry, version) {
  const updated = { ...entry.manifest, version };
  const newline = entry.content.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /\r?\n$/.test(entry.content) ? newline : '';
  return `${JSON.stringify(updated, null, 2).replace(/\n/g, newline)}${trailingNewline}`;
}

export async function updateManifestVersionsAtomically(repoRoot, nextVersion, options = {}) {
  parseVersion(nextVersion);
  const entries = await readManifestEntries(repoRoot);
  const currentVersion = assertManifestConsistency(entries);
  if (currentVersion === nextVersion) return false;

  const transactionId = randomUUID();
  const records = [];
  let committed = false;
  try {
    for (const entry of entries) {
      const fileStat = await stat(entry.absolutePath);
      const temporaryPath = `${entry.absolutePath}.${transactionId}.tmp`;
      const backupPath = `${entry.absolutePath}.${transactionId}.bak`;
      await writeFile(temporaryPath, renderManifest(entry, nextVersion), { encoding: 'utf8', mode: fileStat.mode });
      records.push({ ...entry, temporaryPath, backupPath, replaced: false });
    }

    for (const [index, record] of records.entries()) {
      await rename(record.absolutePath, record.backupPath);
      try {
        await rename(record.temporaryPath, record.absolutePath);
        record.replaced = true;
      } catch (error) {
        await rename(record.backupPath, record.absolutePath);
        throw error;
      }
      if (options.afterReplace) await options.afterReplace(index, record.path);
    }

    const updatedEntries = await readManifestEntries(repoRoot);
    assertManifestConsistency(updatedEntries, nextVersion);
    committed = true;
    await Promise.allSettled(records.map((record) => rm(record.backupPath, { force: true })));
    return true;
  } catch (error) {
    if (committed) throw error;
    const rollbackErrors = [];
    for (const record of [...records].reverse()) {
      try {
        if (record.replaced) {
          await rm(record.absolutePath, { force: true });
          await rename(record.backupPath, record.absolutePath);
        }
        await rm(record.temporaryPath, { force: true });
        await rm(record.backupPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], 'Manifest update failed and rollback was incomplete.');
    }
    throw error;
  }
}
