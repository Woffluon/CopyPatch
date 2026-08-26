# CopyPatch

[English](README.md) | [Türkçe](README.tr.md)

CopyPatch adds secure, inline copy editing to an existing web application. Mark editable strings with React components, mount CopyPatch inside the host application, and let authorized editors update copy directly on the page at `?copypatch=1`.

CopyPatch runs embedded inside your application runtime. It does not require a standalone API server, additional open ports, reverse proxies, or external CORS configuration.

```mermaid
flowchart LR
  Browser[Browser: ?copypatch=1] --> Host[Host Application]
  Host --> ReactView[React: CopyPatchProvider & EditableText]
  Host --> ApiRoute[/__copypatch/api/v2/*]
  ApiRoute --> Backend[@copypatch/backend]
  Backend --> Storage[(SQLite / PostgreSQL)]
```

---

## Core Capabilities

- **Same-origin architecture:** The API route mounts directly under `/__copypatch/api/v2`. All requests stay on the page origin, removing CORS complexity and external port exposure.
- **Zero bundle overhead for visitors:** Public visitors receive only lightweight React components. The full visual editor, diff inspectors, and authentication modals load dynamically only when `?copypatch=1` is present.
- **Server snapshot rendering:** Server components and SSR routes fetch published snapshots directly from persistence, preventing layout shifts or client hydration waterfalls.
- **Storage flexibility:** Single-node setups use SQLite (`@copypatch/storage-sqlite`), while multi-instance horizontal clusters connect via PostgreSQL (`@copypatch/storage-postgres`).
- **Role-based security:** Built-in Argon2id sessions or custom host authentication adapters enforce `editor` (save drafts) and `publisher` (publish live revisions) permissions with strict CSRF verification.

---

## Package Ecosystem

CopyPatch publishes seven lockstep packages under the `@copypatch` scope:

| Package | Role |
| --- | --- |
| [`@copypatch/core`](packages/core) | Shared TypeScript contracts, validation schemas, and API constants. |
| [`@copypatch/react`](packages/react) | `<CopyPatchProvider>`, `<EditableText>`, headless hooks, and on-demand editor UI. |
| [`@copypatch/backend`](packages/backend) | Storage-agnostic HTTP controller, session handling, CSRF checks, and auth contracts. |
| [`@copypatch/storage-sqlite`](packages/storage-sqlite) | SQLite persistence adapter built with `better-sqlite3`. |
| [`@copypatch/storage-postgres`](packages/storage-postgres) | PostgreSQL persistence adapter with transaction and connection pool support. |
| [`@copypatch/node`](packages/node) | Adapters for Express, Fastify, Hono, native Node HTTP, and the project CLI. |
| [`@copypatch/next`](packages/next) | Next.js App Router route handlers, server snapshot helpers, and provider wrappers. |

> [!NOTE]
> `@copypatch/server` represents the legacy v1 standalone server. It is deprecated and maintained solely for backwards compatibility. All v2 integrations use embedded backend instances.

---

## Quick Start: Next.js App Router with SQLite

### 1. Install dependencies

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend \
  @copypatch/storage-sqlite @copypatch/next
