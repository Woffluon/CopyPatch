import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePnpmInvocation } from './pnpm-command.mjs';

const RUN_COUNT = 3;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolvePnpmInvocation();

for (let run = 1; run <= RUN_COUNT; run += 1) {
  const startedAt = performance.now();
  console.log(`Coverage stability run ${run}/${RUN_COUNT}`);
  const result = spawnSync(pnpm.command, [...pnpm.prefix, 'test:coverage'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Coverage stability run ${run}/${RUN_COUNT} failed after ${Math.round(performance.now() - startedAt)} ms.`);
    process.exit(result.status ?? 1);
  }
  console.log(`Coverage stability run ${run}/${RUN_COUNT} passed in ${Math.round(performance.now() - startedAt)} ms.`);
}
