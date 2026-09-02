import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('bundle CLI returns a failing process status when a compressed budget is exceeded', () => {
  const result = spawnSync(process.execPath, ['scripts/measure-bundle.mjs', '--initial-gzip=0'], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /Public initial budget exceeded/);
});
