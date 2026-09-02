import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH_PACKAGES } from './manifests.mjs';
import { assertCanonicalTarballs } from './publish-guard.mjs';

async function main() {
  const args = process.argv.slice(2); const outIndex = args.indexOf('--out');
  if (outIndex === -1 || !args[outIndex + 1]) throw new Error('--out requires a tarball directory.');
  const directory = path.resolve(args[outIndex + 1]);
  const tarballs = (await readdir(directory)).filter((file) => file.endsWith('.tgz')).map((file) => path.join(directory, file));
  await assertCanonicalTarballs(tarballs, PUBLISH_PACKAGES.map((item) => item.name));
  console.log('Packed runtime and type export allowlist contract passed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
