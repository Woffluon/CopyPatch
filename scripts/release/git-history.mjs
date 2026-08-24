import { spawnSync } from 'node:child_process';
import { MANIFEST_PATHS, assertManifestConsistency, parseManifest } from './manifests.mjs';
import { getNextVersion, getVersionBump } from './versioning.mjs';

export const VERSION_CONTRACT_PATH = 'scripts/release/versioning.mjs';

export function runGit(repoRoot, args, options = {}) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result;
}

export function resolveCommit(repoRoot, target) {
  const result = runGit(repoRoot, ['rev-parse', '--verify', `${target}^{commit}`]);
  return result.stdout.trim();
}

export function listFirstParentCommits(repoRoot, target) {
  const sha = resolveCommit(repoRoot, target);
  const result = runGit(repoRoot, ['rev-list', '--reverse', '--first-parent', sha]);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

export function showFileAtCommit(repoRoot, commit, relativePath) {
  return runGit(repoRoot, ['show', `${commit}:${relativePath}`]).stdout;
}

export function fileExistsAtCommit(repoRoot, commit, relativePath) {
  return runGit(repoRoot, ['cat-file', '-e', `${commit}:${relativePath}`], { allowFailure: true }).status === 0;
}

export function readManifestEntriesAtCommit(repoRoot, commit) {
  return MANIFEST_PATHS.map((relativePath) => {
    const content = showFileAtCommit(repoRoot, commit, relativePath);
    return { path: relativePath, content, manifest: parseManifest(content, `${commit}:${relativePath}`) };
  });
}

export function getValidatedVersionHistory(repoRoot, target = 'HEAD') {
  const targetSha = resolveCommit(repoRoot, target);
  const commits = listFirstParentCommits(repoRoot, targetSha);
  const contractIndex = commits.findIndex((commit) => fileExistsAtCommit(repoRoot, commit, VERSION_CONTRACT_PATH));
  if (contractIndex === -1) return [];
  if (contractIndex === 0) {
    throw new Error('Version contract must have a parent commit for transition validation.');
  }

  const seenBumpedVersions = new Set();
  const history = [];
  for (let index = contractIndex; index < commits.length; index += 1) {
    const commit = commits[index];
    const parent = commits[index - 1];
    const currentVersion = assertManifestConsistency(readManifestEntriesAtCommit(repoRoot, commit));
    const parentVersion = assertManifestConsistency(readManifestEntriesAtCommit(repoRoot, parent));
    const message = runGit(repoRoot, ['show', '-s', '--format=%B', commit]).stdout.replace(/\r?\n$/, '');
    const bump = getVersionBump(message);
    const expectedVersion = getNextVersion(parentVersion, bump);
    if (currentVersion !== expectedVersion) {
      throw new Error(`Commit ${commit} requires version ${expectedVersion} (${bump}), but contains ${currentVersion}.`);
    }
    if (bump !== 'none') {
      if (seenBumpedVersions.has(currentVersion)) {
        throw new Error(`Release version is reused in first-parent history: ${currentVersion}`);
      }
      seenBumpedVersions.add(currentVersion);
    }
    history.push({ sha: commit, version: currentVersion, tag: `v${currentVersion}`, bump });
  }
  return history;
}
