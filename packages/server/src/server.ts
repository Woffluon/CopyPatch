import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import {
  API_BASE_PATH,
  isValidLocale,
  ApiErrorResponse,
  ContentSnapshot,
  EditorSnapshot,
  SaveChangesRequest,
  SaveChangesResponse,
  PublishResponse,
  SessionAuthResponse,
} from '@copypatch/core';
import { DatabaseConnection } from './db/index.js';
import * as schema from './db/schema.js';
import { SessionManager, SessionData } from './auth/session.js';
import { ContentService, RevisionConflictError } from './services/content-service.js';
import { SnapshotCache } from './services/snapshot-cache.js';
import { MemoryRateLimiter } from './middleware/rate-limiter.js';
import { defineCopyPatchConfig, CopyPatchServerConfig, ResolvedServerConfig } from './config.js';
import {
  createSecurityMiddleware,
  requireAuth,
  requireOrigin,
  requireCsrf,
} from './middleware/security.js';
import { verifyPassword } from './auth/crypto.js';

export type HonoEnv = {
  Variables: {
    sessionToken?: string;
    session?: SessionData;
  };
};

export interface CopyPatchServerInstance {
  app: Hono<HonoEnv>;
  config: ResolvedServerConfig;
  sessionManager: SessionManager;
  contentService: ContentService;
  snapshotCache: SnapshotCache;
  rateLimiter: MemoryRateLimiter;
  dbConnection: DatabaseConnection;
  close: () => void;
}

