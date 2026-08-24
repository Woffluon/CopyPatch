#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertManifestConsistency, readManifestEntries } from './manifests.mjs';
import { getValidatedVersionHistory } from './git-history.mjs';

function parseArguments(args) {
  let repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  let historyTarget;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--repo-root') {
      if (!args[index + 1]) throw new Error('--repo-root requires a path.');
      repoRoot = path.resolve(args[++index]);
    } else if (args[index] === '--history') {
      if (!args[index + 1]) throw new Error('--history requires a git revision.');
      historyTarget = args[++index];
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  return { repoRoot, historyTarget };
}

export async function checkVersion(repoRoot, historyTarget) {
  const version = assertManifestConsistency(await readManifestEntries(repoRoot));
  const history = historyTarget ? getValidatedVersionHistory(repoRoot, historyTarget) : [];
  if (historyTarget && history.length > 0) {
    const targetVersion = history.at(-1).version;
    if (version !== targetVersion) {
      throw new Error(`Working manifest version ${version} differs from ${historyTarget} version ${targetVersion}.`);
    }
  }
  return { version, historyCount: history.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { repoRoot, historyTarget } = parseArguments(process.argv.slice(2));
    const result = await checkVersion(repoRoot, historyTarget);
    console.log(`Lockstep manifest version valid: ${result.version}`);
    if (historyTarget) console.log(`First-parent version contract valid: ${result.historyCount} commit(s).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
