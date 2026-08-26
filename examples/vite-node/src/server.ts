import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { copyPatchApiBasePath, handleCopyPatch } from './copypatch';

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
const port = Number(process.env.PORT ?? 5173);

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://copypatch.local').pathname;
  if (pathname === copyPatchApiBasePath || pathname.startsWith(`${copyPatchApiBasePath}/`)) {
    handleCopyPatch(request, response);
    return;
  }
  vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
}).listen(port, () => {
  console.log(`CopyPatch Vite + Node fixture listening on http://localhost:${port}`);
});
