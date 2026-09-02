import { API_BASE_PATH } from '@copypatch/core';

export type Framework = 'next' | 'astro' | 'react-router' | 'vite-node';
export type Storage = 'sqlite' | 'postgres';

export interface InitFile { path: string; contents: string; }
export interface InitTemplateOptions { framework: Framework; storage: Storage; }

/** Produces standalone, server-only files without changing an existing host route. */
export function createInitFiles(options: InitTemplateOptions): readonly InitFile[] {
  return [
    { path: 'copypatch.config.ts', contents: backendConfig(options.storage) },
    { path: 'copypatch.env.example', contents: environmentExample(options.storage) },
    ...frameworkFiles(options.framework),
  ];
}

function backendConfig(storage: Storage): string {
  const persistence = storage === 'sqlite'
    ? `import { resolve } from 'node:path';
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const sqlitePath = process.env.COPYPATCH_SQLITE_PATH ?? resolve(process.cwd(), 'copypatch.sqlite');
export const persistence = createSQLitePersistence(sqlitePath);`
    : `import { createPostgresPersistence } from '@copypatch/storage-postgres';

const databaseUrl = requiredEnvironment('COPYPATCH_DATABASE_URL');
export const persistence = createPostgresPersistence(databaseUrl);`;

  return `import { createCopyPatchBackend } from '@copypatch/backend';
${persistence}

const passphraseHash = requiredEnvironment('COPYPATCH_PASSPHRASE_HASH');

let bootstrap: Promise<void> | undefined;

/** Run migrations once before this deployment accepts CopyPatch requests. */
export function bootstrapCopyPatch(): Promise<void> {
  bootstrap ??= persistence.migrate();
  return bootstrap;
}

export const backend = createCopyPatchBackend({ persistence, passphraseHash });

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(\`CopyPatch requires the \${name} environment variable.\`);
  return value;
}
`;
}

function environmentExample(storage: Storage): string {
  return storage === 'sqlite'
    ? `# Copy these names into your local environment or deployment secret manager.\n# Do not put a real passphrase or hash in this file.\nCOPYPATCH_PASSPHRASE_HASH=<argon2id-hash-from-copypatch-hash---stdin>\nCOPYPATCH_SQLITE_PATH=./copypatch.sqlite\n`
    : `# Copy these names into your local environment or deployment secret manager.\n# Do not put a real passphrase, hash, or database credential in this file.\nCOPYPATCH_PASSPHRASE_HASH=<argon2id-hash-from-copypatch-hash---stdin>\nCOPYPATCH_DATABASE_URL=<postgres-connection-string>\n`;
}

function frameworkFiles(framework: Framework): readonly InitFile[] {
  switch (framework) {
    case 'next': return [{
      path: 'app/%5F%5Fcopypatch/api/v2/[...path]/route.ts',
      contents: nextRoute(),
    }];
    case 'astro': return [{
      path: 'src/pages/__copypatch/api/v2/[...path].ts',
      contents: astroRoute(),
    }];
    case 'react-router': return [
      { path: 'app/routes/copypatch-api.ts', contents: reactRouterRoute() },
      { path: 'app/copypatch.routes.ts', contents: reactRouterRouteEntry() },
    ];
    case 'vite-node': return [{ path: 'src/copypatch.ts', contents: viteNodeMount() }];
  }
}

function nextRoute(): string {
  return `import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { backend, bootstrapCopyPatch } from '../../../../../copypatch.config.js';

export const runtime = 'nodejs';

const routes = createCopyPatchRouteHandlers(backend);
type RouteHandler = (request: Request) => Promise<Response>;

// Unsafe requests stay fail-closed until createCopyPatchRouteHandlers receives
// a resolveContext callback that returns a trusted clientAddress. If your
// deployment intentionally accepts one shared rate-limit bucket, pass
// unsafeRequestWithoutClientAddress: 'shared-bucket' explicitly instead.

function withBootstrap(handler: RouteHandler): RouteHandler {
  return async (request) => {
    await bootstrapCopyPatch();
    return handler(request);
  };
}

export const GET = withBootstrap(routes.GET);
export const POST = withBootstrap(routes.POST);
export const PUT = withBootstrap(routes.PUT);
export const PATCH = withBootstrap(routes.PATCH);
export const DELETE = withBootstrap(routes.DELETE);
export const HEAD = withBootstrap(routes.HEAD);
export const OPTIONS = withBootstrap(routes.OPTIONS);
`;
}

function astroRoute(): string {
  return `import type { APIContext, APIRoute } from 'astro';
import { backend, bootstrapCopyPatch } from '../../../../../copypatch.config.js';

// This endpoint requires an Astro SSR adapter; it cannot run in a static-only build.
export const prerender = false;

const handle: APIRoute = async ({ request, clientAddress }: APIContext) => {
  await bootstrapCopyPatch();
  return backend.handle(request, { clientAddress });
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
`;
}

function reactRouterRoute(): string {
  return `import { backend, bootstrapCopyPatch } from '../../copypatch.config.js';

async function handle(request: Request): Promise<Response> {
  await bootstrapCopyPatch();
  return backend.handle(request);
}

// No default export: React Router treats this as a resource route.
export function loader({ request }: { request: Request }): Promise<Response> {
  return handle(request);
}

// React Router sends POST, PUT, PATCH, and DELETE requests to the action.
export function action({ request }: { request: Request }): Promise<Response> {
  return handle(request);
}
`;
}

function reactRouterRouteEntry(): string {
  return `import { route } from '@react-router/dev/routes';

// In app/routes.ts, import this value and add ...copyPatchRoutes to its default array.
export const copyPatchRoutes = [
  route('${API_BASE_PATH}/*', './routes/copypatch-api.ts'),
];
`;
}

function viteNodeMount(): string {
  return `import type { IncomingMessage, ServerResponse } from 'node:http';
import { createNodeHandler } from '@copypatch/node';
import { backend, bootstrapCopyPatch } from '../copypatch.config.js';

const handler = createNodeHandler(backend);
export const copyPatchApiBasePath = '${API_BASE_PATH}';

type ConnectNext = (error?: Error) => void;

/** Mount before Vite middleware and any SPA fallback in the same Node process. */
export function createCopyPatchViteMiddleware(): (
  request: IncomingMessage,
  response: ServerResponse,
  next: ConnectNext,
) => void {
  return (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://copypatch.local').pathname;
    if (pathname !== copyPatchApiBasePath && !pathname.startsWith(\`\${copyPatchApiBasePath}/\`)) {
      next();
      return;
    }
    void bootstrapCopyPatch().then(
      () => handler(request, response),
      () => next(new Error('CopyPatch bootstrap failed. Check server logs and storage configuration.')),
    );
  };
}
`;
}
