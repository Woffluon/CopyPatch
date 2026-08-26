#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifestEntries, assertManifestConsistency, updateManifestVersionsAtomically } from './manifests.mjs';
import { assertCommitManifestConsistency, readManifestEntriesAtCommit, resolveCommit } from './git-history.mjs';
import { getNextVersion, getVersionBump } from './versioning.mjs';

function parseArguments(args) {
  let repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  let message;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--repo-root') {
      if (!args[index + 1]) throw new Error('--repo-root requires a path.');
      repoRoot = path.resolve(args[index + 1]);
      index += 1;
    } else if (message === undefined) {
      message = args[index];
    } else {
      throw new Error('Pass the exact full commit message as one quoted argument.');
    }
  }
  if (!message) throw new Error('Usage: pnpm release:prepare -- "feat(scope): exact commit message"');
  return { repoRoot, message };
}

export async function prepareVersion(repoRoot, message) {
  resolveCommit(repoRoot, 'HEAD');
  const headVersion = assertCommitManifestConsistency(readManifestEntriesAtCommit(repoRoot, 'HEAD'));
  const workingEntries = await readManifestEntries(repoRoot);
  const workingVersion = assertManifestConsistency(workingEntries);
  const bump = getVersionBump(message);
  const expectedVersion = getNextVersion(headVersion, bump);

  if (workingVersion === expectedVersion) {
    return { changed: false, from: headVersion, to: expectedVersion, bump };
  }
  if (workingVersion !== headVersion) {
    throw new Error(`Working manifests contain ${workingVersion}; expected HEAD version ${headVersion} or prepared version ${expectedVersion}.`);
  }
  if (bump === 'none') {
    return { changed: false, from: headVersion, to: headVersion, bump };
  }

  await updateManifestVersionsAtomically(repoRoot, expectedVersion);
  return { changed: true, from: headVersion, to: expectedVersion, bump };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { repoRoot, message } = parseArguments(process.argv.slice(2));
    const result = await prepareVersion(repoRoot, message);
    if (result.changed) {
      console.log(`Prepared lockstep version: ${result.from} -> ${result.to} (${result.bump})`);
    } else if (result.bump === 'none') {
      console.log(`Commit type does not change version (${result.to}).`);
    } else {
      console.log(`Lockstep version already prepared: ${result.to}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
