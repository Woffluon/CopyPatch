import {
  isValidContentKey,
  isValidLocale,
  normalizeText,
  type ContentSnapshot,
  type CopyPatchPersistence,
  type DiscardDraftsCommand,
  type DiscardDraftsResult,
  type EditorSnapshot,
  type PersistenceHealth,
  type PersistenceMutationResult,
  type PublishDraftsCommand,
  type PublishDraftsResult,
  type PublishingMode,
  type RateLimitDecision,
  type RateLimitInput,
  type SaveDraftsCommand,
  type SaveDraftsResult,
  type SessionTouch,
  type StoredSession,
} from '@copypatch/core';

export type { StoredSession } from '@copypatch/core';

export interface PgQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> {
  rows: TRow[];
  rowCount: number | null;
}

export interface PgQueryable {
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<PgQueryResult<TRow>>;
}

export interface PgClientLike extends PgQueryable {
  release(): void;
}

export interface PgPoolLike extends PgQueryable {
  connect(): Promise<PgClientLike>;
  end?(): Promise<void>;
}

export interface PostgresPersistenceOptions {
  pool?: PgPoolLike;
  connectionString?: string;
  schema?: string;
  publishingMode?: PublishingMode;
  maxTextLength?: number;
}

interface StateRow extends Record<string, unknown> {
  published_revision: number | string;
  draft_revision: number | string;
}

interface ContentRow extends Record<string, unknown> {
  content_key: string;
  published_text: string | null;
  draft_text: string | null;
}

interface SessionRow extends Record<string, unknown> {
  token_hash: string;
  csrf_token_hash: string;
  subject: string;
  roles: string[];
  created_at: number | string;
  last_seen_at: number | string;
  idle_expires_at: number | string;
  absolute_expires_at: number | string;
}

interface RateLimitRow extends Record<string, unknown> {
  attempts: number | string;
  reset_at: number | string;
}

const DEFAULT_SCHEMA = 'copypatch';
const DEFAULT_MAX_TEXT_LENGTH = 10_000;
const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const REQUIRED_TABLES = ['content_entries', 'content_state', 'rate_limits', 'sessions'] as const;

type PoolFactory = () => Promise<PgPoolLike>;

export class PostgresPersistence implements CopyPatchPersistence {
  readonly schema: string;
  readonly publishingMode: PublishingMode;

  private readonly schemaSql: string;
  private readonly maxTextLength: number;
  private readonly poolSource: PgPoolLike | PoolFactory;
  private readonly ownsPool: boolean;
  private poolPromise: Promise<PgPoolLike> | undefined;

  constructor(
    pool: PgPoolLike | PoolFactory,
    options: Omit<PostgresPersistenceOptions, 'pool' | 'connectionString'> = {},
    ownsPool = false,
  ) {
    this.schema = validateSchemaName(options.schema ?? DEFAULT_SCHEMA);
    this.schemaSql = quoteIdentifier(this.schema);
    this.publishingMode = options.publishingMode ?? 'draft';
    this.maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
    if (!Number.isSafeInteger(this.maxTextLength) || this.maxTextLength < 1) {
      throw new TypeError('maxTextLength must be a positive safe integer');
    }
    this.poolSource = pool;
    this.ownsPool = ownsPool;
  }

