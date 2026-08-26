import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CopyPatchPersistence, StoredSession } from '@copypatch/core';
import { createSQLitePersistence, SQLitePersistence } from '../src/index.js';

const temporaryDirectories: string[] = [];

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'copypatch-storage-'));
  temporaryDirectories.push(directory);
  return join(directory, 'copypatch.sqlite');
}

function contract(value: CopyPatchPersistence): CopyPatchPersistence {
  return value;
}

async function migrated(filename = databasePath()): Promise<SQLitePersistence> {
  const persistence = createSQLitePersistence(filename);
  await persistence.migrate();
  return persistence;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLitePersistence', () => {
  it('implements the async core contract and migrates a versioned schema idempotently', async () => {
    const filename = databasePath();
    const persistence = contract(createSQLitePersistence(filename));

    expect(await persistence.health()).toEqual(expect.objectContaining({ ok: false }));
    await persistence.migrate();
    await persistence.migrate();
    expect(await persistence.health()).toEqual({ ok: true });
    (persistence as SQLitePersistence).close();

    const sqlite = new Database(filename, { readonly: true });
    expect(sqlite.pragma('user_version', { simple: true })).toBe(1);
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();
    expect(tables).toEqual(expect.arrayContaining(['content_entries', 'content_state', 'rate_limits', 'sessions']));
    sqlite.close();
  });

  it('rejects the unsupported v1 schema without modifying legacy data', async () => {
    const filename = databasePath();
    const sqlite = new Database(filename);
    sqlite.exec(`
      CREATE TABLE content_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        locale TEXT NOT NULL,
        published_text TEXT,
        draft_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX key_locale_idx ON content_entries (key, locale);
      CREATE TABLE content_state (
        locale TEXT PRIMARY KEY,
        published_revision INTEGER NOT NULL DEFAULT 1,
        draft_revision INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        csrf_token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        idle_expires_at INTEGER NOT NULL,
        absolute_expires_at INTEGER NOT NULL
      );
      INSERT INTO content_entries
        (key, locale, published_text, draft_text, created_at, updated_at)
      VALUES ('title', 'en', 'Published', 'Draft', 1, 1);
      INSERT INTO content_state
        (locale, published_revision, draft_revision, updated_at)
      VALUES ('en', 4, 7, 1);
      INSERT INTO sessions
        (token_hash, csrf_token_hash, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
      VALUES ('${'a'.repeat(64)}', '${'b'.repeat(64)}', 10, 11, 20, 30);
    `);
    sqlite.close();

    const persistence = createSQLitePersistence(filename);
    await expect(persistence.migrate()).rejects.toThrow('v1 data migration is not supported');
    persistence.close();

    const unchanged = new Database(filename, { readonly: true });
    expect(unchanged.prepare('SELECT key, published_text, draft_text FROM content_entries').get()).toEqual({
      key: 'title', published_text: 'Published', draft_text: 'Draft',
    });
    expect(unchanged.pragma('user_version', { simple: true })).toBe(0);
    unchanged.close();
  });

  it('returns immutable empty snapshots without writing state and isolates locales', async () => {
    const filename = databasePath();
    const persistence = await migrated(filename);

    const first = await persistence.readPublished('en');
    first.content.injected = 'client mutation';
    expect(await persistence.readPublished('en')).toEqual({ revision: 1, content: {} });

    const sqlite = new Database(filename, { readonly: true });
    expect(sqlite.prepare('SELECT count(*) FROM content_state').pluck().get()).toBe(0);
    sqlite.close();

    await persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1,
      changes: [{ key: 'hero.title', text: 'Hello' }],
    });
    expect((await persistence.readEditor('en')).drafts).toEqual({ 'hero.title': 'Hello' });
    expect(await persistence.readEditor('tr')).toEqual({
      locale: 'tr', publishedRevision: 1, draftRevision: 1,
      publishingMode: 'draft', published: {}, drafts: {},
    });
    persistence.close();
  });

  it('reads public and editor snapshots inside read transactions', async () => {
    const persistence = await migrated();
    try {
      const sqlite = (persistence as unknown as { sqlite: Database.Database }).sqlite;
      const transaction = sqlite.transaction.bind(sqlite);
      let readTransactions = 0;
      sqlite.transaction = ((fn: (...args: unknown[]) => unknown) => {
        const wrapped = (...args: unknown[]) => {
          readTransactions++;
          return fn(...args);
        };
        return transaction(wrapped);
      }) as typeof sqlite.transaction;

      await expect(persistence.readPublished('en')).resolves.toEqual({ revision: 1, content: {} });
      await expect(persistence.readEditor('en')).resolves.toMatchObject({
        locale: 'en',
        publishedRevision: 1,
        draftRevision: 1,
      });
      expect(readTransactions).toBe(2);
    } finally {
      persistence.close();
    }
  });

  it('saves, publishes, and discards drafts with atomic two-revision CAS', async () => {
    const persistence = await migrated();

    expect(await persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1,
      changes: [{ key: 'title', text: 'Draft title' }, { key: 'cta', text: 'Go' }],
    })).toEqual({ status: 'ok', value: { publishedRevision: 1, draftRevision: 2 } });
    expect(await persistence.readPublished('en')).toEqual({ revision: 1, content: {} });

    const stalePublished = await persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 2, expectedDraftRevision: 2,
      changes: [{ key: 'title', text: 'must not write' }],
    });
    expect(stalePublished).toEqual({ status: 'conflict', latest: await persistence.readEditor('en') });

    const stalePublish = await persistence.publishDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1,
    });
    expect(stalePublish).toEqual({ status: 'conflict', latest: await persistence.readEditor('en') });
    expect((await persistence.readEditor('en')).drafts.title).toBe('Draft title');

    expect(await persistence.publishDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 2,
    })).toEqual({
      status: 'ok',
      value: { publishedRevision: 2, draftRevision: 3, promotedCount: 2 },
    });
    expect(await persistence.readPublished('en')).toEqual({
      revision: 2, content: { cta: 'Go', title: 'Draft title' },
    });
    expect((await persistence.readEditor('en')).drafts).toEqual({});

    await persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 2, expectedDraftRevision: 3,
      changes: [{ key: 'title', text: 'Discard me' }],
    });
    const staleDiscard = await persistence.discardDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 4,
    });
    expect(staleDiscard).toEqual({ status: 'conflict', latest: await persistence.readEditor('en') });
    expect((await persistence.readEditor('en')).drafts.title).toBe('Discard me');
    expect(await persistence.discardDrafts({
      locale: 'en', expectedPublishedRevision: 2, expectedDraftRevision: 4,
    })).toEqual({
      status: 'ok',
      value: { publishedRevision: 2, draftRevision: 5, discardedCount: 1 },
    });
    expect(await persistence.readPublished('en')).toEqual({
      revision: 2, content: { cta: 'Go', title: 'Draft title' },
    });
    persistence.close();
  });

  it('rolls back the entire save transaction when an injected SQLite constraint aborts a later change', async () => {
    const filename = databasePath();
    let persistence = await migrated(filename);
    persistence.close();
    const sqlite = new Database(filename);
    sqlite.exec(`
      CREATE TRIGGER reject_boom BEFORE INSERT ON content_entries
      WHEN NEW.content_key = 'boom'
      BEGIN SELECT RAISE(ABORT, 'injected constraint failure'); END;
    `);
    sqlite.close();
    persistence = createSQLitePersistence(filename);

    await expect(persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1,
      changes: [{ key: 'first', text: 'would partially write' }, { key: 'boom', text: 'fail' }],
    })).rejects.toThrow('injected constraint failure');
    expect(await persistence.readEditor('en')).toEqual({
      locale: 'en', publishedRevision: 1, draftRevision: 1,
      publishingMode: 'draft', published: {}, drafts: {},
    });
    persistence.close();
  });

  it('rolls back promote and revision changes when publish hits a constraint failure', async () => {
    const filename = databasePath();
    let persistence = await migrated(filename);
    await persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1,
      changes: [{ key: 'safe', text: 'safe' }, { key: 'boom', text: 'boom' }],
    });
    persistence.close();
    const sqlite = new Database(filename);
    sqlite.exec(`
      CREATE TRIGGER reject_publish BEFORE UPDATE OF published_text ON content_entries
      WHEN NEW.content_key = 'boom'
      BEGIN SELECT RAISE(ABORT, 'injected publish failure'); END;
    `);
    sqlite.close();
    persistence = createSQLitePersistence(filename);

    await expect(persistence.publishDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 2,
    })).rejects.toThrow('injected publish failure');
    expect(await persistence.readEditor('en')).toEqual({
      locale: 'en', publishedRevision: 1, draftRevision: 2,
      publishingMode: 'draft', published: {}, drafts: { boom: 'boom', safe: 'safe' },
    });
    persistence.close();
  });

  it('persists snapshots and sessions across reopen while storing token hashes and expiry fields', async () => {
    const filename = databasePath();
    let persistence = await migrated(filename);
    await persistence.saveDrafts({
      locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1,
      changes: [{ key: 'title', text: 'Persistent' }],
    });
    const session: StoredSession = {
      tokenHash: 'a'.repeat(64), csrfTokenHash: 'b'.repeat(64), subject: 'editor-1',
      roles: ['editor', 'publisher'], createdAt: 100, lastSeenAt: 110,
      idleExpiresAt: 200, absoluteExpiresAt: 300,
    };
    await persistence.createSession(session);
    persistence.close();

    persistence = createSQLitePersistence(filename);
    expect((await persistence.readEditor('en')).drafts).toEqual({ title: 'Persistent' });
    expect(await persistence.readSession(session.tokenHash)).toEqual(session);
    await expect(persistence.readSession('raw-session-token')).rejects.toThrow(/tokenHash.*SHA-256/);
    expect(await persistence.touchSession(session.tokenHash, {
      lastSeenAt: 120, idleExpiresAt: 220, csrfTokenHash: 'c'.repeat(64),
    })).toEqual({ ...session, lastSeenAt: 120, idleExpiresAt: 220, csrfTokenHash: 'c'.repeat(64) });
    await persistence.deleteSession(session.tokenHash);
    expect(await persistence.readSession(session.tokenHash)).toBeNull();
    persistence.close();

    const bytes = readFileSync(filename);
    expect(bytes.includes(Buffer.from('raw-session-token'))).toBe(false);
  });

  it('atomically enforces a persistent rate limit across connections and resets at the window boundary', async () => {
    const filename = databasePath();
    const first = await migrated(filename);
    const second = createSQLitePersistence(filename);
    const input = { keyHash: 'd'.repeat(64), limit: 3, windowMs: 1_000, now: 10_000 };

    const decisions = await Promise.all([
      first.consumeRateLimit(input), second.consumeRateLimit(input),
      first.consumeRateLimit(input), second.consumeRateLimit(input),
      first.consumeRateLimit(input), second.consumeRateLimit(input),
    ]);
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(3);
    expect(decisions.at(-1)).toEqual({ allowed: false, remaining: 0, resetAt: 11_000 });
    first.close();
    second.close();

    const reopened = createSQLitePersistence(filename);
    expect(await reopened.consumeRateLimit(input)).toEqual({ allowed: false, remaining: 0, resetAt: 11_000 });
    expect(await reopened.consumeRateLimit({ ...input, now: 11_000 })).toEqual({
      allowed: true, remaining: 2, resetAt: 12_000,
    });
    reopened.close();
  });

  it('accepts only lowercase SHA-256 hex hashes for persisted secrets and rate-limit keys', async () => {
    const persistence = await migrated();
    try {
      const validHash = 'a'.repeat(64);
      const validSession: StoredSession = {
        tokenHash: validHash,
        csrfTokenHash: 'b'.repeat(64),
        subject: 'editor-1',
        roles: ['editor', 'publisher'],
        createdAt: 100,
        lastSeenAt: 110,
        idleExpiresAt: 200,
        absoluteExpiresAt: 300,
      };

      await expect(persistence.createSession(validSession)).resolves.toBeUndefined();
      await expect(persistence.readSession(validHash)).resolves.toEqual(validSession);
      await expect(persistence.touchSession(validHash, {
        lastSeenAt: 120,
        idleExpiresAt: 220,
        csrfTokenHash: 'c'.repeat(64),
      })).resolves.toMatchObject({ csrfTokenHash: 'c'.repeat(64) });
      await expect(persistence.consumeRateLimit({
        keyHash: 'd'.repeat(64),
        limit: 1,
        windowMs: 1_000,
        now: 10_000,
      })).resolves.toMatchObject({ allowed: true });

      await expect(persistence.createSession({ ...validSession, tokenHash: 'raw-session-token' })).rejects.toThrow(/tokenHash.*SHA-256/);
      await expect(persistence.createSession({ ...validSession, csrfTokenHash: 'A'.repeat(64) })).rejects.toThrow(/csrfTokenHash.*SHA-256/);
      await expect(persistence.readSession('raw-session-token')).rejects.toThrow(/tokenHash.*SHA-256/);
      await expect(persistence.touchSession(validHash, {
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
    } finally {
      persistence.close();
    }
  });
});
