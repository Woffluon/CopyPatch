import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCopyPatchBackend } from '@copypatch/backend';
import { createNodeHandler } from '@copypatch/node';
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const passphraseHash = process.env.COPYPATCH_PASSPHRASE_HASH;
if (!passphraseHash) throw new Error('COPYPATCH_PASSPHRASE_HASH is required.');

const persistence = createSQLitePersistence(
  process.env.COPYPATCH_SQLITE_PATH ?? resolve(process.cwd(), 'copypatch.sqlite'),
);
const backend = createCopyPatchBackend({ persistence, passphraseHash });
const bootstrap = persistence.migrate();
const handler = createNodeHandler(backend);

export const copyPatchApiBasePath = '/__copypatch/api/v2';

export function handleCopyPatch(request: IncomingMessage, response: ServerResponse): void {
  void bootstrap.then(() => handler(request, response), () => {
    response.statusCode = 500;
    response.end('CopyPatch bootstrap failed.');
  });
}