  async migrate(): Promise<void> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `copypatch:migrate:${this.schema}`,
      ]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaSql}`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.table('content_state')} (
          locale varchar(35) PRIMARY KEY,
          published_revision integer NOT NULL DEFAULT 1 CHECK (published_revision >= 1),
          draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision >= 1),
          updated_at bigint NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.table('content_entries')} (
          locale varchar(35) NOT NULL REFERENCES ${this.table('content_state')}(locale) ON DELETE CASCADE,
          content_key varchar(160) NOT NULL,
          published_text text,
          draft_text text,
          created_at bigint NOT NULL,
          updated_at bigint NOT NULL,
          PRIMARY KEY (locale, content_key)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.table('sessions')} (
          token_hash text PRIMARY KEY,
          csrf_token_hash text NOT NULL,
          subject text NOT NULL,
          roles text[] NOT NULL,
          created_at bigint NOT NULL,
          last_seen_at bigint NOT NULL,
          idle_expires_at bigint NOT NULL,
          absolute_expires_at bigint NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.table('rate_limits')} (
          key_hash text PRIMARY KEY,
          attempts integer NOT NULL CHECK (attempts >= 1),
          reset_at bigint NOT NULL
        )
      `);
      await client.query('COMMIT');
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<PersistenceHealth> {
    try {
      const pool = await this.getPool();
      const result = await pool.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
        [this.schema, [...REQUIRED_TABLES]],
      );
      const found = new Set(result.rows.map((row) => row.table_name));
      const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
      if (missing.length > 0) {
        return {
          ok: false,
          message: `PostgreSQL schema "${this.schema}" is not migrated; missing tables: ${missing.join(', ')}.`,
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  async readPublished(locale: string): Promise<ContentSnapshot> {
    assertLocale(locale);
    return this.readSnapshot(async (client) => {
      const stateResult = await client.query<StateRow>(
        `SELECT published_revision, draft_revision FROM ${this.table('content_state')} WHERE locale = $1`,
        [locale],
      );
      const entriesResult = await client.query<ContentRow>(
        `SELECT content_key, published_text, draft_text
         FROM ${this.table('content_entries')}
         WHERE locale = $1 AND published_text IS NOT NULL
         ORDER BY content_key`,
        [locale],
      );
      const content: Record<string, string> = {};
      for (const row of entriesResult.rows) {
        if (row.published_text !== null) content[row.content_key] = row.published_text;
      }
      return {
        revision: toNumber(stateResult.rows[0]?.published_revision ?? 1),
        content,
      };
    });
  }

  async readEditor(locale: string): Promise<EditorSnapshot> {
    assertLocale(locale);
    return this.readSnapshot(async (client) => {
      const stateResult = await client.query<StateRow>(
        `SELECT published_revision, draft_revision FROM ${this.table('content_state')} WHERE locale = $1`,
        [locale],
      );
      const entriesResult = await client.query<ContentRow>(
        `SELECT content_key, published_text, draft_text
         FROM ${this.table('content_entries')}
         WHERE locale = $1
         ORDER BY content_key`,
        [locale],
      );
      const state = stateResult.rows[0];
      const published: Record<string, string> = {};
      const drafts: Record<string, string> = {};
      for (const row of entriesResult.rows) {
        if (row.published_text !== null) published[row.content_key] = row.published_text;
        if (row.draft_text !== null) drafts[row.content_key] = row.draft_text;
      }
      return {
        locale,
        publishedRevision: toNumber(state?.published_revision ?? 1),
        draftRevision: toNumber(state?.draft_revision ?? 1),
        publishingMode: this.publishingMode,
        published,
        drafts,
      };
    });
  }

  async saveDrafts(
    command: SaveDraftsCommand,
  ): Promise<PersistenceMutationResult<SaveDraftsResult>> {
    assertCommandRevisions(command);
    validateChanges(command, this.maxTextLength);
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const state = await this.lockState(client, command.locale);
      if (!revisionsMatch(state, command)) {
        await client.query('ROLLBACK');
        return { status: 'conflict', latest: await this.readEditor(command.locale) };
      }
      const now = Date.now();
      await this.ensureState(client, command.locale, state, now);
      for (const change of command.changes) {
        await client.query(
          `INSERT INTO ${this.table('content_entries')}
             (locale, content_key, published_text, draft_text, created_at, updated_at)
           VALUES ($1, $2, NULL, $3, $4, $4)
           ON CONFLICT (locale, content_key) DO UPDATE
           SET draft_text = EXCLUDED.draft_text, updated_at = EXCLUDED.updated_at`,
          [command.locale, change.key, normalizeText(change.text, true), now],
        );
      }
      const nextDraftRevision = state.draftRevision + 1;
      await client.query(
        `UPDATE ${this.table('content_state')}
         SET draft_revision = $2, updated_at = $3
         WHERE locale = $1`,
        [command.locale, nextDraftRevision, now],
      );
      await client.query('COMMIT');
      return {
        status: 'ok',
        value: {
          publishedRevision: state.publishedRevision,
          draftRevision: nextDraftRevision,
        },
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async publishDrafts(
    command: PublishDraftsCommand,
  ): Promise<PersistenceMutationResult<PublishDraftsResult>> {
    assertCommandRevisions(command);
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const state = await this.lockState(client, command.locale);
      if (!revisionsMatch(state, command)) {
        await client.query('ROLLBACK');
        return { status: 'conflict', latest: await this.readEditor(command.locale) };
      }
      const now = Date.now();
      await this.ensureState(client, command.locale, state, now);
      const promoted = await client.query(
        `UPDATE ${this.table('content_entries')}
         SET published_text = draft_text, draft_text = NULL, updated_at = $2
         WHERE locale = $1 AND draft_text IS NOT NULL`,
        [command.locale, now],
      );
      const nextPublishedRevision = state.publishedRevision + 1;
      const nextDraftRevision = state.draftRevision + 1;
      await client.query(
        `UPDATE ${this.table('content_state')}
         SET published_revision = $2, draft_revision = $3, updated_at = $4
         WHERE locale = $1`,
        [command.locale, nextPublishedRevision, nextDraftRevision, now],
      );
      await client.query('COMMIT');
      return {
        status: 'ok',
        value: {
          publishedRevision: nextPublishedRevision,
          draftRevision: nextDraftRevision,
          promotedCount: promoted.rowCount ?? 0,
        },
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async discardDrafts(
    command: DiscardDraftsCommand,
  ): Promise<PersistenceMutationResult<DiscardDraftsResult>> {
    assertCommandRevisions(command);
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const state = await this.lockState(client, command.locale);
      if (!revisionsMatch(state, command)) {
        await client.query('ROLLBACK');
        return { status: 'conflict', latest: await this.readEditor(command.locale) };
      }
      const now = Date.now();
      await this.ensureState(client, command.locale, state, now);
      const discarded = await client.query(
        `UPDATE ${this.table('content_entries')}
         SET draft_text = NULL, updated_at = $2
         WHERE locale = $1 AND draft_text IS NOT NULL`,
        [command.locale, now],
      );
      const nextDraftRevision = state.draftRevision + 1;
      await client.query(
        `UPDATE ${this.table('content_state')}
         SET draft_revision = $2, updated_at = $3
         WHERE locale = $1`,
        [command.locale, nextDraftRevision, now],
      );
      await client.query('COMMIT');
      return {
        status: 'ok',
        value: {
          publishedRevision: state.publishedRevision,
          draftRevision: nextDraftRevision,
          discardedCount: discarded.rowCount ?? 0,
        },
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(session: StoredSession): Promise<void> {
    validateSession(session);
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO ${this.table('sessions')}
         (token_hash, csrf_token_hash, subject, roles, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        session.tokenHash,
        session.csrfTokenHash,
        session.subject,
        [...session.roles],
        session.createdAt,
        session.lastSeenAt,
        session.idleExpiresAt,
        session.absoluteExpiresAt,
      ],
    );
  }

  async readSession(tokenHash: string): Promise<StoredSession | null> {
    assertHash('tokenHash', tokenHash);
    const pool = await this.getPool();
    const queryResult = await pool.query<SessionRow>(
      `SELECT token_hash, csrf_token_hash, subject, roles,
              created_at, last_seen_at, idle_expires_at, absolute_expires_at
       FROM ${this.table('sessions')}
       WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = queryResult.rows[0];
    return row ? mapSession(row) : null;
  }

  async touchSession(tokenHash: string, update: SessionTouch): Promise<StoredSession | null> {
    assertHash('tokenHash', tokenHash);
    assertTimestamp('lastSeenAt', update.lastSeenAt);
    assertTimestamp('idleExpiresAt', update.idleExpiresAt);
    if (update.csrfTokenHash !== undefined) assertHash('csrfTokenHash', update.csrfTokenHash);
    const pool = await this.getPool();
    const values: unknown[] = [tokenHash, update.lastSeenAt, update.idleExpiresAt];
    const csrfAssignment = update.csrfTokenHash === undefined ? '' : ', csrf_token_hash = $4';
    if (update.csrfTokenHash !== undefined) values.push(update.csrfTokenHash);
    const queryResult = await pool.query<SessionRow>(
      `UPDATE ${this.table('sessions')}
       SET last_seen_at = $2, idle_expires_at = $3${csrfAssignment}
       WHERE token_hash = $1
       RETURNING token_hash, csrf_token_hash, subject, roles,
                 created_at, last_seen_at, idle_expires_at, absolute_expires_at`,
      values,
    );
    const row = queryResult.rows[0];
    return row ? mapSession(row) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    assertHash('tokenHash', tokenHash);
    const pool = await this.getPool();
    await pool.query(`DELETE FROM ${this.table('sessions')} WHERE token_hash = $1`, [tokenHash]);
  }

  async consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
    validateRateLimit(input);
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resetAt = input.now + input.windowMs;
      const queryResult = await client.query<RateLimitRow>(
        `INSERT INTO ${this.table('rate_limits')} AS current_limit (key_hash, attempts, reset_at)
         VALUES ($1, 1, $2)
         ON CONFLICT (key_hash) DO UPDATE
         SET attempts = CASE
               WHEN current_limit.reset_at <= $3 THEN 1
               ELSE current_limit.attempts + 1
             END,
             reset_at = CASE
               WHEN current_limit.reset_at <= $3 THEN $2
               ELSE current_limit.reset_at
             END
         RETURNING attempts, reset_at`,
        [input.keyHash, resetAt, input.now],
      );
      const row = queryResult.rows[0];
      if (!row) throw new Error('PostgreSQL rate-limit upsert returned no row');
      await client.query('COMMIT');
      const attempts = toNumber(row.attempts);
      return {
        allowed: attempts <= input.limit,
        remaining: Math.max(0, input.limit - attempts),
        resetAt: toNumber(row.reset_at),
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (!this.ownsPool || !this.poolPromise) return;
    const pool = await this.poolPromise;
    await pool.end?.();
  }

  private async getPool(): Promise<PgPoolLike> {
    if (!this.poolPromise) {
      this.poolPromise =
        typeof this.poolSource === 'function' ? this.poolSource() : Promise.resolve(this.poolSource);
    }
    return this.poolPromise;
  }

  private table(name: string): string {
    return `${this.schemaSql}.${quoteIdentifier(name)}`;
  }

  private async readSnapshot<T>(read: (client: PgClientLike) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const snapshot = await read(client);
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockState(
    client: PgClientLike,
    locale: string,
  ): Promise<{ publishedRevision: number; draftRevision: number; exists: boolean }> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `copypatch:content:${this.schema}:${locale}`,
    ]);
    const queryResult = await client.query<StateRow>(
      `SELECT published_revision, draft_revision
       FROM ${this.table('content_state')}
       WHERE locale = $1
       FOR UPDATE`,
      [locale],
    );
    const row = queryResult.rows[0];
    return {
      publishedRevision: toNumber(row?.published_revision ?? 1),
      draftRevision: toNumber(row?.draft_revision ?? 1),
      exists: row !== undefined,
    };
  }

  private async ensureState(
    client: PgClientLike,
    locale: string,
    state: { exists: boolean },
    now: number,
  ): Promise<void> {
    if (state.exists) return;
    await client.query(
      `INSERT INTO ${this.table('content_state')}
         (locale, published_revision, draft_revision, updated_at)
       VALUES ($1, 1, 1, $2)`,
      [locale, now],
    );
  }
}

export function createPostgresPersistence(
  input: string | PgPoolLike | PostgresPersistenceOptions,
): PostgresPersistence {
  if (typeof input === 'string') {
    return fromConnectionString(input, {});
  }
  if (isPool(input)) {
    return new PostgresPersistence(input);
  }
  const { pool, connectionString, ...options } = input;
  if ((pool === undefined) === (connectionString === undefined)) {
    throw new TypeError('Provide exactly one of pool or connectionString');
  }
  return pool ? new PostgresPersistence(pool, options) : fromConnectionString(connectionString!, options);
}

function fromConnectionString(
  connectionString: string,
  options: Omit<PostgresPersistenceOptions, 'pool' | 'connectionString'>,
): PostgresPersistence {
  if (connectionString.trim() === '') throw new TypeError('connectionString must not be empty');
  const factory: PoolFactory = async () => {
    const moduleName = 'pg';
    const pgModule = (await import(moduleName)) as {
      Pool: new (options: { connectionString: string }) => PgPoolLike;
    };
    return new pgModule.Pool({ connectionString });
  };
  return new PostgresPersistence(factory, options, true);
}

function isPool(value: PgPoolLike | PostgresPersistenceOptions): value is PgPoolLike {
  return typeof (value as Partial<PgPoolLike>).query === 'function';
}

function validateSchemaName(schema: string): string {
  if (!SCHEMA_NAME.test(schema)) throw new TypeError(`Invalid PostgreSQL schema name: ${schema}`);
  return schema;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertLocale(locale: string): void {
  if (!isValidLocale(locale)) throw new TypeError(`Invalid locale: ${locale}`);
}

function assertCommandRevisions(command: {
  locale: string;
  expectedPublishedRevision: number;
  expectedDraftRevision: number;
}): void {
  assertLocale(command.locale);
  assertRevision('expectedPublishedRevision', command.expectedPublishedRevision);
  assertRevision('expectedDraftRevision', command.expectedDraftRevision);
}

function assertRevision(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function validateChanges(command: SaveDraftsCommand, maxTextLength: number): void {
  for (const change of command.changes) {
    if (!isValidContentKey(change.key)) throw new TypeError(`Invalid content key: ${change.key}`);
    if (typeof change.text !== 'string' || change.text.length > maxTextLength) {
      throw new TypeError(`Text exceeds maximum allowed length of ${maxTextLength}`);
    }
  }
}

function revisionsMatch(
  state: { publishedRevision: number; draftRevision: number },
  command: { expectedPublishedRevision: number; expectedDraftRevision: number },
): boolean {
  return (
    state.publishedRevision === command.expectedPublishedRevision &&
    state.draftRevision === command.expectedDraftRevision
  );
}

function validateSession(session: StoredSession): void {
  assertHash('tokenHash', session.tokenHash);
  assertHash('csrfTokenHash', session.csrfTokenHash);
  if (session.subject.length === 0) throw new TypeError('subject must not be empty');
  if (session.roles.length === 0) throw new TypeError('roles must not be empty');
  assertTimestamp('createdAt', session.createdAt);
  assertTimestamp('lastSeenAt', session.lastSeenAt);
  assertTimestamp('idleExpiresAt', session.idleExpiresAt);
  assertTimestamp('absoluteExpiresAt', session.absoluteExpiresAt);
}

function assertHash(name: string, value: string): void {
  if (!SHA256_HEX.test(value)) throw new TypeError(`${name} must be a lowercase SHA-256 hex digest.`);
}

function assertTimestamp(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function validateRateLimit(input: RateLimitInput): void {
  assertHash('keyHash', input.keyHash);
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
    throw new TypeError('limit must be a positive safe integer');
  }
  if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1) {
    throw new TypeError('windowMs must be a positive safe integer');
  }
  assertTimestamp('now', input.now);
  if (!Number.isSafeInteger(input.now + input.windowMs)) {
    throw new TypeError('rate-limit resetAt exceeds the safe integer range');
  }
}

function mapSession(row: SessionRow): StoredSession {
  return {
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    subject: row.subject,
    roles: row.roles as StoredSession['roles'],
    createdAt: toNumber(row.created_at),
    lastSeenAt: toNumber(row.last_seen_at),
    idleExpiresAt: toNumber(row.idle_expires_at),
    absoluteExpiresAt: toNumber(row.absolute_expires_at),
  };
}

function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`PostgreSQL returned an unsafe integer: ${value}`);
  return parsed;
}

async function rollback(client: PgClientLike): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the operation error; PostgreSQL will discard the broken connection if needed.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
