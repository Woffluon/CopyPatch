import {
  API_BASE_PATH,
  CSRF_HEADER_NAME,
  DEFAULT_MAX_TEXT_LENGTH,
  HARD_MAX_TEXT_LENGTH,
  isValidContentKey,
  isValidLocale,
  normalizeText,
  type ApiErrorResponse,
  type ContentChange,
  type ContentSnapshot,
  type CopyPatchAuthAdapter,
  type CopyPatchHandleContext,
  type CopyPatchPersistence,
  type CopyPatchPrincipal,
  type CopyPatchRequestHandler,
  type CopyPatchRole,
  type EditorSnapshot,
  type ErrorCode,
  type PersistenceMutationResult,
  type PublishedSnapshotReader,
  type StoredSession,
} from '@copypatch/core';
import { generateToken, hashesEqual, hashRateLimitKey, hashToken, verifyPassphrase } from './crypto.js';

const SESSION_COOKIE_NAME = '__Host-copypatch-session';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_CHANGES = 500;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

interface BackendBaseOptions {
  persistence: CopyPatchPersistence;
  maxTextLength?: number;
  session?: {
    idleTimeoutMs?: number;
    absoluteTimeoutMs?: number;
  };
  rateLimit?: {
    limit?: number;
    windowMs?: number;
  };
  now?: () => number;
}

export type CopyPatchBackendOptions<THostAuth = unknown> = BackendBaseOptions & (
  | { passphraseHash: string; authAdapter?: never }
  | { authAdapter: CopyPatchAuthAdapter<THostAuth>; passphraseHash?: never }
);

export interface CopyPatchBackend<THostAuth = unknown>
  extends CopyPatchRequestHandler<THostAuth>, PublishedSnapshotReader {}

interface ResolvedOptions<THostAuth> {
  persistence: CopyPatchPersistence;
  passphraseHash?: string;
  authAdapter?: CopyPatchAuthAdapter<THostAuth>;
  maxTextLength: number;
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  rateLimit: number;
  rateLimitWindowMs: number;
  now: () => number;
}

interface AuthenticatedRequest {
  principal: CopyPatchPrincipal;
  sessionTokenHash?: string;
  session?: StoredSession;
}

interface SnapshotRead {
  snapshot: ContentSnapshot;
  fallback: boolean;
}

class CopyPatchBackendRuntime<THostAuth> implements CopyPatchBackend<THostAuth> {
  private readonly snapshots = new Map<string, ContentSnapshot>();

  constructor(private readonly options: ResolvedOptions<THostAuth>) {}

  async readPublished(locale: string): Promise<ContentSnapshot> {
    if (!isValidLocale(locale)) throw new TypeError('Invalid locale.');
    return (await this.readPublishedWithFallback(locale)).snapshot;
  }

  async handle(request: Request, context: CopyPatchHandleContext<THostAuth> = {}): Promise<Response> {
    try {
      return this.secure(await this.route(request, context));
    } catch {
      return this.secure(this.error(500, 'INTERNAL_ERROR', 'The request could not be completed.'));
    }
  }

  private async route(request: Request, context: CopyPatchHandleContext<THostAuth>): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
    if (UNSAFE_METHODS.has(method)) {
      const originFailure = this.checkOrigin(request, url.origin);
      if (originFailure) return originFailure;
      const rateFailure = await this.checkRateLimit(request, context, url.pathname);
      if (rateFailure) return rateFailure;
    }

    if (method === 'GET' && (url.pathname === '/healthz' || url.pathname === `${API_BASE_PATH}/health`)) {
      const health = await this.options.persistence.health();
      return this.json(health.ok ? 200 : 503, { status: health.ok ? 'ok' : 'unavailable' }, { 'cache-control': 'no-store' });
    }

    if (url.pathname === `${API_BASE_PATH}/session`) {
      if (method === 'POST') return this.createSession(request, context);
      if (method === 'GET') return this.readSession(request, context);
      if (method === 'DELETE') return this.deleteSession(request, context);
      return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
    }

    const contentMatch = this.matchLocale(url.pathname, `${API_BASE_PATH}/content/`);
    if (contentMatch !== null) {
      if (method !== 'GET') return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
      if (!isValidLocale(contentMatch)) return this.validation('Invalid locale.');
      const result = await this.readPublishedWithFallback(contentMatch);
      const headers: Record<string, string> = result.fallback
        ? { 'cache-control': 'no-store' }
        : { 'cache-control': 'public, max-age=0, must-revalidate', etag: `W/"rev-${result.snapshot.revision}"` };
      if (!result.fallback && request.headers.get('if-none-match') === headers.etag) {
        return new Response(null, { status: 304, headers });
      }
      return this.json(200, result.snapshot, headers);
    }

