import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
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

  it.each([
    ['next', 'sqlite', 'app/%5F%5Fcopypatch/api/v2/[...path]/route.ts'],
    ['next', 'postgres', 'app/%5F%5Fcopypatch/api/v2/[...path]/route.ts'],
    ['astro', 'sqlite', 'src/pages/__copypatch/api/v2/[...path].ts'],
    ['astro', 'postgres', 'src/pages/__copypatch/api/v2/[...path].ts'],
    ['react-router', 'sqlite', 'app/routes/copypatch-api.ts'],
    ['react-router', 'postgres', 'app/routes/copypatch-api.ts'],
    ['vite-node', 'sqlite', 'src/copypatch.ts'],
    ['vite-node', 'postgres', 'src/copypatch.ts'],
  ] as const)('creates a type-resolvable %s/%s embedded backend fixture', async (framework, storage, routePath) => {
    const files = createInitFiles({ framework, storage });
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining([
      'copypatch.config.ts',
      'copypatch.env.example',
      routePath,
    ]));

    const fixture = await mkdtemp(join(tmpdir(), 'copypatch-template-'));
    try {
      for (const file of files) {
        const destination = join(fixture, ...file.path.split('/'));
        await writeFile(destination, file.contents, { encoding: 'utf8', flag: 'w' }).catch(async (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          const { mkdir } = await import('node:fs/promises');
          await mkdir(join(destination, '..'), { recursive: true });
          await writeFile(destination, file.contents, { encoding: 'utf8', flag: 'w' });
        });
      }
      const declarations = join(fixture, 'template-types.d.ts');
      await writeFile(declarations, TEMPLATE_TYPE_DECLARATIONS, 'utf8');
      const program = ts.createProgram({
        rootNames: [
          declarations,
          ...files.filter((file) => file.path.endsWith('.ts')).map((file) => join(fixture, ...file.path.split('/'))),
        ],
        options: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
          typeRoots: [join(process.cwd(), 'packages', 'node', 'node_modules', '@types')],
        },
      });
      const diagnostics = ts.getPreEmitDiagnostics(program)
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      expect(diagnostics).toEqual([]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
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

const TEMPLATE_TYPE_DECLARATIONS = `
declare module '@copypatch/backend' {
  export interface CopyPatchBackend { handle(request: Request, context?: { clientAddress?: string }): Promise<Response>; }
  export function createCopyPatchBackend(input: { persistence: unknown; passphraseHash: string }): CopyPatchBackend;
}
declare module '@copypatch/storage-sqlite' {
  export interface SQLitePersistence { migrate(): Promise<void>; }
  export function createSQLitePersistence(path: string): SQLitePersistence;
}
declare module '@copypatch/storage-postgres' {
  export interface PostgresPersistence { migrate(): Promise<void>; }
  export function createPostgresPersistence(input: string): PostgresPersistence;
}
declare module '@copypatch/node' {
  export function createNodeHandler(backend: { handle(request: Request): Promise<Response> }): (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void;
}
declare module '@copypatch/next/server' {
  export function createCopyPatchRouteHandlers(backend: { handle(request: Request): Promise<Response> }): Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS', (request: Request) => Promise<Response>>;
}
declare module 'astro' {
  export interface APIContext { request: Request; clientAddress: string; }
  export type APIRoute = (context: APIContext) => Response | Promise<Response>;
}
declare module '@react-router/dev/routes' {
  export function route(path: string, file: string): unknown;
}
`;

describe('copypatch CLI', () => {
  it('writes nothing in dry-run and is idempotent after the first init', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    const dry = await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd, '--dry-run']);
    expect(dry.exitCode).toBe(0);
    await expect(readFile(join(cwd, 'copypatch.config.ts'))).rejects.toThrow();
    expect((await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd])).exitCode).toBe(0);
    expect((await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', cwd])).exitCode).toBe(0);
  });

  it('refuses overwrite conflicts and path traversal', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    await writeFile(join(cwd, 'copypatch.config.ts'), 'user owned');
    const conflict = await runCli(['init', '--framework', 'astro', '--storage', 'sqlite', '--cwd', cwd]);
    expect(conflict.exitCode).toBe(1);
    expect(await readFile(join(cwd, 'copypatch.config.ts'), 'utf8')).toBe('user owned');
    expect((await runCli(['init', '--framework', 'next', '--storage', 'sqlite', '--cwd', '../'])).exitCode).toBe(1);
  });

  it.each(['sqlite', 'postgres'] as const)('reports the storage selected by init to doctor (%s)', async (storage) => {
    const cwd = await mkdtemp(join(tmpdir(), 'copypatch-node-'));
    const output: string[] = [];
    try {
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
