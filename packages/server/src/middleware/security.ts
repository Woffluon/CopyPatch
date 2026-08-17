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
      const origin = c.req.header('Origin') || c.req.header('origin');
      const referer = c.req.header('Referer') || c.req.header('referer');

      // Origin check
      if (origin) {
        const isAllowed = config.publicOrigins.some((allowed) => allowed === origin);

        if (!isAllowed) {
          const errRes: ApiErrorResponse = {
            error: {
              code: 'ORIGIN_REJECTED',
              message: `Origin ${origin} is not authorized for write operations.`,
            },
          };
          return c.json(errRes, 403);
        }
      } else if (referer) {
        // Fallback to referer origin checking if Origin header is omitted by certain clients
        try {
          const refOrigin = new URL(referer).origin;
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
