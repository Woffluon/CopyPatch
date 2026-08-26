# CopyPatch

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch adds secure inline copy editing to an application that you already
own. Mark approved strings with React components, mount CopyPatch inside the
same application, and let authorized editors update copy at
`?copypatch=1`. It does not run a separate service, port, reverse proxy, or
CORS configuration.

## v2 at a glance

- The API is mounted by the host application at `/__copypatch/api/v2`.
- Browser requests stay same-origin. CopyPatch does not use a standalone API
  server or proxy.
- Use SQLite for a local or single-node deployment, or PostgreSQL when several
  application instances need shared persistence.
- Authenticate with the built-in passphrase flow or connect CopyPatch to the
  host application's auth and mutation verification.
- CopyPatch is for server-capable applications. A fully static export can
  render its fallback copy, but cannot serve editing, authentication, or
  persistence without a server runtime.

## Packages

| Package | Purpose |
| --- | --- |
| [`@copypatch/core`](packages/core) | Shared contracts, validation, and API constants. |
| [`@copypatch/react`](packages/react) | `CopyPatchProvider`, editable React components, hooks, and editor UI. |
| [`@copypatch/backend`](packages/backend) | Storage-independent backend runtime and authentication contract. |
| [`@copypatch/storage-sqlite`](packages/storage-sqlite) | SQLite persistence adapter. |
| [`@copypatch/storage-postgres`](packages/storage-postgres) | PostgreSQL persistence adapter. |
| [`@copypatch/node`](packages/node) | Native Node, Express, Fastify, Hono adapters and the project CLI. |
| [`@copypatch/next`](packages/next) | Next.js App Router route-handler and server-rendering helpers. |

`@copypatch/server` is the v1 standalone-server package. It is deprecated for
new integrations and will be retired in a later major release. Existing users
should migrate deliberately; published package versions will never be
unpublished.

## Quick start: Next.js with SQLite

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend \
  @copypatch/storage-sqlite @copypatch/next
```

Create one backend instance that your route handler and server components can
share:

```ts
// lib/copypatch.ts
import { createCopyPatchBackend } from '@copypatch/backend';
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const persistence = createSQLitePersistence('./data/copypatch.sqlite');
await persistence.migrate();

export const copypatch = createCopyPatchBackend({
  persistence,
  passphraseHash: process.env.COPYPATCH_PASSPHRASE_HASH!,
});
```

Mount it inside the application. The generated v2 route owns the same-origin
`/__copypatch/api/v2` path:

```ts
// app/%5F%5Fcopypatch/api/v2/[...path]/route.ts
import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createCopyPatchRouteHandlers(copypatch);
```

Generate the Argon2id value once, then store only its output in your host
environment or secret manager:

```bash
printf '%s' "$COPYPATCH_PASSPHRASE" | pnpm exec copypatch hash --stdin
```

Use the same backend to render a snapshot and let the React provider use its
default API path:

```tsx
// app/page.tsx
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { readPublishedSnapshot } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export default async function Page() {
  const snapshot = await readPublishedSnapshot(copypatch, 'en');

  return (
    <NextCopyPatchProvider locale="en" initialSnapshot={snapshot}>
      <EditableText contentKey="hero.title" as="h1">
        Welcome
      </EditableText>
    </NextCopyPatchProvider>
  );
}
```

For a working scaffold, run `copypatch init --framework next --storage sqlite`.
The CLI creates project files only; it does not start a server.

## Framework matrix

| Host | Server integration | Notes |
| --- | --- | --- |
| Next.js App Router | `@copypatch/next` | Mount a catch-all route and pass the shared backend to `readPublishedSnapshot`. |
| Astro SSR | `@copypatch/node` native adapter | Mount the generated API route in an SSR adapter. Static output alone cannot host CopyPatch. |
| React Router | `@copypatch/node` native adapter | Mount the handler in the framework's server entry. |
| Vite + Node | `@copypatch/node` native, Express, Fastify, or Hono adapter | Vite is the client build tool; mount CopyPatch in the Node server that serves the app. |

## Authentication

The backend accepts one of two mutually exclusive strategies:

- `passphraseHash`: CopyPatch creates a secure, same-origin session and checks
  the CSRF header for mutations.
- `authAdapter`: the host application resolves its own user and roles. The
  adapter also verifies every mutation, which is where the host's CSRF or
  request-integrity protection belongs.

Both approaches require `editor` to save drafts and `publisher` to publish.

## Documentation

- [Architecture map](docs/architecture.md)
- [Threat model and security status](docs/threat-model.md)
- [Security policy](SECURITY.md)
- [Documentation site](https://copypatch.vercel.app/docs)

## License

MIT. Copyright 2026 Efe Arabacı.
