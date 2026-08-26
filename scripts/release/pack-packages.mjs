#!/usr/bin/env node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PUBLISH_PACKAGES } from './manifests.mjs';
import { buildPackageTarball } from './pack-package.mjs';

function listTarEntries(archive) {
  const tar = gunzipSync(archive);
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const sizeText = tar.subarray(offset + 124, offset + 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    entries.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function packAllPackages(repoRoot, outputDirectory) {
  const results = [];
  for (const item of PUBLISH_PACKAGES) {
    const packed = await buildPackageTarball(repoRoot, item.path, outputDirectory);
    const entries = listTarEntries(await readFile(packed.tarball));
    const unexpected = entries.filter((entry) => ![
      'package/package.json',
      'package/README.md',
      'package/LICENSE',
    ].includes(entry) && !entry.startsWith('package/dist/'));
    if (unexpected.length > 0) {
      throw new Error(`${item.name} tarball contains unexpected files: ${unexpected.join(', ')}`);
    }
    if (!entries.includes('package/package.json') || !entries.includes('package/README.md')) {
      throw new Error(`${item.name} tarball is missing npm metadata.`);
    }
    if (JSON.stringify(packed.manifest).includes('workspace:')) {
      throw new Error(`${item.name} tarball manifest contains a workspace protocol.`);
    }
    results.push({ name: item.name, tarball: packed.tarball, entries });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let temporaryDirectory;
  try {
    const args = process.argv.slice(2);
    const outputIndex = args.indexOf('--out');
    temporaryDirectory = outputIndex === -1 ? await mkdtemp(path.join(os.tmpdir(), 'copypatch-packs-')) : undefined;
    const outputDirectory = outputIndex === -1 ? temporaryDirectory : path.resolve(args[outputIndex + 1]);
    if (!outputDirectory) throw new Error('--out requires a directory.');
    const repoRootIndex = args.indexOf('--repo-root');
    const repoRoot = repoRootIndex === -1
      ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
      : path.resolve(args[repoRootIndex + 1]);
    const results = await packAllPackages(repoRoot, outputDirectory);
    console.log(JSON.stringify(results.map(({ name, entries }) => ({ name, entries }))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
