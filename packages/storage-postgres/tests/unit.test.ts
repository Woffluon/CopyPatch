import { describe, expect, it, vi } from 'vitest';
import {
  PostgresPersistence,
  createPostgresPersistence,
  type PgClientLike,
  type PgPoolLike,
  type PgQueryResult,
} from '../src/index.js';

function result(rows: Record<string, unknown>[] = [], rowCount = rows.length): PgQueryResult {
  return { rows, rowCount };
}

describe('PostgresPersistence without a live database', () => {
  it('keeps an empty public read side-effect free', async () => {
    const statements: string[] = [];
    const client: PgClientLike = {
      async query(sql) {
        statements.push(sql);
        return result();
      },
      release() {},
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as PgPoolLike;
    const persistence = createPostgresPersistence({ pool, schema: 'test_empty' });

    await expect(persistence.readPublished('en')).resolves.toEqual({ revision: 1, content: {} });
    expect(pool.query).not.toHaveBeenCalled();
    expect(statements.at(0)).toMatch(/^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
    expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.filter((sql) => /^(?:INSERT|UPDATE|DELETE)\b/.test(sql.trimStart()))).toEqual([]);
  });

  it('reports an unhealthy pool without throwing', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as PgPoolLike;

    await expect(new PostgresPersistence(pool).health()).resolves.toEqual({
      ok: false,
      message: 'database unavailable',
    });
  });

  it('reports missing or unmigrated schemas as unhealthy', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue(result()),
    } as unknown as PgPoolLike;

    await expect(new PostgresPersistence(pool, { schema: 'missing_schema' }).health()).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/schema.*not migrated|missing/i),
    });
    expect(pool.query).toHaveBeenCalled();
    expect(String((pool.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain('information_schema.tables');
  });

  it('reads public and editor snapshots inside repeatable-read transactions', async () => {
    const statements: string[] = [];
    const client: PgClientLike = {
      async query(sql) {
        statements.push(sql);
        if (sql.includes('SELECT published_revision')) {
          return result([{ published_revision: 2, draft_revision: 3 }]);
        }
        if (sql.includes('published_text IS NOT NULL')) {
          return result([{ content_key: 'hero.title', published_text: 'Published', draft_text: null }]);
        }
        if (sql.includes('FROM "snapshots"."content_entries"')) {
          return result([{ content_key: 'hero.title', published_text: 'Published', draft_text: 'Draft' }]);
        }
        return result();
      },
      release() {},
    };
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('snapshot reads must use a transaction client')),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as PgPoolLike;
    const persistence = createPostgresPersistence({
      pool,
      schema: 'snapshots',
      publishingMode: 'draft',
    });

    await expect(persistence.readPublished('en')).resolves.toEqual({
      revision: 2,
      content: { 'hero.title': 'Published' },
    });
    await expect(persistence.readEditor('en')).resolves.toEqual({
      locale: 'en',
      publishedRevision: 2,
      draftRevision: 3,
      publishingMode: 'draft',
      published: { 'hero.title': 'Published' },
      drafts: { 'hero.title': 'Draft' },
    });
    expect(pool.query).not.toHaveBeenCalled();
    expect(statements.filter((sql) => sql.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'))).toHaveLength(2);
    expect(statements.filter((sql) => sql === 'COMMIT')).toHaveLength(2);
  });

  it('rolls back a failed content write with no partial commit', async () => {
    const statements: string[] = [];
    const client: PgClientLike = {
      async query(sql) {
        statements.push(sql);
        if (sql.includes('SELECT published_revision')) {
          return result([{ published_revision: 1, draft_revision: 1 }]);
        }
        if (sql.includes('INSERT INTO') && sql.includes('content_entries')) {
          throw new Error('injected write failure');
        }
        return result();
      },
      release() {},
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as PgPoolLike;
    const persistence = createPostgresPersistence({ pool, schema: 'test_rollback' });

    await expect(
      persistence.saveDrafts({
        locale: 'en',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 1,
        changes: [{ key: 'hero.title', text: 'New title' }],
      }),
    ).rejects.toThrow('injected write failure');
    expect(statements.at(0)).toBe('BEGIN');
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
  });

  it('returns the latest snapshot on a two-revision conflict without writing', async () => {
    const transactionStatements: string[] = [];
    const client: PgClientLike = {
      async query(sql) {
        transactionStatements.push(sql);
        if (sql.includes('SELECT published_revision')) {
          return result([{ published_revision: 4, draft_revision: 7 }]);
        }
        if (sql.includes('FROM "test_conflict"."content_entries"')) {
          return result([{ content_key: 'hero.title', published_text: 'Published', draft_text: 'Draft' }]);
        }
        return result();
      },
      release() {},
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as PgPoolLike;
    const persistence = createPostgresPersistence({
      pool,
      schema: 'test_conflict',
      publishingMode: 'draft',
    });

    await expect(
      persistence.discardDrafts({
        locale: 'en',
        expectedPublishedRevision: 3,
        expectedDraftRevision: 7,
      }),
    ).resolves.toEqual({
      status: 'conflict',
      latest: {
        locale: 'en',
        publishedRevision: 4,
        draftRevision: 7,
        publishingMode: 'draft',
        published: { 'hero.title': 'Published' },
        drafts: { 'hero.title': 'Draft' },
      },
    });
    expect(transactionStatements).toContain('ROLLBACK');
    expect(
      transactionStatements.some((sql) => /^(?:INSERT|UPDATE|DELETE)\b/.test(sql.trimStart())),
    ).toBe(false);
  });

  it('rejects unsafe schema names before any query can run', () => {
    const pool = { query: vi.fn() } as unknown as PgPoolLike;
    expect(() => createPostgresPersistence({ pool, schema: 'public; DROP SCHEMA public' })).toThrow(
      'Invalid PostgreSQL schema name',
    );
  });

  it('accepts only lowercase SHA-256 hex hashes for persisted secrets and rate-limit keys', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue(result()),
    } as unknown as PgPoolLike;
    const persistence = createPostgresPersistence({ pool, schema: 'hashes' });
    const validSession = {
      tokenHash: 'a'.repeat(64),
      csrfTokenHash: 'b'.repeat(64),
      subject: 'editor-1',
      roles: ['editor', 'publisher'] as const,
      createdAt: 100,
      lastSeenAt: 110,
      idleExpiresAt: 200,
      absoluteExpiresAt: 300,
    };

    await expect(persistence.createSession(validSession)).resolves.toBeUndefined();
    await expect(persistence.createSession({ ...validSession, tokenHash: 'raw-session-token' })).rejects.toThrow(/tokenHash.*SHA-256/);
    await expect(persistence.createSession({ ...validSession, csrfTokenHash: 'A'.repeat(64) })).rejects.toThrow(/csrfTokenHash.*SHA-256/);
    await expect(persistence.readSession('raw-session-token')).rejects.toThrow(/tokenHash.*SHA-256/);
    await expect(persistence.touchSession(validSession.tokenHash, {
      lastSeenAt: 120,
      idleExpiresAt: 220,
      csrfTokenHash: 'rotated-csrf-hash',
    })).rejects.toThrow(/csrfTokenHash.*SHA-256/);
    await expect(persistence.deleteSession('g'.repeat(64))).rejects.toThrow(/tokenHash.*SHA-256/);
    await expect(persistence.consumeRateLimit({
      keyHash: 'ip-hash-only',
      limit: 1,
      windowMs: 1_000,
      now: 10_000,
    })).rejects.toThrow(/keyHash.*SHA-256/);
  });

  it('rejects invalid mutation, session, and rate-limit boundaries before accessing PostgreSQL', async () => {
    const pool = {
      query: vi.fn(),
      connect: vi.fn(),
    } as unknown as PgPoolLike;
    const persistence = createPostgresPersistence({ pool, schema: 'validation_boundaries' });
    const session = {
      tokenHash: 'a'.repeat(64),
      csrfTokenHash: 'b'.repeat(64),
      subject: 'editor-1',
      roles: ['editor'] as const,
      createdAt: 100,
      lastSeenAt: 110,
      idleExpiresAt: 200,
      absoluteExpiresAt: 300,
    };

    await expect(
      persistence.saveDrafts({
        locale: 'en',
        expectedPublishedRevision: 0,
        expectedDraftRevision: 1,
        changes: [],
      }),
    ).rejects.toThrow(/expectedPublishedRevision.*positive safe integer/);
    await expect(
      persistence.saveDrafts({
        locale: 'en',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 1,
        changes: [{ key: 'hero.title', text: 42 as unknown as string }],
      }),
    ).rejects.toThrow(/Text exceeds maximum allowed length/);
    await expect(persistence.createSession({ ...session, subject: '' })).rejects.toThrow(/subject must not be empty/);
    await expect(persistence.createSession({ ...session, roles: [] })).rejects.toThrow(/roles must not be empty/);
    await expect(
      persistence.touchSession(session.tokenHash, { lastSeenAt: -1, idleExpiresAt: 220 }),
    ).rejects.toThrow(/lastSeenAt.*non-negative safe integer/);
    await expect(
      persistence.consumeRateLimit({ keyHash: 'c'.repeat(64), limit: 0, windowMs: 1_000, now: 1 }),
    ).rejects.toThrow(/limit.*positive safe integer/);
    await expect(
      persistence.consumeRateLimit({ keyHash: 'c'.repeat(64), limit: 1, windowMs: 0, now: 1 }),
    ).rejects.toThrow(/windowMs.*positive safe integer/);
    await expect(
      persistence.consumeRateLimit({
        keyHash: 'c'.repeat(64),
        limit: 1,
        windowMs: 1,
        now: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toThrow(/resetAt exceeds the safe integer range/);
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
