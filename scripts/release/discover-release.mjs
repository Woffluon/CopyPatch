#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCommitManifestConsistency,
  getValidatedVersionHistory,
  listFirstParentCommits,
  readManifestEntriesAtCommit,
  resolveCommit,
  runGit,
} from './git-history.mjs';
import { compareVersions, parseVersion } from './versioning.mjs';

function semanticTags(repoRoot, targetSha, firstParentCommits) {
  const commitIndexes = new Map(firstParentCommits.map((commit, index) => [commit, index]));
  const lines = runGit(repoRoot, ['tag', '--merged', targetSha, '--list', 'v*']).stdout.split(/\r?\n/).filter(Boolean);
  const tags = [];
  for (const tag of lines) {
    const version = tag.slice(1);
    try {
      parseVersion(version);
    } catch {
      continue;
    }
    const sha = runGit(repoRoot, ['rev-list', '-n', '1', tag]).stdout.trim();
    if (!commitIndexes.has(sha)) {
      throw new Error(`Release tag ${tag} must point into first-parent history.`);
    }
    const manifestVersion = assertCommitManifestConsistency(readManifestEntriesAtCommit(repoRoot, sha));
    if (manifestVersion !== version) {
      throw new Error(`Release tag ${tag} points to manifest version ${manifestVersion}.`);
    }
    tags.push({ tag, version, sha, index: commitIndexes.get(sha) });
  }
  return tags.sort((left, right) => compareVersions(left.version, right.version));
}

export function discoverRelease(repoRoot, target = 'HEAD') {
  const targetSha = resolveCommit(repoRoot, target);
  const firstParentCommits = listFirstParentCommits(repoRoot, targetSha);
  const targetIndex = firstParentCommits.length - 1;
  const targetVersion = assertCommitManifestConsistency(readManifestEntriesAtCommit(repoRoot, targetSha));
  const history = getValidatedVersionHistory(repoRoot, targetSha);
  if (history.length === 0) return null;

  const tags = semanticTags(repoRoot, targetSha, firstParentCommits);
  const latestTag = tags.at(-1);
  if (latestTag && compareVersions(latestTag.version, targetVersion) > 0) {
    throw new Error(`Reachable tag ${latestTag.tag} is newer than target version ${targetVersion}.`);
  }

  const baseIndex = latestTag?.index ?? -1;
  const historyIndexes = new Map(firstParentCommits.map((commit, index) => [commit, index]));
  const candidates = history.filter((entry) => entry.bump !== 'none' && historyIndexes.get(entry.sha) > baseIndex);
  const desiredTag = `v${targetVersion}`;
  const desiredExisting = tags.find((entry) => entry.tag === desiredTag);

  if (candidates.length === 0) {
    if (desiredExisting?.index === targetIndex) {
      return { sha: targetSha, version: targetVersion, tag: desiredTag, reason: 'matching-tag-recovery' };
    }
    return null;
  }

  const latestCandidate = candidates.at(-1);
  if (latestCandidate.version !== targetVersion) {
    throw new Error(`Latest release change is ${latestCandidate.version}, but target contains ${targetVersion}.`);
  }
  if (desiredExisting && desiredExisting.sha !== targetSha) {
    throw new Error(`Conflicting immutable tag ${desiredTag} points to ${desiredExisting.sha}, not ${targetSha}.`);
  }
  return {
    sha: targetSha,
    version: targetVersion,
    tag: desiredTag,
    reason: desiredExisting ? 'matching-tag-recovery' : 'version-change',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    let repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    let target = 'HEAD';
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--repo-root' && args[index + 1]) repoRoot = path.resolve(args[++index]);
      else if (args[index] === '--target' && args[index + 1]) target = args[++index];
      else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
    const release = discoverRelease(repoRoot, target);
    const json = JSON.stringify(release);
    console.log(json);
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_OUTPUT, `needed=${Boolean(release)}\n`, 'utf8');
      appendFileSync(process.env.GITHUB_OUTPUT, `release=${json}\n`, 'utf8');
      if (release) {
        appendFileSync(process.env.GITHUB_OUTPUT, `sha=${release.sha}\nversion=${release.version}\ntag=${release.tag}\n`, 'utf8');
      }
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import('node:fs');
      const summary = release
        ? `### Release discovery\nSelected ${release.tag} at ${release.sha} (${release.reason}).\n`
        : '### Release discovery\nNo version change since latest reachable release tag; publish skipped.\n';
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
