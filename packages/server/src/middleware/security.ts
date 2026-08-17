import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { SessionManager } from '../auth/session.js';
import { CSRF_HEADER_NAME, ApiErrorResponse } from '@copypatch/core';
import { ResolvedServerConfig } from '../config.js';

export function createSecurityMiddleware(
  sessionManager: SessionManager,
  config: ResolvedServerConfig
) {
  return async (c: Context, next: Next) => {
    // Basic Security Headers
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // CORS Handling for configured public origins
    const rawOrigin = c.req.header('Origin') || c.req.header('origin') || '';
    const reqOrigin = rawOrigin.trim().replace(/\/+$/, '');

    if (reqOrigin && config.publicOrigins.some((allowed) => allowed === reqOrigin)) {
      c.header('Access-Control-Allow-Origin', reqOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      c.header('Access-Control-Allow-Headers', `Content-Type, ${CSRF_HEADER_NAME}, Accept`);
      c.header('Vary', 'Origin');
    }

    // Handle preflight OPTIONS requests immediately
    if (c.req.method.toUpperCase() === 'OPTIONS') {
      return c.body(null, 204);
    }

    // Authenticate session from cookie if present
    const sessionCookie = getCookie(c, config.cookieName);
    if (sessionCookie) {
      const { valid, session } = await sessionManager.validateSession(sessionCookie);
      if (valid && session) {
        c.set('sessionToken', sessionCookie);
        c.set('session', session);
      }
    }

    await next();
  };
}

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const session = c.get('session');
    if (!session) {
      const errRes: ApiErrorResponse = {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Active authenticated session required.',
        },
      };
      return c.json(errRes, 401);
    }
    await next();
  };
}

export function requireOrigin(config: ResolvedServerConfig) {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const rawOrigin = c.req.header('Origin') || c.req.header('origin');
      const rawReferer = c.req.header('Referer') || c.req.header('referer');

      // Origin check
      if (rawOrigin) {
        const normOrigin = rawOrigin.trim().replace(/\/+$/, '');
        const isAllowed = config.publicOrigins.some((allowed) => allowed === normOrigin);

        if (!isAllowed) {
          const errRes: ApiErrorResponse = {
            error: {
              code: 'ORIGIN_REJECTED',
              message: `Origin ${rawOrigin} is not authorized for write operations.`,
            },
          };
          return c.json(errRes, 403);
        }
      } else if (rawReferer) {
        // Fallback to referer origin checking if Origin header is omitted by certain clients
        try {
          const refOrigin = new URL(rawReferer).origin.replace(/\/+$/, '');
          const isAllowed = config.publicOrigins.some((allowed) => allowed === refOrigin);

          if (!isAllowed) {
            const errRes: ApiErrorResponse = {
              error: {
                code: 'ORIGIN_REJECTED',
                message: `Referer origin ${refOrigin} is not authorized.`,
              },
            };
            return c.json(errRes, 403);
          }
        } catch {
          const errRes: ApiErrorResponse = {
            error: {
              code: 'ORIGIN_REJECTED',
              message: 'Invalid referer header.',
            },
          };
          return c.json(errRes, 403);
        }
      }
    }
    await next();
  };
}

export function requireCsrf(sessionManager: SessionManager) {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const sessionToken = c.get('sessionToken');
      const csrfHeader = c.req.header(CSRF_HEADER_NAME);

      if (!sessionToken || !csrfHeader) {
        const errRes: ApiErrorResponse = {
          error: {
            code: 'CSRF_FAILED',
            message: 'Missing CSRF token header.',
          },
        };
        return c.json(errRes, 403);
      }

      const isValid = await sessionManager.validateCsrf(sessionToken, csrfHeader);
      if (!isValid) {
        const errRes: ApiErrorResponse = {
          error: {
            code: 'CSRF_FAILED',
            message: 'Invalid or expired CSRF token.',
          },
        };
        return c.json(errRes, 403);
      }
    }
    await next();
  };
}
