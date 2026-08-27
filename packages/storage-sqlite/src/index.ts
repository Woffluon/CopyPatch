import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  CopyPatchPersistence,
  DiscardDraftsCommand,
  DiscardDraftsResult,
  EditorSnapshot,
  PersistenceHealth,
  PersistenceMutationResult,
  PublishDraftsCommand,
  PublishDraftsResult,
  RateLimitDecision,
  RateLimitInput,
  SaveDraftsCommand,
  SaveDraftsResult,
  SessionTouch,
  StoredSession,
} from '@copypatch/core';

const SCHEMA_VERSION = 1;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface SQLitePersistenceOptions {
  filename: string;
  busyTimeoutMs?: number;
}

interface ContentStateRow {
  published_revision: number;
  draft_revision: number;
}

interface ContentEntryRow {
  content_key: string;
  published_text: string | null;
  draft_text: string | null;
}

interface SessionRow {
  token_hash: string;
  csrf_token_hash: string;
  subject: string;
  roles_json: string;
  created_at: number;
  last_seen_at: number;
  idle_expires_at: number;
  absolute_expires_at: number;
}

interface RateLimitRow {
  count: number;
  reset_at: number;
}

export class SQLitePersistence implements CopyPatchPersistence {
  private readonly sqlite: Database.Database;
  private readonly statementCache = new Map<string, Database.Statement>();
  private closed = false;