```

### 2. Create the shared backend instance

Initialize persistence and the backend controller in a shared server utility:

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

### 3. Mount the same-origin API route

Create a catch-all route handler to serve `/__copypatch/api/v2/*`:

```ts
// app/%5F%5Fcopypatch/api/v2/[...path]/route.ts
import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createCopyPatchRouteHandlers(copypatch);
```

### 4. Generate the Argon2id passphrase hash

Generate the hash once and store it in your environment secrets (`COPYPATCH_PASSPHRASE_HASH`):

```bash
printf '%s' "your-secure-editor-passphrase" | pnpm exec copypatch hash --stdin
```

### 5. Render server components with snapshots

Fetch the published snapshot on the server and wrap your UI in the provider:

```tsx
// app/page.tsx
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { readPublishedSnapshot } from '@copypatch/next/server';
import { copypatch } from '@/lib/copypatch';

export default async function Page() {
  const snapshot = await readPublishedSnapshot(copypatch, 'en');

  return (
    <NextCopyPatchProvider locale="en" initialSnapshot={snapshot}>
      <main className="container">
        <EditableText contentKey="home.hero.title" as="h1">
          Welcome to Our Platform
        </EditableText>
        <EditableText contentKey="home.hero.body" as="p" allowLineBreaks>
          Edit this text inline by visiting this page with ?copypatch=1.
        </EditableText>
      </main>
    </NextCopyPatchProvider>
  );
}
```

---

## Persistence Adapters

### SQLite (`@copypatch/storage-sqlite`)

Ideal for local development, desktop applications, or single-container deployments:

```ts
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const persistence = createSQLitePersistence('./data/copypatch.sqlite');
await persistence.migrate();
```

### PostgreSQL (`@copypatch/storage-postgres`)

Designed for distributed deployments across multiple serverless instances or server containers:

```ts
import { createPostgresPersistence } from '@copypatch/storage-postgres';

const persistence = createPostgresPersistence(process.env.DATABASE_URL!);
await persistence.migrate();
```

---

## Multi-Framework Server Adapters

`@copypatch/node` provides first-class middleware for popular Node.js frameworks:

### Express

```ts
import express from 'express';
import { expressMiddleware } from '@copypatch/node';
import { copypatch } from './copypatch.js';

const app = express();

// Mount CopyPatch middleware before general body parsers
app.use(expressMiddleware(copypatch));
```

### Fastify

```ts
import Fastify from 'fastify';
import { fastifyPlugin } from '@copypatch/node';
import { copypatch } from './copypatch.js';

const fastify = Fastify();
await fastify.register(fastifyPlugin, { backend: copypatch });
```

### Hono (Node.js runtime)

```ts
import { Hono } from 'hono';
import { honoMiddleware } from '@copypatch/node';
import { copypatch } from './copypatch.js';

const app = new Hono();
app.use('*', honoMiddleware(copypatch));
```

### Astro SSR & React Router

For Astro SSR or React Router server entries, use `handleNodeRequest` directly inside your HTTP handler:

```ts
import { handleNodeRequest } from '@copypatch/node';
import { copypatch } from './copypatch.js';

export async function handleRequest(req, res) {
  const handled = await handleNodeRequest(copypatch, req, res);
  if (handled) return;
  // Proceed with host application rendering
}
```

---

## React Component & Hook Reference

### `<EditableText>`

Renders plain text in visitor mode and an uncontrolled `contentEditable` surface in editor mode:

```tsx
import { EditableText } from '@copypatch/react';

<EditableText
  contentKey="pricing.plan.pro.description"
  as="p"
  allowLineBreaks={false}
  className="text-muted"
>
  Standard team plan including all core features.
</EditableText>
```

- `contentKey` (required): Unique string identifier for the copy entry.
- `as` (optional): HTML element type (e.g. `'span'`, `'h1'`, `'p'`). Defaults to `'span'`.
- `allowLineBreaks` (optional): Set to `true` to allow multiline editing via Shift+Enter.
- `children` (required): Fallback copy rendered when no published copy exists in persistence.

### `useCopyPatch`

Accesses active editor state, authentication status, and locale information:

```tsx
import { useCopyPatch } from '@copypatch/react';

function StatusIndicator() {
  const { isEditorActive, isAuthorized, role, locale } = useCopyPatch();

  if (!isEditorActive) return null;

  return (
    <aside className="editor-status">
      Locale: {locale} | Role: {role ?? 'Guest'}
    </aside>
  );
}
```

### `useEditableText` (Headless Hook)

Build custom editing components or integrations without `<EditableText>`:

```tsx
import { useEditableText } from '@copypatch/react';

function CustomField({ contentKey, defaultValue }: { contentKey: string; defaultValue: string }) {
  const { text, isEditing, elementRef, onFocus, onBlur, onInput } =
    useEditableText(contentKey, defaultValue);

  return (
    <div
      ref={elementRef}
      contentEditable={isEditing}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={onInput}
    >
      {text}
    </div>
  );
}
```

---

## Authentication & Security

CopyPatch supports two authentication models:

### 1. Built-in Argon2id Passphrase

Configure `passphraseHash` when instantiating the backend. CopyPatch sets a signed, HTTP-only session cookie (`copypatch_session`) on successful login.

All state-mutating requests (saving drafts, publishing, rollbacks) validate the custom `x-copypatch-csrf` header to prevent cross-site request forgery.

### 2. Host Application Auth Adapter

Connect CopyPatch to your existing authentication system (e.g. NextAuth, Clerk, Auth0, Supabase):

```ts
import { createCopyPatchBackend, type AuthAdapter } from '@copypatch/backend';

const authAdapter: AuthAdapter = {
  async resolveUser(request) {
    const session = await getHostSession(request);
    if (!session?.user) return null;

    return {
      id: session.user.id,
      name: session.user.name,
      role: session.user.isAdmin ? 'publisher' : 'editor',
    };
  },
  async verifyMutation(request, user) {
    // Verify host CSRF token or session integrity
    return isValidHostCsrf(request);
  },
};

export const copypatch = createCopyPatchBackend({
  persistence,
  authAdapter,
});
```

### Role Hierarchy

- `guest`: Read published copy only.
- `editor`: Read published copy, preview drafts, save draft revisions.
- `publisher`: Full editor capabilities plus publishing draft revisions to live production.

---

## CLI Reference

The `@copypatch/node` package includes the `copypatch` CLI tool:

| Command | Usage | Description |
| --- | --- | --- |
| `init` | `copypatch init --framework <framework> --storage <storage>` | Generates scaffold configuration and route files. |
| `hash` | `printf '%s' "$SECRET" \| copypatch hash --stdin` | Generates a cryptographically secure Argon2id hash. |
| `migrate` | `copypatch migrate --storage <sqlite\|postgres>` | Runs database schema migrations for the chosen storage engine. |
| `doctor` | `copypatch doctor` | Audits current directory, configuration files, and environment variables. |

Supported framework options for `init`: `next`, `astro`, `react-router`, `vite-node`.

---

## Documentation & Architecture

- [Architecture Map](docs/architecture.md): Runtime flow and package dependency rules.
- [Threat Model & Security](docs/threat-model.md): Security analysis, session policies, and mitigation details.
- [Security Policy](SECURITY.md): Vulnerability reporting and disclosure guidelines.
- [Contributing Guide](CONTRIBUTING.md): Monorepo setup, lockstep release protocol, and testing instructions.
- [Online Documentation](https://copypatch.vercel.app/docs): Full API guides, live component playground, and tutorials.

---

## License

MIT. Copyright 2026 Efe Arabacı.
