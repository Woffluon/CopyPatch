import crypto from 'node:crypto';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, lt } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { generateSecureToken, hashToken } from './crypto.js';

export interface SessionData {
  tokenHash: string;
  csrfTokenHash: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface SessionTokens {
  sessionToken: string;
  csrfToken: string;
}

const DEFAULT_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SessionManager {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    private absoluteTimeoutMs = DEFAULT_ABSOLUTE_TIMEOUT_MS
  ) {}

  async createSession(): Promise<SessionTokens> {
    const sessionToken = generateSecureToken(32);
    const csrfToken = generateSecureToken(32);

    const tokenHash = hashToken(sessionToken);
    const csrfTokenHash = hashToken(csrfToken);

    const now = new Date();
    const idleExpiresAt = new Date(now.getTime() + this.idleTimeoutMs);
    const absoluteExpiresAt = new Date(now.getTime() + this.absoluteTimeoutMs);

    this.db.insert(schema.sessions).values({
      tokenHash,
      csrfTokenHash,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt,
      absoluteExpiresAt,
    }).run();

    return { sessionToken, csrfToken };
  }

  async validateSession(sessionToken: string): Promise<{ valid: boolean; csrfToken?: string; session?: SessionData }> {
    if (!sessionToken) return { valid: false };

    const tokenHash = hashToken(sessionToken);
    const session = this.db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).get();

    if (!session) return { valid: false };

    const now = new Date();
    if (now > session.idleExpiresAt || now > session.absoluteExpiresAt) {
      this.destroySession(sessionToken);
      return { valid: false };
    }

    // Refresh idle expiration
    const newIdleExpiresAt = new Date(now.getTime() + this.idleTimeoutMs);
    this.db.update(schema.sessions)
      .set({
        lastSeenAt: now,
        idleExpiresAt: newIdleExpiresAt,
      })
      .where(eq(schema.sessions.tokenHash, tokenHash))
      .run();

    return {
      valid: true,
      session: {
        tokenHash: session.tokenHash,
        csrfTokenHash: session.csrfTokenHash,
        idleExpiresAt: newIdleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      }
    };
  }

  async validateCsrf(sessionToken: string, csrfToken: string): Promise<boolean> {
    if (!sessionToken || !csrfToken) return false;

    const tokenHash = hashToken(sessionToken);
    const session = this.db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).get();

    if (!session) return false;

    const csrfTokenHash = hashToken(csrfToken);
    const sessionBuf = Buffer.from(session.csrfTokenHash, 'hex');
    const inputBuf = Buffer.from(csrfTokenHash, 'hex');
    if (sessionBuf.length !== inputBuf.length) return false;
    return crypto.timingSafeEqual(sessionBuf, inputBuf);
  }

  async rotateCsrf(sessionToken: string): Promise<string | null> {
    if (!sessionToken) return null;
    const tokenHash = hashToken(sessionToken);
    const newCsrfToken = generateSecureToken(32);
    const newCsrfHash = hashToken(newCsrfToken);

    const res = this.db.update(schema.sessions)
      .set({ csrfTokenHash: newCsrfHash })
      .where(eq(schema.sessions.tokenHash, tokenHash))
      .run();

    if (res.changes === 0) return null;
    return newCsrfToken;
  }

  async destroySession(sessionToken: string): Promise<void> {
    if (!sessionToken) return;
    const tokenHash = hashToken(sessionToken);
    this.db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).run();
  }

  async invalidateAllSessions(): Promise<void> {
    this.db.delete(schema.sessions).run();
  }

  async cleanExpiredSessions(): Promise<number> {
    const now = new Date();
    const res = this.db.delete(schema.sessions)
      .where(lt(schema.sessions.idleExpiresAt, now))
      .run();
    return res.changes;
  }
}
