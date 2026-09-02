import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function main() {
  const backendRequire = createRequire(new URL('../packages/backend/package.json', import.meta.url));
  const argon2 = await import(pathToFileURL(backendRequire.resolve('@node-rs/argon2')).href);
  if (typeof argon2.hash !== 'function') throw new Error('Argon2 native binding did not expose hash().');
  const { createSQLitePersistence } = await import('../packages/storage-sqlite/dist/index.js');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'copypatch-native-runtime-'));
  try {
    const persistence = createSQLitePersistence(path.join(directory, 'copypatch.sqlite'));
    try { await persistence.migrate(); } finally { persistence.close(); }
    const cli = spawnSync(process.execPath, ['packages/node/dist/cli/bin.js', '--help'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    if (cli.status !== 0) throw new Error(cli.stderr || cli.stdout || 'copypatch --help failed.');
  } finally { await rm(directory, { recursive: true, force: true }); }
  console.log('Native SQLite migrate-close, Argon2 load, and CLI help passed.');
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
