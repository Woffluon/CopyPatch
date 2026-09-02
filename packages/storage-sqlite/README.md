# @copypatch/storage-sqlite

[English](README.md) | [Türkçe](README.tr.md)

SQLite persistence for CopyPatch v3. The adapter implements the asynchronous
`CopyPatchPersistence` contract while using transactional, synchronous SQLite
operations internally.

## Install

```bash
pnpm add @copypatch/core @copypatch/storage-sqlite better-sqlite3
```

Node.js 20 or newer is required.

## Usage

```ts
import { createSQLitePersistence } from '@copypatch/storage-sqlite';

const persistence = createSQLitePersistence('./copypatch.sqlite');
await persistence.migrate();

try {
  const snapshot = await persistence.readPublished('en');
  console.log(snapshot);
} finally {
  persistence.close();
}
```

The factory also accepts `{ filename, busyTimeoutMs }`. Call `migrate()` before
the first operation on a new database. Migrations are versioned and idempotent.

Content mutations use atomic compare-and-swap checks against both published
and draft revisions. Sessions and rate limits are stored in SQLite so they
survive process restarts. Session callers must pass cryptographic token hashes;
the adapter never accepts or derives raw session tokens.

## Exports

- `createSQLitePersistence(filenameOrOptions)`
- `SQLitePersistence`
- `SQLitePersistenceOptions`

CopyPatch is ESM-only. See the
[CopyPatch repository](https://github.com/Woffluon/CopyPatch) for complete API
documentation and examples.
