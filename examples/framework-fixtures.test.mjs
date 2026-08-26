import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const file = (path) => resolve(root, path);

async function source(path) {
  return readFile(file(path), 'utf8');
}

async function exists(path) {
  try {
    await stat(file(path));
    return true;
  } catch {
    return false;
  }
}

test('framework fixtures use the v2 same-origin contract', async () => {
  const [nextConfig, nextPage, nextApp, viteConfig, viteApp] = await Promise.all([
    source('examples/next-app/next.config.ts'),
    source('examples/next-app/src/app/page.tsx'),
    source('examples/next-app/src/app/AuraApp.tsx'),
    source('examples/vite-react/vite.config.ts'),
    source('examples/vite-react/src/main.tsx'),
  ]);

  for (const fixture of [nextConfig, nextPage, nextApp, viteConfig, viteApp]) {
    assert.doesNotMatch(fixture, /localhost:4040|api\/v1/);
  }
  assert.match(nextPage, /readPublishedSnapshot/);
  assert.match(nextApp, /__copypatch\/api\/v2/);
  assert.doesNotMatch(nextConfig, /rewrites/);
  assert.doesNotMatch(viteConfig, /proxy/);

  // Next App Router reserves underscore-prefixed folders as private. The
  // percent-encoded source folder keeps the public API URL routable.
  assert.equal(
    await exists('examples/next-app/src/app/%5F%5Fcopypatch/api/v2/[...path]/route.ts'),
    true,
  );
  assert.equal(
    await exists('examples/next-app/src/app/__copypatch/api/v2/[...path]/route.ts'),
    false,
  );
});

test('SSR and Node-host fixtures document their deployment boundary', async () => {
  for (const path of [
    'examples/astro-ssr-react/package.json',
    'examples/astro-ssr-react/astro.config.mjs',
    'examples/astro-ssr-react/README.md',
    'examples/react-router/package.json',
    'examples/react-router/README.md',
    'examples/vite-node/package.json',
    'examples/vite-node/README.md',
  ]) {
    assert.equal(await exists(path), true, `${join('examples', path)} should exist`);
  }

  const [astroReadme, routerReadme, viteReadme, routerRoutes] = await Promise.all([
    source('examples/astro-ssr-react/README.md'),
    source('examples/react-router/README.md'),
    source('examples/vite-node/README.md'),
    source('examples/react-router/app/routes.ts'),
  ]);
  assert.match(astroReadme, /static-only/i);
  assert.match(routerReadme, /Framework Mode/);
  assert.match(viteReadme, /same deployment/i);
  assert.match(routerRoutes, /copyPatchRoutes/);
});
