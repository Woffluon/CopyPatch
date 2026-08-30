# @copypatch/node

[English](README.md) | [Türkçe](README.tr.md)

Node.js 20+ adapters and the `copypatch` project-scaffolding CLI for a `@copypatch/backend` runtime.

```ts
import { createNodeHandler } from '@copypatch/node';
import { createServer } from 'node:http';

createServer(createNodeHandler(backend)).listen(3000);
```

`expressMiddleware` must be mounted before body parsers and SPA fallbacks. `fastifyCopyPatchHandler` uses `request.raw` and `reply.hijack()`, so register it before content parsers. `createHonoHandler` returns the backend's native `Response`.

```sh
copypatch init --framework next --storage sqlite
copypatch doctor
printf 'a passphrase' | copypatch hash --stdin
```

`init` writes a server-only `copypatch.config.ts`, an environment example, and
one embedded same-origin v2 mount. It supports `next`, `astro`,
`react-router`, and `vite-node` with either `sqlite` or `postgres` storage.
The Next.js mount uses the canonical App Router path
`app/__copypatch/api/v2/[...path]/route.ts`; Astro uses the equivalent
`src/pages/__copypatch/api/v2/[...path].ts` endpoint. Re-running `init` is
safe: matching generated files are left intact, conflicting files are never
overwritten, and `--dry-run` writes nothing.

The CLI has no `serve` command. Mount a framework adapter in the host application instead.

`hash --stdin` avoids exposing a passphrase through process arguments. `--passphrase` is retained for compatibility but may be visible to other local processes.
