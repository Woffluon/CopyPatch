import { spawnSync } from 'node:child_process';
import { resolvePnpmInvocation } from './pnpm-command.mjs';

const connection = process.env.COPYPATCH_TEST_POSTGRES_URL;
if (!connection) {
  console.log('PostgreSQL skip gate is inactive without COPYPATCH_TEST_POSTGRES_URL.');
} else {
  const args = ['exec', 'vitest', 'run', 'packages/storage-postgres/tests/postgres.contract.test.ts', '--reporter=verbose'];
  const pnpm = resolvePnpmInvocation();
  const result = spawnSync(pnpm.command, [...pnpm.prefix, ...args], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) throw new Error(output);
  if (/\bskipped\b/i.test(output)) throw new Error(`PostgreSQL CI URL is configured but a contract test was skipped.\n${output}`);
  console.log('PostgreSQL CI contract ran without skipped tests.');
}
