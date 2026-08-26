import { once } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createCopyPatchBackend } from '../../packages/backend/dist/index.js';
import { createNodeHandler } from '../../packages/node/dist/index.js';
import { createSQLitePersistence } from '../../packages/storage-sqlite/dist/index.js';
import { createServer as createViteServer } from '../../examples/vite-node/node_modules/vite/dist/node/index.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const fixtureRoot = resolve(import.meta.dirname);
const runtimeDirectory = process.env.COPYPATCH_E2E_RUNTIME_DIR;
if (!runtimeDirectory) throw new Error('COPYPATCH_E2E_RUNTIME_DIR is required for the E2E fixture.');
await rm(runtimeDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
await mkdir(runtimeDirectory, { recursive: true });
const databasePath = join(runtimeDirectory, 'copypatch.sqlite');
const passphraseHash = '$argon2id$v=19$m=19456,t=2,p=1$+s1EAc04iiLaZthqumI3cQ$8uc7e8XmI/njWKCIRT1Vlc7C4ERypu9JX2JEWsbL0Bg';
const persistence = createSQLitePersistence(databasePath);
const backend = createCopyPatchBackend({ persistence, passphraseHash });
const handleCopyPatch = createNodeHandler(backend);
const vite = await createViteServer({
  root: fixtureRoot,
  appType: 'spa',
  resolve: {
    alias: {
      'react/jsx-runtime': resolve(repositoryRoot, 'packages/react/node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': resolve(repositoryRoot, 'packages/react/node_modules/react/jsx-dev-runtime.js'),
      'react-dom/client': resolve(repositoryRoot, 'packages/react/node_modules/react-dom/client.js'),
      '@copypatch/react': resolve(repositoryRoot, 'packages/react/dist/index.js'),
      react: resolve(repositoryRoot, 'packages/react/node_modules/react/index.js'),
    },
  },
  server: { middlewareMode: true },
});

await persistence.migrate();

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/__copypatch/api/v2')) {
    handleCopyPatch(request, response);
    return;
  }
  vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(4173, '127.0.0.1', resolveListen);
});

let stopping = false;

async function stopHost(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  await once(server, 'close');
  await vite.close();
  persistence.close();
  await rm(runtimeDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  process.exit(exitCode);
}

process.once('SIGINT', () => void stopHost());
process.once('SIGTERM', () => void stopHost());
