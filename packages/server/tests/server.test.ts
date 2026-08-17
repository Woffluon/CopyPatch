import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { hashPassword, verifyPassword } from '../src/auth/crypto.js';
import { SessionManager } from '../src/auth/session.js';
import { ContentService, RevisionConflictError } from '../src/services/content-service.js';
import { SnapshotCache } from '../src/services/snapshot-cache.js';
import { createCopyPatchServer } from '../src/server.js';
import { CSRF_HEADER_NAME } from '@copypatch/core';

const TEST_DB = path.join(process.cwd(), 'test-copypatch.sqlite');

describe('Server & Persistence Layer', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
  });

  it('correctly hashes and verifies passwords using Argon2id', async () => {
    const password = 'my-ultra-secure-passphrase-2026';
    const hash = await hashPassword(password);
    expect(hash).toContain('$argon2id$');

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrong = await verifyPassword('wrong-password', hash);
    expect(isWrong).toBe(false);
  });

  it('manages sessions and validates CSRF securely', async () => {
    const conn = initDatabase(TEST_DB);
    const sessionManager = new SessionManager(conn.db);

    const { sessionToken, csrfToken } = await sessionManager.createSession();
    expect(sessionToken).toBeDefined();
    expect(csrfToken).toBeDefined();

    // Validate session
    const validation = await sessionManager.validateSession(sessionToken);
    expect(validation.valid).toBe(true);

    // Validate CSRF
    const csrfOk = await sessionManager.validateCsrf(sessionToken, csrfToken);
    expect(csrfOk).toBe(true);

    const csrfBad = await sessionManager.validateCsrf(sessionToken, 'invalid-csrf');
    expect(csrfBad).toBe(false);

    // Destroy session
    await sessionManager.destroySession(sessionToken);
    const postDestroy = await sessionManager.validateSession(sessionToken);
    expect(postDestroy.valid).toBe(false);

    conn.sqlite.close();
  });

  it('manages content persistence, revisions and transactions with locale isolation in direct mode', () => {
    const conn = initDatabase(TEST_DB);
    const cache = new SnapshotCache();
    const service = new ContentService(conn.db, cache, 'direct');

    // Initial snapshot should be empty
    const enSnap = service.getPublishedSnapshot('en');
    expect(enSnap.revision).toBe(1);
    expect(enSnap.content).toEqual({});

    // Save changes for English
    const res1 = service.saveChanges('en', 1, 1, [
      { key: 'home.hero.title', text: 'Hello World' },
      { key: 'home.hero.subtitle', text: 'Sub text' }
    ]);
    expect(res1.publishedRevision).toBe(2);

    // Snapshot reflects saved content
    const enSnap2 = service.rebuildSnapshot('en');
    expect(enSnap2.revision).toBe(2);
    expect(enSnap2.content['home.hero.title']).toBe('Hello World');

    // Turkish locale remains completely isolated
    const trSnap = service.getPublishedSnapshot('tr');
    expect(trSnap.revision).toBe(1);
    expect(trSnap.content).toEqual({});

    // Optimistic concurrency conflict detection
    expect(() => {
      service.saveChanges('en', 1, 1, [
        { key: 'home.hero.title', text: 'Stale update' }
      ]);
    }).toThrow(RevisionConflictError);

    conn.sqlite.close();
  });

  it('manages draft publishing mode properly', () => {
    const conn = initDatabase(TEST_DB);
    const cache = new SnapshotCache();
    const service = new ContentService(conn.db, cache, 'draft');

    // 1. Save draft
    const saveRes = service.saveChanges('en', 1, 1, [
      { key: 'cta.label', text: 'Draft Label' }
    ]);
    expect(saveRes.draftRevision).toBe(2);
    expect(saveRes.publishedRevision).toBe(1);

    // Public snapshot must not leak draft
    const pubSnap = service.rebuildSnapshot('en');
    expect(pubSnap.content['cta.label']).toBeUndefined();

    // Editor snapshot contains draft
    const editorSnap = service.getEditorSnapshot('en');
    expect(editorSnap.drafts['cta.label']).toBe('Draft Label');

    // 2. Publish draft
    const pubRes = service.publishDrafts('en', 2);
    expect(pubRes.promotedCount).toBe(1);
    expect(pubRes.publishedRevision).toBe(2);

    // Public snapshot now contains published text
    const pubSnapAfter = service.rebuildSnapshot('en');
    expect(pubSnapAfter.content['cta.label']).toBe('Draft Label');

    conn.sqlite.close();
  });

  it('handles End-to-End HTTP requests, Origin check, CSRF & XSS safety on server', async () => {
    const conn = initDatabase(TEST_DB);
    // Initialize admin password
    const passHash = await hashPassword('correct-horse-battery-staple-2026');
    conn.db.insert(schema.authCredentials).values({
      id: 1,
      passwordHash: passHash,
      updatedAt: new Date(),
    }).run();

    const serverInstance = createCopyPatchServer({
      dbPath: TEST_DB,
      publicOrigin: 'http://localhost:5173',
      publishingMode: 'direct',
    }, conn);

    // 1. Health check
    const healthRes = await serverInstance.app.request('/healthz');
    expect(healthRes.status).toBe(200);

    // 2. Public content fetch
    const pubRes = await serverInstance.app.request('/__copypatch/api/v1/content/en');
    expect(pubRes.status).toBe(200);
    const pubData = await pubRes.json();
    expect(pubData.revision).toBe(1);

    // 3. Login with wrong password
    const badLoginRes = await serverInstance.app.request('/__copypatch/api/v1/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(badLoginRes.status).toBe(401);

    // 4. Login with correct password
    const loginRes = await serverInstance.app.request('/__copypatch/api/v1/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ password: 'correct-horse-battery-staple-2026' }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.authenticated).toBe(true);
    expect(loginData.csrfToken).toBeDefined();

    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    const csrfToken = loginData.csrfToken;

    // 5. Protected save with XSS-looking payload & SQL injection payload
    const xssPayload = '<script>alert("xss")</script>';
    const sqlInjectionPayload = "'; DROP TABLE content_entries; --";

    const saveRes = await serverInstance.app.request('/__copypatch/api/v1/editor/en/changes', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        Origin: 'http://localhost:5173',
        [CSRF_HEADER_NAME]: csrfToken,
      },
      body: JSON.stringify({
        expectedPublishedRevision: 1,
        expectedDraftRevision: 1,
        changes: [
          { key: 'sec.xss', text: xssPayload },
          { key: 'sec.sql', text: sqlInjectionPayload }
        ],
      }),
    });
    expect(saveRes.status).toBe(200);

    // 6. Verify public content returns literal strings intact without executing/affecting SQLite
    const verifyRes = await serverInstance.app.request('/__copypatch/api/v1/content/en');
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.content['sec.xss']).toBe(xssPayload);
    expect(verifyData.content['sec.sql']).toBe(sqlInjectionPayload);

    // 7. Security: Verify hostile Origin rejection
    const hostileRes = await serverInstance.app.request('/__copypatch/api/v1/editor/en/changes', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        Origin: 'https://evil-attacker.com',
        [CSRF_HEADER_NAME]: csrfToken,
      },
      body: JSON.stringify({
        expectedPublishedRevision: 2,
        expectedDraftRevision: 1,
        changes: [{ key: 'hacked', text: 'fail' }],
      }),
    });
    expect(hostileRes.status).toBe(403);

    serverInstance.close();
  });
});
