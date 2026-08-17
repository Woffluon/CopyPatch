import { PublishingMode, DEFAULT_MAX_TEXT_LENGTH, HARD_MAX_TEXT_LENGTH } from '@copypatch/core';

export interface CopyPatchServerConfig {
  /**
   * Path to the SQLite database file
   */
  dbPath: string;
  /**
   * Expected public origin of the frontend application (e.g. "https://example.com" or "http://localhost:5173")
   * Used for Origin verification on state-changing requests.
   */
  publicOrigin: string | string[];
  /**
   * Publishing mode: 'direct' (saves publish immediately) or 'draft' (saves as draft, requires separate publish action)
   * Default: 'direct'
   */
  publishingMode?: PublishingMode;
  /**
   * Maximum character length per text entry (default: 10,000; max: 100,000)
   */
  maxTextLength?: number;
  /**
   * Whether to trust X-Forwarded-* headers from reverse proxies (default: false)
   */
  trustProxy?: boolean;
  /**
   * Cookie prefix / secure flag override (by default auto-detected from publicOrigin / environment)
   */
  cookieOptions?: {
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    name?: string;
  };
  /**
   * Login rate limiting options
   */
  rateLimit?: {
    windowMs?: number;
    maxAttempts?: number;
  };
}

export interface ResolvedServerConfig {
  dbPath: string;
  publicOrigins: string[];
  publishingMode: PublishingMode;
  maxTextLength: number;
  trustProxy: boolean;
  cookieName: string;
  cookieSecure: boolean;
  cookieSameSite: 'Strict' | 'Lax' | 'None';
  rateLimitWindowMs: number;
  rateLimitMaxAttempts: number;
}

export function defineCopyPatchConfig(config: CopyPatchServerConfig): ResolvedServerConfig {
  if (!config.dbPath || typeof config.dbPath !== 'string') {
    throw new Error('CopyPatch configuration error: dbPath is required.');
  }

  if (!config.publicOrigin) {
    throw new Error('CopyPatch configuration error: publicOrigin is required.');
  }

  const publicOrigins = Array.isArray(config.publicOrigin)
    ? config.publicOrigin
    : [config.publicOrigin];

  for (const origin of publicOrigins) {
    if (typeof origin !== 'string' || origin === '*' || !origin.startsWith('http')) {
      throw new Error(`CopyPatch configuration error: Invalid publicOrigin "${origin}". Wildcards are prohibited.`);
    }
  }

  const publishingMode: PublishingMode = config.publishingMode === 'draft' ? 'draft' : 'direct';

  let maxTextLength = config.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  if (typeof maxTextLength !== 'number' || maxTextLength < 1 || maxTextLength > HARD_MAX_TEXT_LENGTH) {
    throw new Error(`CopyPatch configuration error: maxTextLength must be between 1 and ${HARD_MAX_TEXT_LENGTH}.`);
  }

  const trustProxy = Boolean(config.trustProxy);

  // Auto-detect secure cookie: if all public origins are https and not localhost, enforce secure; in production default to secure
  const isAllHttps = publicOrigins.every((o) => o.startsWith('https://'));
  const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
  const cookieSecure = config.cookieOptions?.secure ?? (isProduction || isAllHttps);
  const cookieName = config.cookieOptions?.name ?? (cookieSecure ? '__Host-copypatch_session' : 'copypatch_session');
  const cookieSameSite = config.cookieOptions?.sameSite ?? 'Strict';

  const rateLimitWindowMs = config.rateLimit?.windowMs ?? 15 * 60 * 1000;
  const rateLimitMaxAttempts = config.rateLimit?.maxAttempts ?? 10;

  return {
    dbPath: config.dbPath,
    publicOrigins,
    publishingMode,
    maxTextLength,
    trustProxy,
    cookieName,
    cookieSecure,
    cookieSameSite,
    rateLimitWindowMs,
    rateLimitMaxAttempts,
  };
}
