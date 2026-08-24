#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertManifestConsistency, parseManifest, readManifestEntries } from './manifests.mjs';

const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'];

export function transformWorkspaceDependencies(manifest, version) {
  const transformed = structuredClone(manifest);
  for (const field of DEPENDENCY_FIELDS) {
    if (!transformed[field]) continue;
    for (const [name, range] of Object.entries(transformed[field])) {
      if (range === 'workspace:*') transformed[field][name] = version;
      else if (typeof range === 'string' && range.startsWith('workspace:')) {
        throw new Error(`Unsupported workspace range ${range} for ${name} in ${manifest.name}.`);
      }
    }
  }
  return transformed;
}

function runNpm(args, cwd) {
  const windowsCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const command = process.platform === 'win32' && existsSync(windowsCli) ? process.execPath : 'npm';
  const commandArgs = command === process.execPath ? [windowsCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `npm exited ${result.status}`);
  return result.stdout;
}

export async function buildPackageTarball(repoRoot, packagePath, outputDirectory) {
  const rootVersion = assertManifestConsistency(await readManifestEntries(repoRoot));
  const sourceDirectory = path.resolve(repoRoot, packagePath);
  const relative = path.relative(repoRoot, sourceDirectory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Package path must stay inside repository root.');

  const sourceManifestPath = path.join(sourceDirectory, 'package.json');
  const sourceManifest = parseManifest(await readFile(sourceManifestPath, 'utf8'), `${packagePath}/package.json`);
  if (sourceManifest.version !== rootVersion) throw new Error(`${sourceManifest.name} is not at lockstep version ${rootVersion}.`);
  if (!Array.isArray(sourceManifest.files) || sourceManifest.files.length === 0) throw new Error(`${sourceManifest.name} must declare publish files.`);

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'copypatch-pack-'));
  const stagingDirectory = path.join(temporaryRoot, 'package');
  await mkdir(stagingDirectory);
  try {
    for (const declaredPath of sourceManifest.files) {
      if (typeof declaredPath !== 'string' || path.isAbsolute(declaredPath) || declaredPath.split(/[\\/]/).includes('..')) {
        throw new Error(`Unsafe publish path in ${sourceManifest.name}: ${declaredPath}`);
      }
      await cp(path.join(sourceDirectory, declaredPath), path.join(stagingDirectory, declaredPath), {
        recursive: true,
        errorOnExist: true,
      });
    }
    const transformedManifest = transformWorkspaceDependencies(sourceManifest, rootVersion);
    await writeFile(path.join(stagingDirectory, 'package.json'), `${JSON.stringify(transformedManifest, null, 2)}\n`, 'utf8');
    await cp(path.join(sourceDirectory, 'README.md'), path.join(stagingDirectory, 'README.md'), { errorOnExist: true });
    try {
      await cp(path.join(repoRoot, 'LICENSE'), path.join(stagingDirectory, 'LICENSE'), { errorOnExist: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await mkdir(outputDirectory, { recursive: true });
    const output = runNpm(['pack', stagingDirectory, '--pack-destination', path.resolve(outputDirectory), '--json', '--ignore-scripts'], repoRoot);
    const result = JSON.parse(output);
    if (!Array.isArray(result) || result.length !== 1 || !result[0].filename) throw new Error('npm pack returned an unexpected result.');
    return {
      tarball: path.join(path.resolve(outputDirectory), result[0].filename),
      manifest: transformedManifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const packageIndex = args.indexOf('--package');
    const outputIndex = args.indexOf('--out');
    if (packageIndex === -1 || !args[packageIndex + 1] || outputIndex === -1 || !args[outputIndex + 1]) {
      throw new Error('Usage: node scripts/release/pack-package.mjs --package packages/core --out <directory>');
    }
    const repoRootIndex = args.indexOf('--repo-root');
    const repoRoot = repoRootIndex === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') : path.resolve(args[repoRootIndex + 1]);
    const result = await buildPackageTarball(repoRoot, args[packageIndex + 1], path.resolve(args[outputIndex + 1]));
    console.log(result.tarball);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
