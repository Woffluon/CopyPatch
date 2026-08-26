# @copypatch/backend

Framework-neutral CopyPatch v2 backend runtime. It exposes a Web
`Request`/`Response` API that is mounted inside the host application, so
CopyPatch does not require a separate server, port, proxy, or CORS policy.

## Install

```bash
pnpm add @copypatch/backend @copypatch/storage-sqlite
```

Use `@copypatch/storage-postgres` instead when the application runs on
multiple instances or does not have persistent local disk.

## Minimal usage

```ts
import { createCopyPatchBackend } from '@copypatch/backend';
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const persistence = createSQLitePersistence('./data/copypatch.sqlite');
await persistence.migrate();

export const backend = createCopyPatchBackend({
  persistence,
  passphraseHash: process.env.COPYPATCH_PASSPHRASE_HASH!,
});

export const handle = (request: Request) => backend.handle(request);
```

Mount `handle` at `\/__copypatch\/api\/v2` in the same deployment as the host
application. Unsafe requests require an exact same-origin `Origin` header.
CopyPatch does not emit CORS headers.

`passphraseHash` must be an Argon2id encoded hash. As an alternative, provide
a host `authAdapter`; the two authentication modes are mutually exclusive.
Host authentication context is passed as the second argument to `handle` and
must not be serialized into request headers.

For server rendering, `backend.readPublished(locale)` reads storage directly
and returns a safe public snapshot fallback if storage is temporarily
unavailable.

## Exports

- `createCopyPatchBackend(options)`
- `CopyPatchBackend`
- `hashToken`, `hashRateLimitKey`, and token helpers
- `SESSION_COOKIE_NAME`

CopyPatch is ESM-only and requires Node.js 20 or newer.

## License

MIT
