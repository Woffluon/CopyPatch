#!/usr/bin/env node
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH_PACKAGES, assertManifestConsistency, readManifestEntries } from './manifests.mjs';

const REGISTRY = 'https://registry.npmjs.org';

export function classifyRegistryRecords(records) {
  const absent = records.filter((record) => !record.packageExists);
  const exact = records.filter((record) => record.versionExists);
  if (absent.length === records.length) return 'bootstrap';
  if (absent.length > 0) return 'partial-bootstrap';
  if (exact.length === records.length) return 'complete';
  return 'publish';
}

export async function queryPackage(name, version, fetchImplementation = fetch) {
  const response = await fetchImplementation(`${REGISTRY}/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { name, version, packageExists: false, versionExists: false };
  if (!response.ok) throw new Error(`npm registry query failed for ${name}: HTTP ${response.status}`);
  const packument = await response.json();
  return {
    name,
    version,
    packageExists: true,
    versionExists: Boolean(packument.versions && Object.hasOwn(packument.versions, version)),
  };
}

export async function getRegistryStatus(repoRoot, fetchImplementation = fetch) {
  const entries = await readManifestEntries(repoRoot);
  const version = assertManifestConsistency(entries);
  const byPath = new Map(entries.map((entry) => [path.dirname(entry.path).replaceAll('\\', '/'), entry.manifest]));
  const records = await Promise.all(PUBLISH_PACKAGES.map(async (item) => {
    const manifest = byPath.get(item.path);
    if (!manifest || manifest.name !== item.name) {
      throw new Error(`Publish manifest identity mismatch for ${item.path}.`);
    }
    return queryPackage(item.name, version, fetchImplementation);
  }));
  return { state: classifyRegistryRecords(records), version, records };
}

function summaryFor(status) {
  const packageCount = PUBLISH_PACKAGES.length;
  if (status.state === 'bootstrap') {
    return [
      '### npm bootstrap required',
      `All ${packageCount} packages are absent from npm. Automated publish for v${status.version} is a no-op: first publication must be performed manually, then npm trusted publishing can be configured for this workflow. No account credential was requested.`,
    ].join('\n');
  }
  if (status.state === 'partial-bootstrap') {
    const missing = status.records.filter((record) => !record.packageExists).map((record) => record.name).join(', ');
    return `### npm bootstrap incomplete\nPackages absent from npm: ${missing}. No automated publish attempted.`;
  }
  if (status.state === 'complete') {
    return `### npm registry state\nAll ${packageCount} packages already contain ${status.version}; publish job will skip exact versions.`;
  }
  const missingVersions = status.records.filter((record) => !record.versionExists).map((record) => record.name).join(', ');
  return `### npm registry state\nVersion ${status.version} still needs publication for: ${missingVersions}.`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repoRootIndex = process.argv.indexOf('--repo-root');
    const repoRoot = repoRootIndex === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') : path.resolve(process.argv[repoRootIndex + 1]);
    const status = await getRegistryStatus(repoRoot);
    console.log(JSON.stringify(status));
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `state=${status.state}\npublish_needed=${status.state === 'publish'}\nrelease_allowed=${status.state === 'publish' || status.state === 'complete'}\n`, 'utf8');
    }
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summaryFor(status)}\n`, 'utf8');
    if (status.state === 'partial-bootstrap') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