    const changesMatch = this.matchLocale(url.pathname, `${API_BASE_PATH}/editor/`, '/changes');
    if (changesMatch !== null) {
      if (method !== 'PUT') return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
      return this.saveDrafts(request, context, changesMatch);
    }

    const publishMatch = this.matchLocale(url.pathname, `${API_BASE_PATH}/editor/`, '/publish');
    if (publishMatch !== null) {
      if (method !== 'POST') return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
      return this.publishDrafts(request, context, publishMatch);
    }

    const draftsMatch = this.matchLocale(url.pathname, `${API_BASE_PATH}/editor/`, '/drafts');
    if (draftsMatch !== null) {
      if (method !== 'DELETE') return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
      return this.discardDrafts(request, context, draftsMatch);
    }

    const editorMatch = this.matchLocale(url.pathname, `${API_BASE_PATH}/editor/`);
    if (editorMatch !== null) {
      if (method !== 'GET') return this.error(405, 'UNSUPPORTED_OPERATION', 'Method not allowed.');
      if (!isValidLocale(editorMatch)) return this.validation('Invalid locale.');
      const auth = await this.authenticate(request, context);
      if (auth instanceof Response) return auth;
      if (!this.hasRole(auth.principal, 'editor') && !this.hasRole(auth.principal, 'publisher')) {
        return this.error(403, 'UNAUTHENTICATED', 'Editor access is required.');
      }
      return this.json(200, await this.options.persistence.readEditor(editorMatch), { 'cache-control': 'no-store' });
    }

