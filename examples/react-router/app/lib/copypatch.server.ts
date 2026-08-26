import { resolve } from 'node:path';
import { createCopyPatchBackend, type CopyPatchBackend } from '@copypatch/backend';
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

let backend: CopyPatchBackend | undefined;
let bootstrap: Promise<void> | undefined;

export async function getCopyPatchBackend(): Promise<CopyPatchBackend> {
  if (!backend) {
    const passphraseHash = process.env.COPYPATCH_PASSPHRASE_HASH;
    if (!passphraseHash) throw new Error('COPYPATCH_PASSPHRASE_HASH is required.');
    const persistence = createSQLitePersistence(
      process.env.COPYPATCH_SQLITE_PATH ?? resolve(process.cwd(), 'copypatch.sqlite'),
    );
    backend = createCopyPatchBackend({ persistence, passphraseHash });
    bootstrap = persistence.migrate();
  }
  await bootstrap;
  return backend;
}
