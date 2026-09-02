import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli/index.js';
import { createInitFiles } from '../src/cli/templates.js';

describe('init templates', () => {
  it.each(['next', 'astro', 'react-router', 'vite-node'] as const)('emits a same-origin %s mount with selected storage', (framework) => {
    const files = createInitFiles({ framework, storage: 'sqlite' });
    expect(files.map((file) => file.path)).toContain('copypatch.config.ts');
    expect(mountPath(files, framework)).toBe('/__copypatch/api/v2');
    expect(files.map((file) => file.contents).join('\n')).not.toContain('/__copypatch/api/v1');
    expect(files.map((file) => file.contents).join('\n')).toContain('sqlite');
  });

  it('uses the canonical Next App Router catch-all route and a defined embedded backend', () => {
    const files = createInitFiles({ framework: 'next', storage: 'sqlite' });
    const config = fileContents(files, 'copypatch.config.ts');
    const route = fileContents(files, 'app/%5F%5Fcopypatch/api/v2/[...path]/route.ts');

    expect(config).toContain('export const backend = createCopyPatchBackend');
    expect(config).toContain('export function bootstrapCopyPatch');
    expect(route).toContain("import { backend, bootstrapCopyPatch }");
    expect(route).toContain('createCopyPatchRouteHandlers(backend)');
  });

  it('keeps the Vite + Node middleware inside the API path boundary', () => {
    const route = fileContents(createInitFiles({ framework: 'vite-node', storage: 'sqlite' }), 'src/copypatch.ts');
    expect(route).toContain('pathname !== copyPatchApiBasePath');
    expect(route).toContain('pathname.startsWith(`${copyPatchApiBasePath}/`)');
  });

  it('gives React Router hosts a spreadable route list instead of an ambiguous manual route', () => {
    const entry = fileContents(createInitFiles({ framework: 'react-router', storage: 'sqlite' }), 'app/copypatch.routes.ts');
    expect(entry).toContain('export const copyPatchRoutes = [');
    expect(entry).toContain('...copyPatchRoutes');
  });

});