    return this.error(404, 'NOT_FOUND', 'Endpoint not found.');
  }

  private async createSession(request: Request, context: CopyPatchHandleContext<THostAuth>): Promise<Response> {
    if (this.options.authAdapter) {
      const auth = await this.authenticateHost(request, context, true);
      if (auth instanceof Response) return auth;
      return this.json(200, { authenticated: true, requiresCsrf: false, roles: auth.principal.roles, publishingMode: 'draft' }, { 'cache-control': 'no-store' });
    }

    const parsed = await this.readJson(request);
    if (parsed instanceof Response) return parsed;
    if (!this.isRecord(parsed)) return this.validation('Invalid session payload.');
    const passphrase = parsed.passphrase ?? parsed.password;
    if (typeof passphrase !== 'string' || passphrase.length < 1 || Object.keys(parsed).some((key) => key !== 'passphrase' && key !== 'password')) {
      return this.validation('A passphrase is required.');
    }
    if (!await verifyPassphrase(passphrase, this.options.passphraseHash ?? '')) {
      return this.error(401, 'UNAUTHENTICATED', 'Invalid credentials.');
    }

    const now = this.options.now();
    const sessionToken = generateToken();
    const csrfToken = generateToken();
    const stored: StoredSession = {
      tokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      subject: 'built-in',
      roles: ['editor', 'publisher'],
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: now + this.options.idleTimeoutMs,
      absoluteExpiresAt: now + this.options.absoluteTimeoutMs,
    };
    await this.options.persistence.createSession(stored);

    const cookie = `${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(this.options.absoluteTimeoutMs / 1000)}`;
    return this.json(200, { authenticated: true, requiresCsrf: true, csrfToken, roles: stored.roles, publishingMode: 'draft' }, {
      'cache-control': 'no-store',
      'set-cookie': cookie,
    });
  }

  private async readSession(request: Request, context: CopyPatchHandleContext<THostAuth>): Promise<Response> {
    if (this.options.authAdapter) {
      const auth = await this.authenticateHost(request, context, false);
      if (auth instanceof Response) return this.json(200, { authenticated: false, requiresCsrf: false }, { 'cache-control': 'no-store' });
      return this.json(200, { authenticated: true, requiresCsrf: false, roles: auth.principal.roles, publishingMode: 'draft' }, { 'cache-control': 'no-store' });
    }

    const auth = await this.authenticateBuiltIn(request);
    if (auth instanceof Response) return this.json(200, { authenticated: false, requiresCsrf: false }, { 'cache-control': 'no-store' });
    const csrfToken = generateToken();
    const updated = await this.options.persistence.touchSession(auth.sessionTokenHash!, {
      lastSeenAt: this.options.now(),
      idleExpiresAt: Math.min(this.options.now() + this.options.idleTimeoutMs, auth.session!.absoluteExpiresAt),
      csrfTokenHash: hashToken(csrfToken),
    });
    if (!updated) return this.json(200, { authenticated: false, requiresCsrf: false }, { 'cache-control': 'no-store' });
    return this.json(200, { authenticated: true, requiresCsrf: true, csrfToken, roles: updated.roles, publishingMode: 'draft' }, { 'cache-control': 'no-store' });
  }

  private async deleteSession(request: Request, context: CopyPatchHandleContext<THostAuth>): Promise<Response> {
    const auth = await this.authenticateMutation(request, context, 'editor');
    if (auth instanceof Response) return auth;
    if (auth.sessionTokenHash) await this.options.persistence.deleteSession(auth.sessionTokenHash);
    const expiredCookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
    return this.json(200, { success: true }, { 'cache-control': 'no-store', 'set-cookie': expiredCookie });
  }

  private async saveDrafts(request: Request, context: CopyPatchHandleContext<THostAuth>, locale: string): Promise<Response> {
    if (!isValidLocale(locale)) return this.validation('Invalid locale.');
    const auth = await this.authenticateMutation(request, context, 'editor');
    if (auth instanceof Response) return auth;
    const parsed = await this.readJson(request);
    if (parsed instanceof Response) return parsed;
    const command = this.parseSaveCommand(parsed, locale);
    if (command instanceof Response) return command;
    const result = await this.options.persistence.saveDrafts(command);
    return this.mutationResponse(result);
  }

  private async publishDrafts(request: Request, context: CopyPatchHandleContext<THostAuth>, locale: string): Promise<Response> {
    if (!isValidLocale(locale)) return this.validation('Invalid locale.');
    const auth = await this.authenticateMutation(request, context, 'publisher');
    if (auth instanceof Response) return auth;
    const parsed = await this.readJson(request);
    if (parsed instanceof Response) return parsed;
    const revisions = this.parseRevisions(parsed);
    if (revisions instanceof Response) return revisions;
    const result = await this.options.persistence.publishDrafts({ locale, ...revisions });
    return this.mutationResponse(result);
  }

  private async discardDrafts(request: Request, context: CopyPatchHandleContext<THostAuth>, locale: string): Promise<Response> {
    if (!isValidLocale(locale)) return this.validation('Invalid locale.');
    const auth = await this.authenticateMutation(request, context, 'editor');
    if (auth instanceof Response) return auth;
    const parsed = await this.readJson(request);
    if (parsed instanceof Response) return parsed;
    const revisions = this.parseRevisions(parsed);
    if (revisions instanceof Response) return revisions;
    const result = await this.options.persistence.discardDrafts({ locale, ...revisions });
    return this.mutationResponse(result);
  }

  private async authenticateMutation(
    request: Request,
    context: CopyPatchHandleContext<THostAuth>,
    role: CopyPatchRole,
  ): Promise<AuthenticatedRequest | Response> {
    const auth = this.options.authAdapter
      ? await this.authenticateHost(request, context, true)
      : await this.authenticateBuiltIn(request);
    if (auth instanceof Response) return auth;
    if (!this.hasRole(auth.principal, role)) return this.error(403, 'UNAUTHENTICATED', `${role} role is required.`);
    if (!this.options.authAdapter) {
      const csrf = request.headers.get(CSRF_HEADER_NAME);
      if (!csrf || !auth.session || !hashesEqual(hashToken(csrf), auth.session.csrfTokenHash)) {
        return this.error(403, 'CSRF_FAILED', 'Mutation verification failed.');
      }
    }
    return auth;
  }

  private async authenticate(request: Request, context: CopyPatchHandleContext<THostAuth>): Promise<AuthenticatedRequest | Response> {
    return this.options.authAdapter
      ? this.authenticateHost(request, context, false)
      : this.authenticateBuiltIn(request);
  }

  private async authenticateHost(
    request: Request,
    context: CopyPatchHandleContext<THostAuth>,
    mutation: boolean,
  ): Promise<AuthenticatedRequest | Response> {
    try {
      const principal = await this.options.authAdapter!.authenticate(request.clone(), context);
      if (!principal || !this.validPrincipal(principal)) return this.error(401, 'UNAUTHENTICATED', 'Authentication is required.');
      if (mutation) {
        const verified = await this.options.authAdapter!.verifyMutation(request.clone(), principal, context);
        if (verified !== true) return this.error(403, 'CSRF_FAILED', 'Mutation verification failed.');
      }
      return { principal };
    } catch {
      return this.error(mutation ? 403 : 401, mutation ? 'CSRF_FAILED' : 'UNAUTHENTICATED', mutation ? 'Mutation verification failed.' : 'Authentication is required.');
    }
  }

  private async authenticateBuiltIn(request: Request): Promise<AuthenticatedRequest | Response> {
    const rawToken = this.cookie(request, SESSION_COOKIE_NAME);
    if (!rawToken) return this.error(401, 'UNAUTHENTICATED', 'Authentication is required.');
    const tokenHash = hashToken(rawToken);
    const session = await this.options.persistence.readSession(tokenHash);
    const now = this.options.now();
    if (!session || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now || !this.validPrincipal(session)) {
      if (session) await this.options.persistence.deleteSession(tokenHash);
      return this.error(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    const updated = await this.options.persistence.touchSession(tokenHash, {
      lastSeenAt: now,
      idleExpiresAt: Math.min(now + this.options.idleTimeoutMs, session.absoluteExpiresAt),
    });
    if (!updated) return this.error(401, 'UNAUTHENTICATED', 'Authentication is required.');
    return { principal: updated, sessionTokenHash: tokenHash, session: updated };
  }

  private async checkRateLimit(
    request: Request,
    context: CopyPatchHandleContext<THostAuth>,
    pathname: string,
  ): Promise<Response | null> {
    const identity = context.clientAddress ?? 'unknown-client';
    const keyHash = hashRateLimitKey(`${identity}\0${request.method.toUpperCase()}\0${pathname}`);
    const decision = await this.options.persistence.consumeRateLimit({
      keyHash,
      limit: this.options.rateLimit,
      windowMs: this.options.rateLimitWindowMs,
      now: this.options.now(),
    });
    if (decision.allowed) return null;
    return this.json(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many requests.' },
    }, {
      'cache-control': 'no-store',
      'retry-after': String(Math.max(1, Math.ceil((decision.resetAt - this.options.now()) / 1000))),
    });
  }

  private checkOrigin(request: Request, expectedOrigin: string): Response | null {
    const origin = request.headers.get('origin');
    if (origin !== expectedOrigin) return this.error(403, 'ORIGIN_REJECTED', 'Exact same-origin is required.');
    return null;
  }

  private parseSaveCommand(value: unknown, locale: string) {
    if (!this.isRecord(value) || !this.onlyKeys(value, ['expectedPublishedRevision', 'expectedDraftRevision', 'changes'])) {
      return this.validation('Invalid draft payload.');
    }
    const revisions = this.parseRevisionValues(value.expectedPublishedRevision, value.expectedDraftRevision);
    if (!revisions || !Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > MAX_CHANGES) {
      return this.validation('Invalid draft payload.');
    }
    const keys = new Set<string>();
    const changes: ContentChange[] = [];
    for (const item of value.changes) {
      if (!this.isRecord(item) || !this.onlyKeys(item, ['key', 'text']) || typeof item.key !== 'string' || typeof item.text !== 'string') {
        return this.validation('Invalid content change.');
      }
      if (!isValidContentKey(item.key) || item.text.length > this.options.maxTextLength || keys.has(item.key)) {
        return this.validation('Invalid content change.');
      }
      keys.add(item.key);
      changes.push({ key: item.key, text: normalizeText(item.text, true) });
    }
    return { locale, ...revisions, changes };
  }

  private parseRevisions(value: unknown): { expectedPublishedRevision: number; expectedDraftRevision: number } | Response {
    if (!this.isRecord(value) || !this.onlyKeys(value, ['expectedPublishedRevision', 'expectedDraftRevision'])) {
      return this.validation('Both expected revisions are required.');
    }
    const revisions = this.parseRevisionValues(value.expectedPublishedRevision, value.expectedDraftRevision);
    return revisions ?? this.validation('Both expected revisions must be positive safe integers.');
  }

  private parseRevisionValues(published: unknown, draft: unknown) {
    if (!Number.isSafeInteger(published) || !Number.isSafeInteger(draft) || (published as number) < 1 || (draft as number) < 1) return null;
    return { expectedPublishedRevision: published as number, expectedDraftRevision: draft as number };
  }

  private mutationResponse<T>(result: PersistenceMutationResult<T>): Response {
    if (result.status === 'conflict') {
      return this.json(409, {
        error: { code: 'REVISION_CONFLICT', message: 'The editor snapshot has changed.' },
        latest: result.latest,
      }, { 'cache-control': 'no-store' });
    }
    return this.json(200, { success: true, ...result.value }, { 'cache-control': 'no-store' });
  }

  private async readPublishedWithFallback(locale: string): Promise<SnapshotRead> {
    try {
      const snapshot = this.copySnapshot(await this.options.persistence.readPublished(locale));
      this.snapshots.set(locale, snapshot);
      return { snapshot: this.copySnapshot(snapshot), fallback: false };
    } catch {
      const cached = this.snapshots.get(locale) ?? { revision: 1, content: {} };
      return { snapshot: this.copySnapshot(cached), fallback: true };
    }
  }

  private copySnapshot(snapshot: ContentSnapshot): ContentSnapshot {
    return { revision: snapshot.revision, content: { ...snapshot.content } };
  }

  private async readJson(request: Request): Promise<unknown | Response> {
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return this.validation('Request body is too large.');
    let text: string;
    try {
      const body = await this.readTextBody(request);
      if (body instanceof Response) return body;
      text = body;
    } catch {
      return this.validation('Request body could not be read.');
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return this.validation('Request body is too large.');
    try {
      return JSON.parse(text);
    } catch {
      return this.validation('Invalid JSON request body.');
    }
  }

  private async readTextBody(request: Request): Promise<string | Response> {
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        byteLength += value.byteLength;
        if (byteLength > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          return this.validation('Request body is too large.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, byteLength).toString('utf8');
  }

  private matchLocale(pathname: string, prefix: string, suffix = ''): string | null {
    if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
    const end = suffix ? pathname.length - suffix.length : pathname.length;
    const encoded = pathname.slice(prefix.length, end);
    if (!encoded || encoded.includes('/')) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return '';
    }
  }

  private cookie(request: Request, name: string): string | null {
    for (const part of (request.headers.get('cookie') ?? '').split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
    }
    return null;
  }

  private validPrincipal(principal: CopyPatchPrincipal): boolean {
    return typeof principal.subject === 'string'
      && principal.subject.length > 0
      && Array.isArray(principal.roles)
      && principal.roles.every((role) => role === 'editor' || role === 'publisher');
  }

  private hasRole(principal: CopyPatchPrincipal, role: CopyPatchRole): boolean {
    return principal.roles.includes(role);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
  }

  private secure(response: Response): Response {
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('x-frame-options', 'SAMEORIGIN');
    response.headers.set('referrer-policy', 'same-origin');
    return response;
  }

  private validation(message: string): Response {
    return this.error(400, 'VALIDATION_ERROR', message);
  }

  private error(status: number, code: ErrorCode, message: string): Response {
    const body: ApiErrorResponse = { error: { code, message } };
    return this.json(status, body, { 'cache-control': 'no-store' });
  }

  private json(status: number, value: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(value, { status, headers });
  }
}

export function createCopyPatchBackend<THostAuth = unknown>(
  options: CopyPatchBackendOptions<THostAuth>,
): CopyPatchBackend<THostAuth> {
  const hasPassphrase = typeof (options as { passphraseHash?: unknown }).passphraseHash === 'string';
  const hasAdapter = typeof (options as { authAdapter?: unknown }).authAdapter === 'object';
  if (hasPassphrase === hasAdapter) throw new TypeError('Configure exactly one of passphraseHash or authAdapter.');
  if (hasPassphrase && !(options as { passphraseHash: string }).passphraseHash.startsWith('$argon2id$')) {
    throw new TypeError('passphraseHash must be an Argon2id encoded hash.');
  }

  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  if (!Number.isSafeInteger(maxTextLength) || maxTextLength < 1 || maxTextLength > HARD_MAX_TEXT_LENGTH) {
    throw new TypeError(`maxTextLength must be between 1 and ${HARD_MAX_TEXT_LENGTH}.`);
  }
  const idleTimeoutMs = options.session?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const absoluteTimeoutMs = options.session?.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
  const rateLimit = options.rateLimit?.limit ?? 30;
  const rateLimitWindowMs = options.rateLimit?.windowMs ?? 60_000;
  for (const [name, value] of Object.entries({ idleTimeoutMs, absoluteTimeoutMs, rateLimit, rateLimitWindowMs })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer.`);
  }
  if (idleTimeoutMs > absoluteTimeoutMs) throw new TypeError('idleTimeoutMs cannot exceed absoluteTimeoutMs.');

  const resolved: ResolvedOptions<THostAuth> = {
    persistence: options.persistence,
    maxTextLength,
    idleTimeoutMs,
    absoluteTimeoutMs,
    rateLimit,
    rateLimitWindowMs,
    now: options.now ?? Date.now,
  };
  if (hasPassphrase) resolved.passphraseHash = (options as { passphraseHash: string }).passphraseHash;
  if (hasAdapter) resolved.authAdapter = (options as { authAdapter: CopyPatchAuthAdapter<THostAuth> }).authAdapter;
  return new CopyPatchBackendRuntime(resolved);
}
