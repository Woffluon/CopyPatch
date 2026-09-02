import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPackedExports, readPackedManifest } from './packed-contract.mjs';

export async function assertCanonicalTarballs(tarballs, expectedNames) {
  if (!tarballs.length) throw new Error('Canonical publish guard requires at least one tarball.');
  const names = new Set();
  for (const tarball of tarballs) {
    if (!tarball.endsWith('.tgz') || path.extname(tarball) !== '.tgz') throw new Error(`Direct source publishing is forbidden; expected a canonical .tgz tarball: ${tarball}`);
    const { entries, manifest } = await readPackedManifest(tarball);
    for (const required of ['package/package.json', 'package/README.md', 'package/LICENSE']) {
      if (!entries.includes(required)) throw new Error(`${tarball} is missing required canonical tarball file: ${required}.`);
    }
    assertPackedExports(manifest, entries);
    if (JSON.stringify(manifest).includes('workspace:')) throw new Error(`${manifest.name} tarball still contains a workspace protocol.`);
    if (manifest.scripts?.prepublishOnly) throw new Error(`${manifest.name} canonical tarball still contains a source-only publish guard.`);
    names.add(manifest.name);
  }
  if (expectedNames) for (const name of expectedNames) if (!names.has(name)) throw new Error(`Canonical publish guard is missing ${name}.`);
  return true;
}

async function main() {
  const tarballs = process.argv.slice(2);
  await assertCanonicalTarballs(tarballs);
  console.log(`Canonical publish guard passed for ${tarballs.length} tarball(s).`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