function fileContents(files: readonly { path: string; contents: string }[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.contents;
}

function mountPath(files: readonly { path: string; contents: string }[], framework: string): string {
  if (framework === 'next') {
    expect(files.map((file) => file.path)).toContain('app/%5F%5Fcopypatch/api/v2/[...path]/route.ts');
    return '/__copypatch/api/v2';
  }
  if (framework === 'astro') {
    expect(files.map((file) => file.path)).toContain('src/pages/__copypatch/api/v2/[...path].ts');
    return '/__copypatch/api/v2';
  }
  if (framework === 'react-router') return fileContents(files, 'app/copypatch.routes.ts').match(/route\('([^']+)'/)?.[1]?.replace('/*', '') ?? '';
  return fileContents(files, 'src/copypatch.ts').match(/copyPatchApiBasePath = '([^']+)'/)?.[1] ?? '';
}

describe('copypatch CLI', () => {
  it('writes generated files and direct runtime dependencies, then recommends the detected install command', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    const output: string[] = [];
    try {
      await writeHostPackage(cwd, { packageManager: 'pnpm@11.10.0', dependencies: { react: '^19.0.0' } });
      const result = await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd], { write: output.push.bind(output) });

      expect(result.exitCode).toBe(0);
      await expect(readFile(join(cwd, 'copypatch.config.ts'), 'utf8')).resolves.toContain("@copypatch/storage-sqlite");
      expect(await readHostDependencies(cwd)).toEqual({
        '@copypatch/backend': '^3.0.0',
        '@copypatch/next': '^3.0.0',
        '@copypatch/storage-sqlite': '^3.0.0',
        react: '^19.0.0',
      });
      expect(output.join('')).toContain('Run pnpm install to install the required CopyPatch packages.');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    ['package-lock.json', undefined, 'npm'],
    ['yarn.lock', undefined, 'yarn'],
    ['pnpm-lock.yaml', undefined, 'pnpm'],
  ] as const)('detects %s without a packageManager declaration', async (lockfile, packageManager, manager) => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    const output: string[] = [];
    try {
      await writeHostPackage(cwd, { packageManager });
      await writeFile(join(cwd, lockfile), 'lockfile');
      const result = await runCli(['init', '--framework', 'astro', '--storage', 'postgres', '--cwd', cwd], { write: output.push.bind(output) });
      expect(result.exitCode).toBe(0);
      expect(output.join('')).toContain(`Run ${manager} install to install the required CopyPatch packages.`);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('writes nothing in dry-run and is idempotent after the first init', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    try {
      await writeHostPackage(cwd, { dependencies: { react: '^19.0.0' } });
      const before = await readFile(join(cwd, 'package.json'), 'utf8');
      const dry = await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd, '--dry-run']);
      expect(dry.exitCode).toBe(0);
      await expect(readFile(join(cwd, 'copypatch.config.ts'))).rejects.toThrow();
      expect(await readFile(join(cwd, 'package.json'), 'utf8')).toBe(before);
      expect((await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd])).exitCode).toBe(0);
      expect((await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd])).exitCode).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    ['missing package.json', undefined],
    ['invalid package.json', '{ not valid JSON'],
  ] as const)('fails before generating files for %s', async (_label, manifest) => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    const output: string[] = [];
    try {
      if (manifest !== undefined) await writeFile(join(cwd, 'package.json'), manifest);
      const result = await runCli(['init', '--framework', 'vite-node', '--storage', 'sqlite', '--cwd', cwd], { write: output.push.bind(output) });
      expect(result.exitCode).toBe(1);
      await expect(readFile(join(cwd, 'copypatch.config.ts'))).rejects.toThrow();
      expect(output.join('')).toBe('CopyPatch init requires a valid package.json with an object dependencies field.\n');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('refuses overwrite conflicts and path traversal', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    try {
      await writeHostPackage(cwd);
      await writeFile(join(cwd, 'copypatch.config.ts'), 'user owned');
      const conflict = await runCli(['init', '--framework', 'astro', '--storage', 'sqlite', '--cwd', cwd]);
      expect(conflict.exitCode).toBe(1);
      expect(await readFile(join(cwd, 'copypatch.config.ts'), 'utf8')).toBe('user owned');
      expect((await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', '../'])).exitCode).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each(['sqlite', 'postgres'] as const)('reports the storage selected by init to doctor (%s)', async (storage) => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    const output: string[] = [];
    try {
      await writeHostPackage(cwd);
      expect((await runCli(['init', '--framework', 'next', '--storage', storage, '--cwd', cwd])).exitCode).toBe(0);
      expect((await runCli(['doctor'], { cwd, write: output.push.bind(output) })).exitCode).toBe(0);
      expect(output.join('')).toContain(`storage: ${storage}`);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('redacts doctor environment values, migrates through a host callback, and never offers serve', async () => {
    const output: string[] = [];
    const migrate = vi.fn(async () => undefined);
    const doctor = await runCli(['doctor'], { cwd: process.cwd(), env: { COPYPATCH_DATABASE_URL: 'postgres://secret@host/db' }, write: output.push.bind(output) });
    expect(doctor.exitCode).toBe(0);
    expect(output.join('')).toContain('[redacted]');
    expect(output.join('')).not.toContain('secret@host');
    expect((await runCli(['migrate', '--storage', 'postgres'], { migrate })).exitCode).toBe(0);
    expect(migrate).toHaveBeenCalledWith(expect.objectContaining({ storage: 'postgres' }));
    expect((await runCli(['serve'])).exitCode).toBe(2);
  });

  it('does not print migration exceptions that could contain a connection secret', async () => {
    const output: string[] = [];
    const result = await runCli(['migrate', '--storage', 'postgres'], {
      write: output.push.bind(output),
      migrate: async () => { throw new Error('postgres://user:secret@host/db'); },
    });
    expect(result.exitCode).toBe(1);
    expect(output.join('')).toContain('Migration failed');
    expect(output.join('')).not.toContain('secret');
  });

  it('hashes passphrases without echoing plaintext and rejects unknown commands', async () => {
    const output: string[] = [];
    const result = await runCli(['hash', '--stdin'], { write: output.push.bind(output), readSecret: async () => 'not-for-logs' });
    expect(result.exitCode).toBe(0);
    expect(output.join('')).toContain('$argon2id$');
    expect(output.join('')).not.toContain('not-for-logs');
    expect((await runCli(['wat'])).exitCode).toBe(2);
  });
});

async function writeHostPackage(cwd: string, value: Record<string, unknown> = {}): Promise<void> {
  await writeFile(join(cwd, 'package.json'), `${JSON.stringify({ name: 'host-app', ...value }, null, 2)}\n`);
}

async function readHostDependencies(cwd: string): Promise<Record<string, string>> {
  const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  return manifest.dependencies ?? {};
}
