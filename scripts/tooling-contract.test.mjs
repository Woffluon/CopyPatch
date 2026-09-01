import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAuditReport, validateAllowlist } from './audit-policy.mjs';
import { collectBundleAssets } from './measure-bundle.mjs';
import { planClean } from './safe-clean.mjs';
import { collectSourceContracts, extractCanonicalSnippets } from './verify-docs.mjs';

test('audit policy reports low findings and rejects unapproved moderate findings', () => {
  const report = {
    vulnerabilities: {
      low: { severity: 'low', via: [{ source: 1, name: 'low-package', url: 'https://example.test/low' }] },
      moderate: { severity: 'moderate', via: [{ source: 2, name: 'moderate-package', url: 'https://example.test/moderate' }] },
    },
  };
  const findings = parseAuditReport(report);
  assert.equal(findings.length, 2);
  assert.deepEqual(validateAllowlist(findings, []), {
    failures: ['moderate-package#2'],
    reported: ['low-package#1', 'moderate-package#2'],
  });
});

test('audit allowlist requires a future expiry and complete ownership record', () => {
  const finding = { id: 'GHSA-example', packageName: 'fixture', severity: 'high' };
  assert.deepEqual(validateAllowlist([finding], [{
    id: 'GHSA-example',
    scope: 'fixture',
    owner: 'security@example.test',
    reason: 'Upstream fix pending.',
    expires: '2999-01-01',
  }]), { failures: [], reported: ['fixture#GHSA-example'] });
  assert.throws(() => validateAllowlist([finding], [{ id: 'GHSA-example', scope: 'fixture' }]), /owner/);
});

test('safe clean only plans an explicit repository allowlist', () => {
  const root = path.resolve(process.cwd());
  assert.deepEqual(planClean(root, ['dist', 'node_modules'], { dryRun: true }).map((entry) => entry.relative), ['dist', 'node_modules']);
  assert.throws(() => planClean(root, ['..'], { dryRun: true }), /allowlist/);
});

test('bundle accounting separates public initial assets from lazy editor-only assets', () => {
  const assets = collectBundleAssets({
    'out/public.js': { entryPoint: 'public', bytes: 100, imports: [{ path: 'out/shared.js', kind: 'import-statement' }] },
    'out/editor.js': { entryPoint: 'editor', bytes: 90, imports: [{ path: 'out/shared.js', kind: 'import-statement' }, { path: 'out/editor-only.js', kind: 'import-statement' }] },
    'out/shared.js': { bytes: 50, imports: [] },
    'out/editor-only.js': { bytes: 40, imports: [] },
  });
  assert.deepEqual(assets.initial.sort(), ['out/public.js', 'out/shared.js']);
  assert.deepEqual(assets.lazy.sort(), ['out/editor-only.js', 'out/editor.js']);
});

test('documentation verifier extracts canonical snippets and derives source contracts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'copypatch-docs-contract-'));
  try {
    const source = path.join(directory, 'source.ts');
    await writeFile(source, "export type ErrorCode = 'ONE' | 'TWO';\nexport const API_PATH = '/api';\n", 'utf8');
    const snippets = extractCanonicalSnippets('```ts canonical\nexport const value: number = 1;\n```');
    assert.deepEqual(snippets, [{ language: 'ts', code: 'export const value: number = 1;\n' }]);
    const contracts = await collectSourceContracts(directory, [{ file: 'source.ts', kind: 'core' }]);
    assert.deepEqual(contracts.errorCodes, ['ONE', 'TWO']);
    assert.deepEqual(contracts.paths, ['/api']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