export function createCopyPatchServer(
  rawConfig: CopyPatchServerConfig,
  dbConnection: DatabaseConnection
): CopyPatchServerInstance {
  const config = defineCopyPatchConfig(rawConfig);
  const app = new Hono<HonoEnv>();

  const snapshotCache = new SnapshotCache();
  const contentService = new ContentService(
    dbConnection.db,
    snapshotCache,
    config.publishingMode,
    config.maxTextLength
  );

  // Warm up snapshot cache at startup
  contentService.warmCache();

  const sessionManager = new SessionManager(dbConnection.db);
  // Periodic session cleanup sweep
  const cleanupInterval = setInterval(() => {
    sessionManager.cleanExpiredSessions().catch(() => {});
  }, 3600000);
  cleanupInterval.unref?.();

  const rateLimiter = new MemoryRateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxAttempts: config.rateLimitMaxAttempts,
  });

  // Health endpoint (minimal readiness)
  app.get('/healthz', (c) => {
    return c.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Global Middleware
  app.use('*', createSecurityMiddleware(sessionManager, config));

  const api = new Hono<HonoEnv>();

  // ==========================================
  // 1. PUBLIC CONTENT ENDPOINT
  // ==========================================
  api.get('/content/:locale', (c) => {
    const locale = c.req.param('locale') || '';
    if (!isValidLocale(locale)) {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: `Invalid locale format: ${locale}` },
      };
      return c.json(errRes, 400);
    }

    const snapshot = contentService.getPublishedSnapshot(locale);
    const etag = `W/"rev-${snapshot.revision}"`;

    // Cache-Control & ETag validation
    c.header('Cache-Control', 'public, max-age=0, must-revalidate');
    c.header('ETag', etag);

    const ifNoneMatch = c.req.header('If-None-Match') || c.req.header('if-none-match');
    if (ifNoneMatch === etag) {
      return c.body(null, 304);
    }

    return c.json(snapshot);
  });

  // ==========================================
  // 2. SESSION / AUTH ENDPOINTS
  // ==========================================
  api.post('/session', requireOrigin(config), async (c) => {
    // Rate limit check
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    const socketIp = (c.env as any)?.incoming?.socket?.remoteAddress || (c.req.raw as any)?.socket?.remoteAddress;
    const clientIp = (config.trustProxy && forwarded) ? forwarded : (socketIp || '127.0.0.1');

    if (rateLimiter.isRateLimited(clientIp)) {
      const errRes: ApiErrorResponse = {
        error: { code: 'RATE_LIMITED', message: 'Too many failed login attempts. Please try again later.' },
      };
      return c.json(errRes, 429);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON request body.' },
      };
      return c.json(errRes, 400);
    }

    const { password } = body;
    if (!password || typeof password !== 'string') {
      rateLimiter.recordAttempt(clientIp);
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: 'Password is required.' },
      };
      return c.json(errRes, 400);
    }

    // Verify against DB password hash
    const authCred = dbConnection.db.select().from(schema.authCredentials).get();
    if (!authCred) {
      const errRes: ApiErrorResponse = {
        error: { code: 'INTERNAL_ERROR', message: 'CopyPatch has not been initialized. Please run `copypatch init`.' },
      };
      return c.json(errRes, 500);
    }

    const isValid = await verifyPassword(password, authCred.passwordHash);
    if (!isValid) {
      rateLimiter.recordAttempt(clientIp);
      const errRes: ApiErrorResponse = {
        error: { code: 'UNAUTHENTICATED', message: 'Invalid password.' },
      };
      return c.json(errRes, 401);
    }

    // Reset rate limiter on successful login
    rateLimiter.reset(clientIp);

    // Create session & CSRF
    const { sessionToken, csrfToken } = await sessionManager.createSession();

    // Set secure cookie
    setCookie(c, config.cookieName, sessionToken, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    const resData: SessionAuthResponse = {
      authenticated: true,
      csrfToken,
      publishingMode: config.publishingMode,
    };
    return c.json(resData);
  });

  api.get('/session', async (c) => {
    c.header('Cache-Control', 'no-store');
    const sessionToken = c.get('sessionToken');
    const session = c.get('session');

    if (!sessionToken || !session) {
      const resData: SessionAuthResponse = { authenticated: false };
      return c.json(resData);
    }

    // Generate fresh CSRF token
    const csrfToken = await sessionManager.rotateCsrf(sessionToken);

    const resData: SessionAuthResponse = {
      authenticated: true,
      csrfToken: csrfToken ?? undefined,
      publishingMode: config.publishingMode,
    };
    return c.json(resData);
  });

  api.delete('/session', requireOrigin(config), requireCsrf(sessionManager), async (c) => {
    c.header('Cache-Control', 'no-store');
    const sessionToken = c.get('sessionToken');
    if (sessionToken) {
      await sessionManager.destroySession(sessionToken);
      deleteCookie(c, config.cookieName, {
        path: '/',
        secure: config.cookieSecure,
        sameSite: config.cookieSameSite,
      });
    }
    return c.json({ success: true });
  });

  // ==========================================
  // 3. EDITOR PROTECTED ENDPOINTS
  // ==========================================
  api.get('/editor/:locale', requireAuth(), (c) => {
    c.header('Cache-Control', 'no-store');
    const locale = c.req.param('locale') || '';
    if (!isValidLocale(locale)) {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: `Invalid locale format: ${locale}` },
      };
      return c.json(errRes, 400);
    }

    const editorSnapshot = contentService.getEditorSnapshot(locale);
    return c.json(editorSnapshot);
  });

  api.put('/editor/:locale/changes', requireAuth(), requireOrigin(config), requireCsrf(sessionManager), async (c) => {
    c.header('Cache-Control', 'no-store');
    const locale = c.req.param('locale') || '';
    if (!isValidLocale(locale)) {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: `Invalid locale format: ${locale}` },
      };
      return c.json(errRes, 400);
    }

    let body: SaveChangesRequest;
    try {
      body = await c.req.json();
    } catch {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' },
      };
      return c.json(errRes, 400);
    }

    if (
      typeof body.expectedPublishedRevision !== 'number' ||
      typeof body.expectedDraftRevision !== 'number' ||
      !Array.isArray(body.changes) ||
      body.changes.length > 500
    ) {
      const errRes: ApiErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: Array.isArray(body.changes) && body.changes.length > 500
            ? 'Too many changes in a single request (maximum: 500).'
            : 'Invalid SaveChangesRequest payload structure.',
        },
      };
      return c.json(errRes, 400);
    }

    try {
      const { publishedRevision, draftRevision } = contentService.saveChanges(
        locale,
        body.expectedPublishedRevision,
        body.expectedDraftRevision,
        body.changes
      );

      // If direct mode, rebuild snapshot cache immediately
      if (config.publishingMode === 'direct') {
        contentService.rebuildSnapshot(locale);
      }

      const res: SaveChangesResponse = {
        success: true,
        publishedRevision,
        draftRevision,
        message: config.publishingMode === 'direct' ? 'Published successfully.' : 'Drafts saved successfully.',
      };
      return c.json(res);
    } catch (err: unknown) {
      if (err instanceof RevisionConflictError) {
        const errRes: ApiErrorResponse = {
          error: { code: 'REVISION_CONFLICT', message: err.message },
        };
        return c.json(errRes, 409);
      }
      const message = err instanceof Error ? err.message : 'Error saving changes.';
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message },
      };
      return c.json(errRes, 400);
    }
  });

  api.post('/editor/:locale/publish', requireAuth(), requireOrigin(config), requireCsrf(sessionManager), async (c) => {
    c.header('Cache-Control', 'no-store');
    const locale = c.req.param('locale') || '';
    if (!isValidLocale(locale)) {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: `Invalid locale format: ${locale}` },
      };
      return c.json(errRes, 400);
    }

    if (config.publishingMode !== 'draft') {
      const errRes: ApiErrorResponse = {
        error: { code: 'UNSUPPORTED_OPERATION', message: 'Publish action is only available in draft publishingMode.' },
      };
      return c.json(errRes, 400);
    }

    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      // payload might be empty or optional
    }

    const expectedDraftRevision = typeof body.expectedDraftRevision === 'number' ? body.expectedDraftRevision : 1;

    try {
      const result = contentService.publishDrafts(locale, expectedDraftRevision);
      // Atomically refresh public snapshot cache
      contentService.rebuildSnapshot(locale);

      const res: PublishResponse = {
        success: true,
        publishedRevision: result.publishedRevision,
        draftRevision: result.draftRevision,
        promotedCount: result.promotedCount,
      };
      return c.json(res);
    } catch (err: unknown) {
      if (err instanceof RevisionConflictError) {
        const errRes: ApiErrorResponse = {
          error: { code: 'REVISION_CONFLICT', message: err.message },
        };
        return c.json(errRes, 409);
      }
      const message = err instanceof Error ? err.message : 'Error publishing drafts.';
      const errRes: ApiErrorResponse = {
        error: { code: 'INTERNAL_ERROR', message },
      };
      return c.json(errRes, 500);
    }
  });

  api.delete('/editor/:locale/drafts', requireAuth(), requireOrigin(config), requireCsrf(sessionManager), async (c) => {
    c.header('Cache-Control', 'no-store');
    const locale = c.req.param('locale') || '';
    if (!isValidLocale(locale)) {
      const errRes: ApiErrorResponse = {
        error: { code: 'VALIDATION_ERROR', message: `Invalid locale format: ${locale}` },
      };
      return c.json(errRes, 400);
    }

    const { draftRevision } = contentService.discardDrafts(locale);
    return c.json({ success: true, draftRevision });
  });

  // Mount API router to base path
  app.route(API_BASE_PATH, api);

  return {
    app,
    config,
    sessionManager,
    contentService,
    snapshotCache,
    rateLimiter,
    dbConnection,
    close: () => {
      clearInterval(cleanupInterval);
      rateLimiter.destroy();
      dbConnection.sqlite.close();
    },
  };
}
