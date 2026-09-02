import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePnpmInvocation } from './pnpm-command.mjs';

const BLOCKING = new Set(['moderate', 'high', 'critical']);

export function parseAuditReport(report) {
  return Object.entries(report.vulnerabilities ?? {}).flatMap(([packageName, vulnerability]) => (vulnerability.via ?? []).filter((via) => typeof via === 'object' && via !== null).map((via) => ({ id: String(via.source ?? via.url ?? packageName), packageName: via.name ?? packageName, severity: vulnerability.severity, url: via.url })));
}

export function validateAllowlist(findings, allowlist, today = new Date().toISOString().slice(0, 10)) {
  const valid = new Map();
  for (const entry of allowlist) {
    for (const field of ['id', 'scope', 'owner', 'reason', 'expires']) if (!entry[field]) throw new Error(`Audit allowlist entry is missing ${field}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires) || entry.expires < today) throw new Error(`Audit allowlist entry ${entry.id} has expired.`);
    valid.set(`${entry.scope}#${entry.id}`, entry);
  }
  const reported = findings.map((finding) => `${finding.packageName}#${finding.id}`).sort();
  const failures = findings.filter((finding) => BLOCKING.has(finding.severity) && !valid.has(`${finding.packageName}#${finding.id}`)).map((finding) => `${finding.packageName}#${finding.id}`).sort();
  return { failures, reported };
}

function runAudit(repoRoot) {
  const args = ['audit', '--prod', '--json'];
  const pnpm = resolvePnpmInvocation();
  const result = spawnSync(pnpm.command, [...pnpm.prefix, ...args], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!result.stdout.trim()) throw new Error(result.stderr.trim() || 'pnpm audit did not produce JSON.');
  return JSON.parse(result.stdout);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const allowlist = JSON.parse(await readFile(path.join(root, 'scripts/audit-allowlist.json'), 'utf8'));
  const { failures, reported } = validateAllowlist(parseAuditReport(runAudit(root)), allowlist);
  for (const finding of reported) console.log(`audit: ${finding}`);
  if (failures.length) throw new Error(`Blocking production audit findings: ${failures.join(', ')}`);
  console.log('Production dependency audit policy passed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
