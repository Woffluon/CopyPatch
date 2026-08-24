#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH_PACKAGES } from './manifests.mjs';
import { buildPackageTarball } from './pack-package.mjs';
import { getRegistryStatus, queryPackage } from './registry-status.mjs';

function runPublish(tarball, repoRoot) {
  const windowsCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const command = process.platform === 'win32' && existsSync(windowsCli) ? process.execPath : 'npm';
  const args = ['publish', tarball, '--access', 'public', '--provenance'];
  const result = spawnSync(command, command === process.execPath ? [windowsCli, ...args] : args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm publish failed with exit ${result.status}.`);
}

export async function publishPackages(repoRoot, outputDirectory) {
  const initial = await getRegistryStatus(repoRoot);
  if (initial.state === 'bootstrap') throw new Error('All packages require manual npm bootstrap; automated publish is disabled.');
  if (initial.state === 'partial-bootstrap') throw new Error('npm bootstrap is incomplete; automated publish is disabled.');
  await mkdir(outputDirectory, { recursive: true });

  const results = [];
  for (const item of PUBLISH_PACKAGES) {
    const current = await queryPackage(item.name, initial.version);
    if (current.versionExists) {
      results.push({ name: item.name, status: 'skipped-existing' });
      continue;
    }
    const packed = await buildPackageTarball(repoRoot, item.path, outputDirectory);
    runPublish(packed.tarball, repoRoot);
    results.push({ name: item.name, status: 'published' });
  }
  return { version: initial.version, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const outputIndex = args.indexOf('--out');
    if (outputIndex === -1 || !args[outputIndex + 1]) throw new Error('--out requires a temporary pack directory.');
    const repoRootIndex = args.indexOf('--repo-root');
    const repoRoot = repoRootIndex === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') : path.resolve(args[repoRootIndex + 1]);
    const result = await publishPackages(repoRoot, path.resolve(args[outputIndex + 1]));
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = result.results.map((entry) => `- ${entry.name}@${result.version}: ${entry.status}`).join('\n');
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### npm publish result\n${rows}\n`, 'utf8');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
