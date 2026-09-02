import { hash } from '@node-rs/argon2';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_PATH,
  HARD_MAX_TEXT_LENGTH,
  type ContentSnapshot,
  type CopyPatchAuthAdapter,
  type CopyPatchRequestHandler,
  type CopyPatchPersistence,
  type EditorSnapshot,
  type PersistenceMutationResult,
  type PublishedSnapshotReader,
  type RateLimitDecision,
  type StoredSession,
} from '@copypatch/core';
import {
  createCopyPatchBackend,
  type CopyPatchBackend,
} from '../src/index.js';
import { verifyMutationReturningUndefined } from './fixtures/undefined-mutation-verifier.js';

type BackendUsesCorePorts = CopyPatchBackend extends CopyPatchRequestHandler & PublishedSnapshotReader
  ? true
  : false;

const backendUsesCorePorts: BackendUsesCorePorts = true;
const optionsContract = (
  options: Parameters<typeof createCopyPatchBackend>[0],
): Parameters<typeof createCopyPatchBackend>[0] => options;

function parseJsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function latestSession(persistence: MemoryPersistence): [string, StoredSession] {
  const entry = [...persistence.sessions.entries()].at(-1);
  if (!entry) throw new Error('Expected a persisted session.');
  return entry;
}

class MemoryPersistence implements CopyPatchPersistence {
  readonly sessions = new Map<string, StoredSession>();
  readonly rateLimits = new Map<string, { count: number; resetAt: number }>();
  readonly snapshots = new Map<string, EditorSnapshot>();
  failPublishedReads = false;
  sessionTokensSeen: string[] = [];

  async migrate(): Promise<void> {}
  async health() { return { ok: true as const }; }

  async readPublished(locale: string): Promise<ContentSnapshot> {
    if (this.failPublishedReads) throw new Error('storage unavailable');
    const snapshot = this.editor(locale);
    return { revision: snapshot.publishedRevision, content: { ...snapshot.published } };
  }

  async readEditor(locale: string): Promise<EditorSnapshot> {
    return structuredClone(this.editor(locale));
  }

  async saveDrafts(input: Parameters<CopyPatchPersistence['saveDrafts']>[0]): Promise<PersistenceMutationResult<{ publishedRevision: number; draftRevision: number }>> {
    const current = this.editor(input.locale);
    if (current.publishedRevision !== input.expectedPublishedRevision || current.draftRevision !== input.expectedDraftRevision) {
      return { status: 'conflict', latest: structuredClone(current) };
    }
    const next = structuredClone(current);
    for (const change of input.changes) next.drafts[change.key] = change.text;
    next.draftRevision++;
    this.snapshots.set(input.locale, next);
    return { status: 'ok', value: { publishedRevision: next.publishedRevision, draftRevision: next.draftRevision } };
  }

  async publishDrafts(input: Parameters<CopyPatchPersistence['publishDrafts']>[0]): Promise<PersistenceMutationResult<{ publishedRevision: number; draftRevision: number; promotedCount: number }>> {
    const current = this.editor(input.locale);
    if (current.publishedRevision !== input.expectedPublishedRevision || current.draftRevision !== input.expectedDraftRevision) {
      return { status: 'conflict', latest: structuredClone(current) };
    }
    const next = structuredClone(current);
    const promotedCount = Object.keys(next.drafts).length;
    Object.assign(next.published, next.drafts);
    next.drafts = {};
    next.publishedRevision++;
    next.draftRevision++;
    this.snapshots.set(input.locale, next);
    return { status: 'ok', value: { publishedRevision: next.publishedRevision, draftRevision: next.draftRevision, promotedCount } };
  }

