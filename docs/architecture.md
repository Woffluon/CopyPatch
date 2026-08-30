# CopyPatch v2 architecture map

[English](architecture.md) | [Türkçe](architecture.tr.md)

This document is the current architecture map for CopyPatch. Update it when a
package boundary, public integration contract, or deployment boundary changes.

## Runtime shape

```mermaid
flowchart LR
  Browser[Browser] --> Host[Host application]
  Host --> React[@copypatch/react]
  Host --> Route[/__copypatch/api/v2]
  Route --> Backend[@copypatch/backend]
  Backend --> Storage[SQLite or PostgreSQL]
```

The host application owns the API route. The browser talks to the same origin
as the rendered page, so CopyPatch has no standalone process, second port,
reverse proxy, or CORS mode.

## Package boundaries

| Package | Responsibility |
| --- | --- |
| `@copypatch/core` | API path, contracts, validation, content and persistence types. |
| `@copypatch/react` | Provider, editable text, client store, and lazy editor interface. |
| `@copypatch/backend` | HTTP routing, authorization, session behavior, CSRF checks, and revision coordination. |
| `@copypatch/storage-sqlite` | SQLite migrations and persistent implementation of the core persistence contract. |
| `@copypatch/storage-postgres` | PostgreSQL migrations and multi-instance persistence. |
| `@copypatch/node` | Adapters for native Node, Express, Fastify, and Hono plus initialization and migration CLI commands. |
| `@copypatch/next` | Next.js App Router route handlers and direct server snapshot reads. |

## Data and request paths

1. The host renders fallback copy or reads a published locale snapshot directly
   from the shared backend for SSR/RSC.
2. `CopyPatchProvider` reads the same-origin published endpoint at
   `/__copypatch/api/v2/content/:locale` when it needs to refresh client state.
3. When `?copypatch=1` is present, the client lazily loads the editor surface.
4. Editors authenticate through a built-in passphrase session or the host-auth
   adapter. Mutation routes enforce roles and revision checks.
5. SQLite is suited to a local or single-node app. PostgreSQL persists state
   across app instances.

## Host framework choices

- **Next.js App Router:** create a catch-all route with
  `createCopyPatchRouteHandlers` and use `readPublishedSnapshot` in server
  components.
- **Astro SSR, React Router, or Vite + Node:** mount one of the Node adapters
  at the same API path in the server that already serves the app.
- **Static-only output:** not supported for editor operation. It can ship
  fallback text, but needs a server-capable host to expose the API and storage.

## Documentation governance

- This file is the architecture map and current public-contract reference.
- `docs/threat-model.md` is the security status and decision-history record.
- `docs/npm-publishing.md` and `docs/npm-readiness-audit-2026-08-24.md` are
  deliberate delete-zone entries. Do not restore them without maintainer
  direction.
- The README and documentation site are reader-facing summaries. The site uses
  paired `apps/site/src/content/docs/en` and `tr` MDX entries to generate its
  navigation, routes, sitemap, and local search index. Keep both locales and
  their examples aligned with this map, especially the v2 API path and
  same-origin deployment model.