  constructor(filenameOrOptions: string | SQLitePersistenceOptions) {
    const options = typeof filenameOrOptions === 'string'
      ? { filename: filenameOrOptions }
      : filenameOrOptions;
    if (!options.filename) throw new TypeError('A SQLite filename is required.');
    const filename = resolve(options.filename);
    const directory = dirname(filename);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });

    this.sqlite = new Database(filename);
    this.sqlite.pragma(`busy_timeout = ${this.positiveInteger(options.busyTimeoutMs ?? 5_000, 'busyTimeoutMs')}`);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('synchronous = NORMAL');
    this.sqlite.pragma('foreign_keys = ON');
    try {
      chmodSync(filename, 0o600);
    } catch {
      // Windows and some mounted filesystems do not expose POSIX file modes.
    }
  }

  async migrate(): Promise<void> {
    this.assertOpen();
    const current = this.sqlite.pragma('user_version', { simple: true }) as number;
    if (current > SCHEMA_VERSION) {
      throw new Error(`SQLite schema version ${current} is newer than supported version ${SCHEMA_VERSION}.`);
    }
    if (current === SCHEMA_VERSION) return;

    const managedTables = this.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('content_state', 'content_entries', 'sessions', 'rate_limits')
    `).pluck().all() as string[];
    if (managedTables.length > 0) {
      throw new Error('An unversioned or CopyPatch v1 database was detected. CopyPatch v1 data migration is not supported; configure a new v2 database.');
    }

    this.sqlite.transaction(() => {
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS content_state (
          locale TEXT PRIMARY KEY,
          published_revision INTEGER NOT NULL CHECK (published_revision >= 1),
          draft_revision INTEGER NOT NULL CHECK (draft_revision >= 1)
        );

        CREATE TABLE IF NOT EXISTS content_entries (
          locale TEXT NOT NULL,
          content_key TEXT NOT NULL,
          published_text TEXT,
          draft_text TEXT,
          PRIMARY KEY (locale, content_key)
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          csrf_token_hash TEXT NOT NULL,
          subject TEXT NOT NULL,
          roles_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          idle_expires_at INTEGER NOT NULL,
          absolute_expires_at INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS rate_limits (
          key_hash TEXT PRIMARY KEY,
          count INTEGER NOT NULL CHECK (count >= 1),
          reset_at INTEGER NOT NULL
        ) WITHOUT ROWID;

        PRAGMA user_version = 1;
      `);
    }).immediate();
  }

  async health(): Promise<PersistenceHealth> {
    try {
      this.assertOpen();
      const version = this.sqlite.pragma('user_version', { simple: true }) as number;
      if (version !== SCHEMA_VERSION) {
        return { ok: false, message: `SQLite schema version is ${version}; expected ${SCHEMA_VERSION}.` };
      }
      this.prepare('SELECT 1 FROM content_state LIMIT 1').get();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'SQLite health check failed.' };
    }
  }

  async readPublished(locale: string) {
    this.assertOpen();
    return this.sqlite.transaction((value: string) => {
      const state = this.readState(value);
      const rows = this.prepare(`
        SELECT content_key, published_text, draft_text
        FROM content_entries
        WHERE locale = ? AND published_text IS NOT NULL
        ORDER BY content_key
      `).all(value) as ContentEntryRow[];
      const content: Record<string, string> = {};
      for (const row of rows) {
        if (row.published_text !== null) content[row.content_key] = row.published_text;
      }
      return { revision: state.publishedRevision, content };
    }).deferred(locale);
  }

  async readEditor(locale: string): Promise<EditorSnapshot> {
    this.assertOpen();
    return this.sqlite.transaction((value: string) => this.editorSnapshot(value)).deferred(locale);
  }

  async saveDrafts(command: SaveDraftsCommand): Promise<PersistenceMutationResult<SaveDraftsResult>> {
    this.assertOpen();
    return this.sqlite.transaction((input: SaveDraftsCommand): PersistenceMutationResult<SaveDraftsResult> => {
      const current = this.editorSnapshot(input.locale);
      if (!this.revisionsMatch(current, input.expectedPublishedRevision, input.expectedDraftRevision)) {
        return { status: 'conflict', latest: current };
      }

      const write = this.prepare(`
        INSERT INTO content_entries (locale, content_key, published_text, draft_text)
        VALUES (?, ?, NULL, ?)
        ON CONFLICT (locale, content_key) DO UPDATE SET draft_text = excluded.draft_text
      `);
      for (const change of input.changes) write.run(input.locale, change.key, change.text);

      const draftRevision = current.draftRevision + 1;
      this.writeState(input.locale, current.publishedRevision, draftRevision);
      return {
        status: 'ok',
        value: { publishedRevision: current.publishedRevision, draftRevision },
      };
    }).immediate(command);
  }

  async publishDrafts(command: PublishDraftsCommand): Promise<PersistenceMutationResult<PublishDraftsResult>> {
    this.assertOpen();
    return this.sqlite.transaction((input: PublishDraftsCommand): PersistenceMutationResult<PublishDraftsResult> => {
      const current = this.editorSnapshot(input.locale);
      if (!this.revisionsMatch(current, input.expectedPublishedRevision, input.expectedDraftRevision)) {
        return { status: 'conflict', latest: current };
      }

      const promotedCount = (this.prepare(`
        SELECT count(*) FROM content_entries WHERE locale = ? AND draft_text IS NOT NULL
      `).pluck().get(input.locale) as number);
      this.prepare(`
        UPDATE content_entries
        SET published_text = draft_text, draft_text = NULL
        WHERE locale = ? AND draft_text IS NOT NULL
      `).run(input.locale);

      const publishedRevision = current.publishedRevision + 1;
      const draftRevision = current.draftRevision + 1;
      this.writeState(input.locale, publishedRevision, draftRevision);
      return {
        status: 'ok',
        value: { publishedRevision, draftRevision, promotedCount },
      };
    }).immediate(command);
  }

  async discardDrafts(command: DiscardDraftsCommand): Promise<PersistenceMutationResult<DiscardDraftsResult>> {
    this.assertOpen();
    return this.sqlite.transaction((input: DiscardDraftsCommand): PersistenceMutationResult<DiscardDraftsResult> => {
      const current = this.editorSnapshot(input.locale);
      if (!this.revisionsMatch(current, input.expectedPublishedRevision, input.expectedDraftRevision)) {
        return { status: 'conflict', latest: current };
      }

      const discardedCount = (this.prepare(`
        SELECT count(*) FROM content_entries WHERE locale = ? AND draft_text IS NOT NULL
      `).pluck().get(input.locale) as number);
      this.prepare(`
        UPDATE content_entries SET draft_text = NULL
        WHERE locale = ? AND draft_text IS NOT NULL
      `).run(input.locale);

      const draftRevision = current.draftRevision + 1;
      this.writeState(input.locale, current.publishedRevision, draftRevision);
      return {
        status: 'ok',
        value: { publishedRevision: current.publishedRevision, draftRevision, discardedCount },
      };
    }).immediate(command);
  }

  async createSession(session: StoredSession): Promise<void> {
    this.assertOpen();
    assertHash('tokenHash', session.tokenHash);
    assertHash('csrfTokenHash', session.csrfTokenHash);
    this.prepare(`
      INSERT INTO sessions (
        token_hash, csrf_token_hash, subject, roles_json, created_at,
        last_seen_at, idle_expires_at, absolute_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.tokenHash,
      session.csrfTokenHash,
      session.subject,
      JSON.stringify(session.roles),
      session.createdAt,
      session.lastSeenAt,
      session.idleExpiresAt,
      session.absoluteExpiresAt,
    );
  }

  async readSession(tokenHash: string): Promise<StoredSession | null> {
    this.assertOpen();
    assertHash('tokenHash', tokenHash);
    const row = this.prepare(`
      SELECT token_hash, csrf_token_hash, subject, roles_json, created_at,
             last_seen_at, idle_expires_at, absolute_expires_at
      FROM sessions WHERE token_hash = ?
    `).get(tokenHash) as SessionRow | undefined;
    return row ? this.sessionFromRow(row) : null;
  }

  async touchSession(tokenHash: string, update: SessionTouch): Promise<StoredSession | null> {
    this.assertOpen();
    assertHash('tokenHash', tokenHash);
    if (update.csrfTokenHash !== undefined) assertHash('csrfTokenHash', update.csrfTokenHash);
    const result = update.csrfTokenHash === undefined
      ? this.prepare(`
          UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE token_hash = ?
        `).run(update.lastSeenAt, update.idleExpiresAt, tokenHash)
      : this.prepare(`
          UPDATE sessions
          SET last_seen_at = ?, idle_expires_at = ?, csrf_token_hash = ?
          WHERE token_hash = ?
        `).run(update.lastSeenAt, update.idleExpiresAt, update.csrfTokenHash, tokenHash);
    if (result.changes === 0) return null;
    return this.readSession(tokenHash);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.assertOpen();
    assertHash('tokenHash', tokenHash);
    this.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  async consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
    this.assertOpen();
    assertHash('keyHash', input.keyHash);
    this.positiveInteger(input.limit, 'limit');
    this.positiveInteger(input.windowMs, 'windowMs');
    if (!Number.isSafeInteger(input.now)) throw new TypeError('now must be a safe integer.');

    return this.sqlite.transaction((value: RateLimitInput): RateLimitDecision => {
      const current = this.prepare(`
        SELECT count, reset_at FROM rate_limits WHERE key_hash = ?
      `).get(value.keyHash) as RateLimitRow | undefined;
      const reset = current === undefined || current.reset_at <= value.now;
      const count = reset ? 1 : current.count + 1;
      const resetAt = reset ? value.now + value.windowMs : current.reset_at;
      this.prepare(`
        INSERT INTO rate_limits (key_hash, count, reset_at) VALUES (?, ?, ?)
        ON CONFLICT (key_hash) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at
      `).run(value.keyHash, count, resetAt);
      return {
        allowed: count <= value.limit,
        remaining: Math.max(0, value.limit - count),
        resetAt,
      };
    }).immediate(input);
  }

  close(): void {
    if (this.closed) return;
    this.statementCache.clear();
    this.sqlite.close();
    this.closed = true;
  }

  private prepare(sql: string): Database.Statement {
    let statement = this.statementCache.get(sql);
    if (!statement) {
      statement = this.sqlite.prepare(sql);
      this.statementCache.set(sql, statement);
    }
    return statement;
  }

  private editorSnapshot(locale: string): EditorSnapshot {
    const state = this.readState(locale);
    const rows = this.prepare(`
      SELECT content_key, published_text, draft_text
      FROM content_entries
      WHERE locale = ?
      ORDER BY content_key
    `).all(locale) as ContentEntryRow[];
    const published: Record<string, string> = {};
    const drafts: Record<string, string> = {};
    for (const row of rows) {
      if (row.published_text !== null) published[row.content_key] = row.published_text;
      if (row.draft_text !== null) drafts[row.content_key] = row.draft_text;
    }
    return {
      locale,
      publishedRevision: state.publishedRevision,
      draftRevision: state.draftRevision,
      publishingMode: 'draft',
      published,
      drafts,
    };
  }

  private readState(locale: string): { publishedRevision: number; draftRevision: number } {
    const row = this.prepare(`
      SELECT published_revision, draft_revision FROM content_state WHERE locale = ?
    `).get(locale) as ContentStateRow | undefined;
    return row
      ? { publishedRevision: row.published_revision, draftRevision: row.draft_revision }
      : { publishedRevision: 1, draftRevision: 1 };
  }

  private writeState(locale: string, publishedRevision: number, draftRevision: number): void {
    this.prepare(`
      INSERT INTO content_state (locale, published_revision, draft_revision)
      VALUES (?, ?, ?)
      ON CONFLICT (locale) DO UPDATE SET
        published_revision = excluded.published_revision,
        draft_revision = excluded.draft_revision
    `).run(locale, publishedRevision, draftRevision);
  }

  private revisionsMatch(snapshot: EditorSnapshot, publishedRevision: number, draftRevision: number): boolean {
    return snapshot.publishedRevision === publishedRevision && snapshot.draftRevision === draftRevision;
  }

  private sessionFromRow(row: SessionRow): StoredSession {
    const roles = JSON.parse(row.roles_json) as StoredSession['roles'];
    return {
      tokenHash: row.token_hash,
      csrfTokenHash: row.csrf_token_hash,
      subject: row.subject,
      roles,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    };
  }

  private positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer.`);
    return value;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('SQLite persistence is closed.');
  }
}

export function createSQLitePersistence(
  filenameOrOptions: string | SQLitePersistenceOptions,
): SQLitePersistence {
  return new SQLitePersistence(filenameOrOptions);
}

function assertHash(name: string, value: string): void {
  if (!SHA256_HEX.test(value)) throw new TypeError(`${name} must be a lowercase SHA-256 hex digest.`);
}