  async discardDrafts(input: Parameters<CopyPatchPersistence['discardDrafts']>[0]): Promise<PersistenceMutationResult<{ publishedRevision: number; draftRevision: number; discardedCount: number }>> {
    const current = this.editor(input.locale);
    if (current.publishedRevision !== input.expectedPublishedRevision || current.draftRevision !== input.expectedDraftRevision) {
      return { status: 'conflict', latest: structuredClone(current) };
    }
    const next = structuredClone(current);
    const discardedCount = Object.keys(next.drafts).length;
    next.drafts = {};
    next.draftRevision++;
    this.snapshots.set(input.locale, next);
    return { status: 'ok', value: { publishedRevision: next.publishedRevision, draftRevision: next.draftRevision, discardedCount } };
  }

  async createSession(session: StoredSession): Promise<void> {
    this.sessionTokensSeen.push(session.tokenHash);
    this.sessions.set(session.tokenHash, structuredClone(session));
  }

  async readSession(tokenHash: string): Promise<StoredSession | null> {
    this.sessionTokensSeen.push(tokenHash);
    return structuredClone(this.sessions.get(tokenHash) ?? null);
  }

  async touchSession(tokenHash: string, update: Parameters<CopyPatchPersistence['touchSession']>[1]): Promise<StoredSession | null> {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    Object.assign(session, update);
    return structuredClone(session);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async consumeRateLimit(input: Parameters<CopyPatchPersistence['consumeRateLimit']>[0]): Promise<RateLimitDecision> {
    const current = this.rateLimits.get(input.keyHash);
    const entry = !current || current.resetAt <= input.now
      ? { count: 1, resetAt: input.now + input.windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    this.rateLimits.set(input.keyHash, entry);
    return { allowed: entry.count <= input.limit, remaining: Math.max(0, input.limit - entry.count), resetAt: entry.resetAt };
  }

  private editor(locale: string): EditorSnapshot {
    const existing = this.snapshots.get(locale);
    if (existing) return existing;
    const initial: EditorSnapshot = { locale, publishedRevision: 1, draftRevision: 1, publishingMode: 'draft', published: {}, drafts: {} };
    this.snapshots.set(locale, initial);
    return initial;
  }
}

const origin = 'https://example.test';
const UNSAFE_METHODS_FOR_TEST = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const endpoint = (path: string) => `${origin}${API_BASE_PATH}${path}`;
const request = (path: string, init?: RequestInit) => new Request(endpoint(path), init);

async function login(backend: ReturnType<typeof createCopyPatchBackend>, passphrase = 'correct horse battery staple') {
  const response = await backend.handle(request('/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ passphrase }),
  }), { clientAddress: '203.0.113.8' });
  const data = await response.json() as { csrfToken: string; requiresCsrf: boolean };
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { response, data, cookie: setCookie.split(';', 1)[0] ?? '' , setCookie };
}

describe('CopyPatch backend v2', () => {
  let persistence: MemoryPersistence;

  beforeEach(() => {
    persistence = new MemoryPersistence();
  });

  it('serves the v2 API with Web Request and Response and no CORS headers', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const response = await backend.handle(request('/content/en'));
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 1, content: {} });
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    const health = await backend.handle(new Request(`${origin}/healthz`));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const preflight = await backend.handle(request('/content/en', {
      method: 'OPTIONS',
      headers: { origin: 'https://other.test', 'access-control-request-method': 'GET' },
    }));
    expect(preflight.status).toBe(405);
    expect([...preflight.headers.keys()].some((name) => name.startsWith('access-control-'))).toBe(false);
  });

  it('requires exactly one authentication strategy', async () => {
    const adapter: CopyPatchAuthAdapter = { authenticate: async () => null, verifyMutation: async () => false };
    expect(() => createCopyPatchBackend({ persistence } as never)).toThrow(/exactly one/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash: 'hash', authAdapter: adapter } as never)).toThrow(/exactly one/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash: '$argon2i$not-id' })).toThrow(/Argon2id/);
  });

  it('extends the core request-handler and published-snapshot ports', () => {
    expect(backendUsesCorePorts).toBe(true);
    expect(typeof optionsContract).toBe('function');
  });

  it('exports only the documented backend runtime allowlist', async () => {
    const publicApi = await import('../src/index.js');
    const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

    expect(Object.keys(publicApi)).toEqual(['createCopyPatchBackend']);
    expect(indexSource).not.toContain('export *');
    expect(typeof createCopyPatchBackend).toBe('function');
  });

  it('aligns npm metadata with the core package pattern', async () => {
    const packageJson = parseJsonObject(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(packageJson.module).toBeUndefined();
    expect(packageJson.sideEffects).toBe(false);
    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        default: './dist/index.js',
      },
    });
    expect(packageJson.files).toEqual(['dist']);
    expect(packageJson.homepage).toBe('https://copypatch.vercel.app');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/Woffluon/CopyPatch.git',
      directory: 'packages/backend',
    });
    expect(packageJson.bugs).toEqual({ url: 'https://github.com/Woffluon/CopyPatch/issues' });
    expect(packageJson.keywords).toEqual(expect.arrayContaining(['copypatch', 'backend', 'typescript']));
  });

  it('creates a 256-bit session while persisting only its hash and emits a hardened host cookie', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const { response, data, cookie, setCookie } = await login(backend);
    expect(response.status).toBe(200);
    const rawToken = cookie.split('=')[1] ?? '';
    expect(data.requiresCsrf).toBe(true);
    expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
    expect(persistence.sessions.has(rawToken)).toBe(false);
    const [storedHash, storedSession] = latestSession(persistence);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession.tokenHash).toBe(storedHash);
    expect(setCookie).toMatch(/^__Host-copypatch-session=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=');
  });

  it('rejects unsafe requests without exact same-origin and rejects a missing or invalid CSRF token', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const missing = await backend.handle(request('/session', { method: 'POST', body: '{}' }));
    expect(missing.status).toBe(403);
    expect((await missing.json()).error.code).toBe('ORIGIN_REJECTED');

    const { cookie } = await login(backend);
    const hostile = await backend.handle(request('/editor/en/changes', {
      method: 'PUT', headers: { origin: 'https://evil.test', cookie, 'content-type': 'application/json' }, body: '{}',
    }));
    expect(hostile.status).toBe(403);
    const noCsrf = await backend.handle(request('/editor/en/changes', {
      method: 'PUT', headers: { origin, cookie, 'content-type': 'application/json' }, body: '{}',
    }));
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()).error.code).toBe('CSRF_FAILED');
  });

  it('validates complete change batches before persistence and returns the latest snapshot on CAS conflict', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const { cookie, data } = await login(backend);
    const headers = { origin, cookie, 'content-type': 'application/json', 'x-copypatch-csrf': data.csrfToken };
    const invalid = await backend.handle(request('/editor/en/changes', {
      method: 'PUT', headers, body: JSON.stringify({ expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: '../bad', text: 'x' }, { key: 'valid', text: 'y' }] }),
    }));
    expect(invalid.status).toBe(400);
    expect((await persistence.readEditor('en')).drafts).toEqual({});

    await persistence.saveDrafts({ locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'new' }] });
    const conflict = await backend.handle(request('/editor/en/changes', {
      method: 'PUT', headers, body: JSON.stringify({ expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'stale' }] }),
    }));
    expect(conflict.status).toBe(409);
    const conflictBody = await conflict.json();
    expect(conflictBody.error.code).toBe('REVISION_CONFLICT');
    expect(conflictBody.latest.draftRevision).toBe(2);
    expect(conflictBody.latest.drafts.title).toBe('new');
  });

  it('covers public routing edges for cache revalidation, unhealthy storage, invalid locales, and unsupported methods', async () => {
    persistence.snapshots.set('en', {
      locale: 'en',
      publishedRevision: 7,
      draftRevision: 7,
      publishingMode: 'draft',
      published: { title: 'Published' },
      drafts: {},
    });
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });

    const first = await backend.handle(request('/content/en'));
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBe('W/"rev-7"');
    const cached = await backend.handle(request('/content/en', { headers: { 'if-none-match': etag! } }));
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');

    vi.spyOn(persistence, 'health').mockResolvedValueOnce({ ok: false, message: 'storage down' });
    const unhealthy = await backend.handle(new Request(`${origin}${API_BASE_PATH}/health`));
    expect(unhealthy.status).toBe(503);
    expect(await unhealthy.json()).toEqual({ status: 'unavailable' });

    const malformedLocale = await backend.handle(request('/content/%E0%A4%A'));
    expect(malformedLocale.status).toBe(400);
    expect((await malformedLocale.json()).error.message).toBe('Invalid locale.');

    for (const [path, method] of [
      ['/session', 'PATCH'],
      ['/content/en', 'POST'],
      ['/editor/en/changes', 'POST'],
      ['/editor/en/publish', 'GET'],
      ['/editor/en/drafts', 'POST'],
      ['/editor/en', 'POST'],
    ] as const) {
      const response = await backend.handle(request(path, {
        method,
        headers: UNSAFE_METHODS_FOR_TEST.has(method) ? { origin } : undefined,
      }));
      expect(response.status).toBe(405);
    }

    const missing = await backend.handle(request('/missing'));
    expect(missing.status).toBe(404);
  });

  it('stops reading chunked JSON request bodies as soon as the byte limit is exceeded', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const chunk = new Uint8Array(64 * 1024);
    chunk.fill('{'.charCodeAt(0));
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls > 33) throw new Error('read past body byte limit');
        controller.enqueue(chunk);
      },
    });

    const response = await backend.handle(request('/session', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request body is too large.' },
    });
    expect(pulls).toBeLessThanOrEqual(34);
  });

  it('supports draft save, publish, and discard with editor and publisher roles', async () => {
    const adapter: CopyPatchAuthAdapter<object> = {
      authenticate: vi.fn(async (_request, context) => context.hostAuth === hostContext
        ? { subject: 'host-user', roles: ['editor', 'publisher'] as const }
        : null),
      verifyMutation: vi.fn(async () => true),
    };
    const hostContext = { secret: Symbol('opaque') };
    const backend = createCopyPatchBackend({ persistence, authAdapter: adapter });
    const headers = { origin, 'content-type': 'application/json' };
    const save = await backend.handle(request('/editor/en/changes', {
      method: 'PUT', headers, body: JSON.stringify({ expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'hero.title', text: 'Draft' }] }),
    }), { hostAuth: hostContext });
    expect(save.status).toBe(200);
    const publish = await backend.handle(request('/editor/en/publish', {
      method: 'POST', headers, body: JSON.stringify({ expectedPublishedRevision: 1, expectedDraftRevision: 2 }),
    }), { hostAuth: hostContext });
    expect(publish.status).toBe(200);
    expect(await backend.readPublished('en')).toEqual({ revision: 2, content: { 'hero.title': 'Draft' } });
    const discard = await backend.handle(request('/editor/en/drafts', {
      method: 'DELETE', headers, body: JSON.stringify({ expectedPublishedRevision: 2, expectedDraftRevision: 3 }),
    }), { hostAuth: hostContext });
    expect(discard.status).toBe(200);
  });

  it('fails closed for expired, invalid, or concurrently removed built-in sessions', async () => {
    let now = 1_000;
    const backend = createCopyPatchBackend({
      persistence,
      passphraseHash: await hash('correct horse battery staple'),
      now: () => now,
    });
    const { cookie } = await login(backend);
    const [tokenHash, stored] = latestSession(persistence);
    stored.idleExpiresAt = now;

    const expired = await backend.handle(request('/session', { headers: { cookie } }));
    expect(expired.status).toBe(200);
    expect(await expired.json()).toEqual({ authenticated: false, requiresCsrf: false });
    expect(persistence.sessions.has(tokenHash)).toBe(false);

    const relogin = await login(backend);
    const [reloginTokenHash, invalidPrincipal] = latestSession(persistence);
    invalidPrincipal.subject = '';
    const invalid = await backend.handle(request('/editor/en', { headers: { cookie: relogin.cookie } }));
    expect(invalid.status).toBe(401);
    expect(persistence.sessions.has(reloginTokenHash)).toBe(false);

    const fresh = await login(backend);
    vi.spyOn(persistence, 'touchSession').mockResolvedValueOnce(null);
    now += 1;
    const removed = await backend.handle(request('/session', { headers: { cookie: fresh.cookie } }));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ authenticated: false, requiresCsrf: false });
  });

  it('deletes built-in sessions only after cookie and CSRF authentication succeed', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const { cookie, data } = await login(backend);
    const [tokenHash] = latestSession(persistence);

    const deleted = await backend.handle(request('/session', {
      method: 'DELETE',
      headers: { origin, cookie, 'x-copypatch-csrf': data.csrfToken },
    }));

    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ success: true });
    expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(persistence.sessions.has(tokenHash)).toBe(false);
  });

  it('signals that host-authenticated sessions do not require backend CSRF tokens', async () => {
    const adapter: CopyPatchAuthAdapter<object> = {
      authenticate: vi.fn(async (_request, context) => context.hostAuth === hostContext
        ? { subject: 'host-user', roles: ['editor'] as const }
        : null),
      verifyMutation: vi.fn(async () => true),
    };
    const hostContext = { secret: Symbol('opaque') };
    const backend = createCopyPatchBackend({ persistence, authAdapter: adapter });

    const post = await backend.handle(request('/session', {
      method: 'POST',
      headers: { origin },
    }), { hostAuth: hostContext, clientAddress: '203.0.113.10' });
    const get = await backend.handle(request('/session'), { hostAuth: hostContext });

    await expect(post.json()).resolves.toMatchObject({
      authenticated: true,
      roles: ['editor'],
      publishingMode: 'draft',
      requiresCsrf: false,
    });
    const getBody = await get.json();
    expect(getBody).toMatchObject({
      authenticated: true,
      roles: ['editor'],
      publishingMode: 'draft',
      requiresCsrf: false,
    });
    expect(getBody).not.toHaveProperty('csrfToken');
  });

  it('passes opaque host auth only through handle context and never serializes it into headers', async () => {
    const hostContext: { bearer: string; self?: unknown } = { bearer: 'must-not-be-serialized' };
    hostContext.self = hostContext;
    const authenticate = vi.fn(async (incoming: Request, context: { hostAuth?: typeof hostContext }) => {
      expect(context.hostAuth).toBe(hostContext);
      expect([...incoming.headers.values()].join(' ')).not.toContain(hostContext.bearer);
      return { subject: 'host-user', roles: ['editor'] as const };
    });
    const adapter: CopyPatchAuthAdapter<typeof hostContext> = { authenticate, verifyMutation: async () => true };
    const backend = createCopyPatchBackend({ persistence, authAdapter: adapter });
    const response = await backend.handle(request('/editor/en'), { hostAuth: hostContext });
    expect(response.status).toBe(200);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain(hostContext.bearer);
  });

  it('does not fall back when the host adapter rejects or fails mutation verification', async () => {
    const rejectAdapter: CopyPatchAuthAdapter = {
      authenticate: async () => null,
      verifyMutation: async () => true,
    };
    const rejected = createCopyPatchBackend({ persistence, authAdapter: rejectAdapter });
    expect((await rejected.handle(request('/editor/en'))).status).toBe(401);

    const sentinel = 'must-not-leak';
    const failingAdapter: CopyPatchAuthAdapter<{ sentinel: string }> = {
      authenticate: async () => ({ subject: 'host', roles: ['editor'] }),
      verifyMutation: async (incoming, _principal, context) => {
        expect(context.hostAuth?.sentinel).toBe(sentinel);
        expect(await incoming.clone().text()).not.toContain(sentinel);
        throw new Error('host secret failure');
      },
    };
    const failing = createCopyPatchBackend({ persistence, authAdapter: failingAdapter });
    const response = await failing.handle(request('/editor/en/changes', {
      method: 'PUT',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'blocked' }] }),
    }), { hostAuth: { sentinel } });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('host secret failure');
    expect((await persistence.readEditor('en')).drafts).toEqual({});
  });

  it('accepts only literal true from host mutation verification', async () => {
    const verifiers = [
      { label: 'false', clientAddress: '203.0.113.20', verifyMutation: async () => false },
      { label: 'undefined', clientAddress: '203.0.113.21', verifyMutation: verifyMutationReturningUndefined },
      { label: 'throw', clientAddress: '203.0.113.22', verifyMutation: () => { throw new Error('sync verifier failure'); } },
      { label: 'rejection', clientAddress: '203.0.113.23', verifyMutation: () => Promise.reject(new Error('async verifier failure')) },
    ];

    for (const { label, clientAddress, verifyMutation } of verifiers) {
      const backend = createCopyPatchBackend({
        persistence,
        authAdapter: {
          authenticate: async () => ({ subject: 'host', roles: ['editor'] }),
          verifyMutation,
        },
      });
      const response = await backend.handle(request('/editor/en/changes', {
        method: 'PUT',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedPublishedRevision: 1,
          expectedDraftRevision: 1,
          changes: [{ key: `blocked.${label}`, text: 'must not persist' }],
        }),
      }), { clientAddress });

      expect(response.status, label).toBe(403);
      expect(await response.json(), label).toEqual({
        error: { code: 'CSRF_FAILED', message: 'Mutation verification failed.' },
      });
    }

    expect((await persistence.readEditor('en')).drafts).toEqual({});
  });

  it('allows a host mutation verifier to read the request body without consuming backend JSON parsing', async () => {
    let verifierBody = '';
    const adapter: CopyPatchAuthAdapter = {
      authenticate: async () => ({ subject: 'host', roles: ['editor'] }),
      verifyMutation: async (incoming) => {
        verifierBody = await incoming.text();
        return true;
      },
    };
    const backend = createCopyPatchBackend({ persistence, authAdapter: adapter });
    const body = JSON.stringify({
      expectedPublishedRevision: 1,
      expectedDraftRevision: 1,
      changes: [{ key: 'hero.title', text: 'Host verified' }],
    });

    const response = await backend.handle(request('/editor/en/changes', {
      method: 'PUT',
      headers: { origin, 'content-type': 'application/json' },
      body,
    }), { clientAddress: '203.0.113.9' });

    expect(response.status).toBe(200);
    expect(verifierBody).toBe(body);
    expect((await persistence.readEditor('en')).drafts).toEqual({ 'hero.title': 'Host verified' });
  });

  it('rejects malformed JSON, invalid revision payloads, and invalid draft batches before persistence writes', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple'), maxTextLength: 5 });
    const { cookie, data } = await login(backend);
    const headers = { origin, cookie, 'content-type': 'application/json', 'x-copypatch-csrf': data.csrfToken };

    const malformed = await backend.handle(request('/editor/en/changes', {
      method: 'PUT',
      headers,
      body: '{',
    }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.message).toBe('Invalid JSON request body.');

    for (const body of [
      null,
      { expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [] },
      { expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'abcdef' }] },
      { expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'ok' }, { key: 'title', text: 'dupe' }] },
      { expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'ok', extra: true }] },
    ]) {
      const response = await backend.handle(request('/editor/en/changes', {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
    }

    const invalidPublish = await backend.handle(request('/editor/en/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify({ expectedPublishedRevision: 0, expectedDraftRevision: 1 }),
    }));
    expect(invalidPublish.status).toBe(400);
    expect((await invalidPublish.json()).error.message).toBe('Both expected revisions must be positive safe integers.');
    expect((await persistence.readEditor('en')).drafts).toEqual({});
  });

  it('rejects invalid backend runtime limits during construction', async () => {
    const passphraseHash = await hash('correct horse battery staple');

    expect(() => createCopyPatchBackend({ persistence, passphraseHash, maxTextLength: 0 })).toThrow(/maxTextLength/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash, maxTextLength: HARD_MAX_TEXT_LENGTH + 1 })).toThrow(/maxTextLength/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash, session: { idleTimeoutMs: 20, absoluteTimeoutMs: 10 } })).toThrow(/idleTimeoutMs/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash, session: { idleTimeoutMs: 0 } })).toThrow(/idleTimeoutMs/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash, rateLimit: { limit: 0 } })).toThrow(/rateLimit/);
    expect(() => createCopyPatchBackend({ persistence, passphraseHash, rateLimit: { windowMs: Number.NaN } })).toThrow(/rateLimitWindowMs/);
  });

  it('uses persistent atomic rate limits', async () => {
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple'), rateLimit: { limit: 2, windowMs: 60_000 } });
    const first = await login(backend, 'wrong');
    const second = await login(backend, 'wrong');
    const third = await login(backend, 'wrong');
    expect(first.response.status).toBe(401);
    expect(second.response.status).toBe(401);
    expect(third.response.status).toBe(429);
    expect(persistence.rateLimits.size).toBeGreaterThan(0);
    expect([...persistence.rateLimits.keys()]).not.toContain('203.0.113.8');
    expect([...persistence.rateLimits.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not trust forwarding headers as client identity for rate limiting', async () => {
    const backend = createCopyPatchBackend({
      persistence,
      passphraseHash: await hash('correct horse battery staple'),
      rateLimit: { limit: 1, windowMs: 60_000 },
    });
    const first = await backend.handle(request('/session', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.10',
      },
      body: JSON.stringify({ passphrase: 'wrong' }),
    }));
    const second = await backend.handle(request('/session', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.11',
        forwarded: 'for=198.51.100.11',
      },
      body: JSON.stringify({ passphrase: 'wrong' }),
    }));

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect([...persistence.rateLimits.keys()]).toHaveLength(1);
    expect([...persistence.rateLimits.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('falls back to the last public snapshot when storage reads fail', async () => {
    persistence.snapshots.set('en', { locale: 'en', publishedRevision: 7, draftRevision: 9, publishingMode: 'draft', published: { title: 'cached' }, drafts: {} });
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    expect(await backend.readPublished('en')).toEqual({ revision: 7, content: { title: 'cached' } });
    persistence.failPublishedReads = true;
    expect(await backend.readPublished('en')).toEqual({ revision: 7, content: { title: 'cached' } });
    const response = await backend.handle(request('/content/en'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ revision: 7, content: { title: 'cached' } });
  });

  it('returns an empty no-store public snapshot when the first storage read fails', async () => {
    persistence.failPublishedReads = true;
    const backend = createCopyPatchBackend({ persistence, passphraseHash: await hash('correct horse battery staple') });
    const response = await backend.handle(request('/content/tr'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ revision: 1, content: {} });
  });

  it('returns typed latest snapshots for publish and discard conflicts', async () => {
    const backend = createCopyPatchBackend({
      persistence,
      authAdapter: { authenticate: async () => ({ subject: 'host', roles: ['editor', 'publisher'] }), verifyMutation: async () => true },
    });
    const headers = { origin, 'content-type': 'application/json' };
    await persistence.saveDrafts({ locale: 'en', expectedPublishedRevision: 1, expectedDraftRevision: 1, changes: [{ key: 'title', text: 'draft' }] });
    for (const [path, method] of [['/editor/en/publish', 'POST'], ['/editor/en/drafts', 'DELETE']] as const) {
      const response = await backend.handle(request(path, {
        method,
        headers,
        body: JSON.stringify({ expectedPublishedRevision: 1, expectedDraftRevision: 1 }),
      }));
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.latest).toMatchObject({ locale: 'en', publishedRevision: 1, draftRevision: 2, drafts: { title: 'draft' } });
    }
  });
});
