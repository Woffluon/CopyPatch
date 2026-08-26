import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresPersistence,
  type PgPoolLike,
  type PostgresPersistence,
  type StoredSession,
} from '../src/index.js';

const connectionString = process.env.COPYPATCH_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const schema = `copypatch_test_${randomBytes(8).toString('hex')}`;

describePostgres('PostgreSQL persistence contract (COPYPATCH_TEST_POSTGRES_URL)', () => {
  let persistence: PostgresPersistence;
  let pool: PgPoolLike;

  beforeAll(async () => {
    const moduleName = 'pg';
    const { Pool } = (await import(moduleName)) as {
      Pool: new (options: { connectionString: string }) => PgPoolLike;
    };
    pool = new Pool({ connectionString: connectionString! });
    persistence = createPostgresPersistence({ pool, schema });
    await Promise.all([persistence.migrate(), persistence.migrate(), persistence.migrate()]);
  });

  afterAll(async () => {
    if (!persistence) return;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end?.();
  });

  it('migrates concurrently and reports health', async () => {
    await expect(persistence.health()).resolves.toEqual({ ok: true });
  });

  it('reports an unmigrated schema as unhealthy', async () => {
    const unmigratedSchema = `${schema}_unmigrated`;
    const unmigrated = createPostgresPersistence({ pool, schema: unmigratedSchema });
    await expect(unmigrated.health()).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/schema.*not migrated|missing/i),
    });
    await pool.query(`DROP SCHEMA IF EXISTS "${unmigratedSchema}" CASCADE`);
  });

  it('isolates locales and starts with empty revision-one snapshots without public writes', async () => {
    await expect(persistence.readPublished('en')).resolves.toEqual({ revision: 1, content: {} });
    await expect(persistence.readEditor('tr')).resolves.toMatchObject({
      locale: 'tr',
      publishedRevision: 1,
      draftRevision: 1,
      published: {},
      drafts: {},
    });
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM "${schema}"."content_state"`,
    );
    expect(Number(count.rows[0]?.count)).toBe(0);
  });

  it('saves, publishes, and discards drafts with isolated revisions', async () => {
    await expect(
      persistence.saveDrafts({
        locale: 'en',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 1,
        changes: [{ key: 'hero.title', text: 'Hello\r\nworld' }],
      }),
    ).resolves.toEqual({ status: 'ok', value: { publishedRevision: 1, draftRevision: 2 } });
    await expect(persistence.readPublished('en')).resolves.toEqual({ revision: 1, content: {} });
    await expect(persistence.readEditor('tr')).resolves.toMatchObject({ drafts: {} });

    await expect(
      persistence.publishDrafts({
        locale: 'en',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 2,
      }),
    ).resolves.toEqual({
      status: 'ok',
      value: { publishedRevision: 2, draftRevision: 3, promotedCount: 1 },
    });
    await expect(persistence.readPublished('en')).resolves.toEqual({
      revision: 2,
      content: { 'hero.title': 'Hello\nworld' },
    });

    await persistence.saveDrafts({
      locale: 'en',
      expectedPublishedRevision: 2,
      expectedDraftRevision: 3,
      changes: [{ key: 'hero.title', text: 'Discard me' }],
    });
    await expect(
      persistence.discardDrafts({
        locale: 'en',
        expectedPublishedRevision: 2,
        expectedDraftRevision: 4,
      }),
    ).resolves.toEqual({
      status: 'ok',
      value: { publishedRevision: 2, draftRevision: 5, discardedCount: 1 },
    });
  });

  it('allows exactly one winner in a concurrent CAS race and makes no partial loser writes', async () => {
    const initial = await persistence.readEditor('de');
    const command = {
      locale: 'de',
      expectedPublishedRevision: initial.publishedRevision,
      expectedDraftRevision: initial.draftRevision,
    };
    const [first, second] = await Promise.all([
      persistence.saveDrafts({ ...command, changes: [{ key: 'race.a', text: 'A' }] }),
      persistence.saveDrafts({ ...command, changes: [{ key: 'race.b', text: 'B' }] }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['conflict', 'ok']);
    const latest = await persistence.readEditor('de');
    expect(Object.keys(latest.drafts)).toHaveLength(1);
    expect(latest.draftRevision).toBe(2);
  });

  it('checks both revisions and returns a latest conflict snapshot', async () => {
    const latest = await persistence.readEditor('en');
    const conflict = await persistence.saveDrafts({
      locale: 'en',
      expectedPublishedRevision: latest.publishedRevision - 1,
      expectedDraftRevision: latest.draftRevision,
      changes: [{ key: 'must.not.write', text: 'No' }],
    });
    expect(conflict).toEqual({ status: 'conflict', latest });
    expect((await persistence.readEditor('en')).drafts).not.toHaveProperty('must.not.write');
  });

  it('persists across a new pool', async () => {
    const restarted = createPostgresPersistence({ connectionString: connectionString!, schema });
    await expect(restarted.readPublished('en')).resolves.toMatchObject({
      content: { 'hero.title': 'Hello\nworld' },
    });
    await restarted.close();
  });

  it('stores session hashes and expiry fields, then touches and deletes them', async () => {
    const session: StoredSession = {
      tokenHash: 'a'.repeat(64),
      csrfTokenHash: 'b'.repeat(64),
      subject: 'editor-1',
      roles: ['editor', 'publisher'],
      createdAt: 100,
      lastSeenAt: 110,
      idleExpiresAt: 200,
      absoluteExpiresAt: 300,
    };
    await persistence.createSession(session);
    await expect(persistence.readSession(session.tokenHash)).resolves.toEqual(session);
    await expect(
      persistence.touchSession(session.tokenHash, {
        lastSeenAt: 150,
        idleExpiresAt: 250,
        csrfTokenHash: 'c'.repeat(64),
      }),
    ).resolves.toMatchObject({ lastSeenAt: 150, idleExpiresAt: 250, csrfTokenHash: 'c'.repeat(64) });
    await persistence.deleteSession(session.tokenHash);
    await expect(persistence.readSession(session.tokenHash)).resolves.toBeNull();
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sessions'`,
      [schema],
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining(['token', 'csrf_token']),
    );
  });

  it('preserves a CSRF hash when touching a session without a rotation and treats unknown sessions as absent', async () => {
    const session: StoredSession = {
      tokenHash: 'e'.repeat(64),
      csrfTokenHash: 'f'.repeat(64),
      subject: 'editor-2',
      roles: ['editor'],
      createdAt: 1_000,
      lastSeenAt: 1_100,
      idleExpiresAt: 1_200,
      absoluteExpiresAt: 1_300,
    };
    await persistence.createSession(session);

    await expect(
      persistence.touchSession(session.tokenHash, {
        lastSeenAt: 1_150,
        idleExpiresAt: 1_250,
      }),
    ).resolves.toEqual({ ...session, lastSeenAt: 1_150, idleExpiresAt: 1_250 });
    await expect(persistence.touchSession('0'.repeat(64), {
      lastSeenAt: 1_150,
      idleExpiresAt: 1_250,
    })).resolves.toBeNull();
    await persistence.deleteSession(session.tokenHash);
  });

  it('materializes revision state for no-op save, publish, and discard operations without content entries', async () => {
    await expect(
      persistence.saveDrafts({
        locale: 'it',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 1,
        changes: [],
      }),
    ).resolves.toEqual({ status: 'ok', value: { publishedRevision: 1, draftRevision: 2 } });
    await expect(
      persistence.publishDrafts({
        locale: 'it',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 2,
      }),
    ).resolves.toEqual({
      status: 'ok',
      value: { publishedRevision: 2, draftRevision: 3, promotedCount: 0 },
    });
    await expect(
      persistence.discardDrafts({
        locale: 'it',
        expectedPublishedRevision: 2,
        expectedDraftRevision: 3,
      }),
    ).resolves.toEqual({
      status: 'ok',
      value: { publishedRevision: 2, draftRevision: 4, discardedCount: 0 },
    });
    await expect(persistence.readEditor('it')).resolves.toMatchObject({
      publishedRevision: 2,
      draftRevision: 4,
      published: {},
      drafts: {},
    });
    const entries = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM "${schema}"."content_entries" WHERE locale = $1`,
      ['it'],
    );
    expect(Number(entries.rows[0]?.count)).toBe(0);
  });

  it('atomically consumes one persistent rate limit across instances', async () => {
    const other = createPostgresPersistence({ connectionString: connectionString!, schema });
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? persistence : other).consumeRateLimit({
          keyHash: 'd'.repeat(64),
          limit: 7,
          windowMs: 1_000,
          now: 10_000,
        }),
      ),
    );
    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(7);
    expect(attempts.at(-1)?.resetAt).toBe(11_000);
    await expect(
      other.consumeRateLimit({ keyHash: 'd'.repeat(64), limit: 7, windowMs: 1_000, now: 11_000 }),
    ).resolves.toEqual({ allowed: true, remaining: 6, resetAt: 12_000 });
    await other.close();
  });

  it('rolls back when PostgreSQL injects an error during a multi-change save', async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION "${schema}"."fail_content_write"()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NEW.content_key = 'rollback.fail' THEN
          RAISE EXCEPTION 'injected content failure';
        END IF;
        RETURN NEW;
      END
      $fn$;
      CREATE TRIGGER "fail_content_write"
      BEFORE INSERT OR UPDATE ON "${schema}"."content_entries"
      FOR EACH ROW EXECUTE FUNCTION "${schema}"."fail_content_write"()
    `);
    const before = await persistence.readEditor('fr');
    await expect(
      persistence.saveDrafts({
        locale: 'fr',
        expectedPublishedRevision: 1,
        expectedDraftRevision: 1,
        changes: [
          { key: 'rollback.ok', text: 'must roll back' },
          { key: 'rollback.fail', text: 'boom' },
        ],
      }),
    ).rejects.toThrow('injected content failure');
    await expect(persistence.readEditor('fr')).resolves.toEqual(before);
    await pool.query(
      `DROP TRIGGER "fail_content_write" ON "${schema}"."content_entries";
       DROP FUNCTION "${schema}"."fail_content_write"()`,
    );
  });
});
