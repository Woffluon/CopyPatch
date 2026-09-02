# `@copypatch/storage-postgres`

[English](README.md) | [Türkçe](README.tr.md)

PostgreSQL persistence for CopyPatch v3. The adapter uses the vendor-neutral `pg` driver and implements the `CopyPatchPersistence` contract from `@copypatch/core`.

## Install

```sh
pnpm add @copypatch/storage-postgres pg
```

Node.js 20 or newer is required.

## Connection string

```ts
import { createPostgresPersistence } from '@copypatch/storage-postgres';

const persistence = createPostgresPersistence({
  connectionString: process.env.COPYPATCH_DATABASE_URL!,
  schema: 'copypatch',
  publishingMode: 'draft',
});

await persistence.migrate();
```

The connection pool is created lazily. Call `close()` during application shutdown when the adapter owns the pool.

## Existing pool

```ts
import { Pool } from 'pg';
import { createPostgresPersistence } from '@copypatch/storage-postgres';

const pool = new Pool({ connectionString: process.env.COPYPATCH_DATABASE_URL });
const persistence = createPostgresPersistence({ pool, schema: 'copypatch' });

await persistence.migrate();
```

An injected pool remains owned by the caller and is not closed by `persistence.close()`.

## Operational behavior

- Run `migrate()` before serving traffic. Migration is idempotent and serialized with a PostgreSQL advisory transaction lock.
- Content compare-and-swap mutations lock per locale and check both published and draft revisions.
- Public reads do not initialize rows or otherwise write to PostgreSQL.
- Session APIs accept and persist token hashes only. Hash raw session, CSRF, address, or other rate-limit identifiers before calling the adapter.
- Rate-limit counters are persistent and updated atomically across application instances.

## PostgreSQL contract tests

The live database suite runs only when `COPYPATCH_TEST_POSTGRES_URL` is set:

```sh
COPYPATCH_TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test
```

Each run creates a randomized schema and drops only that schema during cleanup.
