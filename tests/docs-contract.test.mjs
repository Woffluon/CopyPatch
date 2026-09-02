import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { extractMdxSnippetConstants } from '../scripts/verify-docs.mjs';

test('documentation content passes its locale and metadata contract', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-docs.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('documentation verifier extracts the custom-auth and Next route/fallback MDX snippets', async () => {
  const [server, next] = await Promise.all([
    readFile('apps/site/src/content/docs/en/server.mdx', 'utf8'),
    readFile('apps/site/src/content/docs/en/nextjs.mdx', 'utf8'),
  ]);
  const snippets = [...extractMdxSnippetConstants(server, 'server.mdx'), ...extractMdxSnippetConstants(next, 'nextjs.mdx')];
  const byName = new Map(snippets.map((snippet) => [snippet.name, snippet.code]));

  assert.match(byName.get('customAuthAdapter') ?? '', /CopyPatchAuthAdapter/);
  assert.match(byName.get('routeHandler') ?? '', /createCopyPatchRouteHandlers/);
  assert.match(byName.get('serverPage') ?? '', /fallback:/);
});
