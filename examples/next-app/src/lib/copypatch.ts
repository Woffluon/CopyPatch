import { resolve } from 'node:path';
import type { CopyPatchBackend } from '@copypatch/backend';

let backend: Promise<CopyPatchBackend | undefined> | undefined;
let bootstrapped: Promise<void> | undefined;

/**
 * Builds the backend inside this Node deployment. Preview builds can omit the
 * passphrase hash and render fallback copy without exposing an editor endpoint.
 */
export function getCopyPatchBackend(): Promise<CopyPatchBackend | undefined> {
  if (backend) return backend;
  backend = createBackend();
  return backend;
}

async function createBackend(): Promise<CopyPatchBackend | undefined> {
  const passphraseHash = process.env.COPYPATCH_PASSPHRASE_HASH;
  if (!passphraseHash) return undefined;

  // Native packages must be loaded by Node at runtime, not parsed by the
  // Next client/server webpack compiler.
  const [{ createCopyPatchBackend }, { createSQLitePersistence }] = await Promise.all([
    import(/* webpackIgnore: true */ '@copypatch/backend'),
    import(/* webpackIgnore: true */ '@copypatch/storage-sqlite'),
  ]);

  const persistence = createSQLitePersistence(
    process.env.COPYPATCH_SQLITE_PATH ?? resolve(process.cwd(), 'copypatch.sqlite'),
  );
  const configured = createCopyPatchBackend({ persistence, passphraseHash });
  bootstrapped ??= persistence.migrate();
  return configured;
}

export async function bootstrapCopyPatch(): Promise<CopyPatchBackend> {
  const configured = await getCopyPatchBackend();
  if (!configured || !bootstrapped) {
    throw new Error('Set COPYPATCH_PASSPHRASE_HASH before enabling the CopyPatch API route.');
  }
  await bootstrapped;
  return configured;
}
