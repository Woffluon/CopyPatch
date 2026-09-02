/**
 * CopyPatch Core Contract & Types
 */

export type PublishingMode = 'direct' | 'draft';

export interface ContentSnapshot {
  readonly revision: number;
  readonly content: Readonly<Record<string, string>>;
}

export interface EditorSnapshot {
  locale: string;
  publishedRevision: number;
  draftRevision: number;
  publishingMode: PublishingMode;
  published: Record<string, string>;
  drafts: Record<string, string>;
}

export interface ContentChange {
  key: string;
  text: string;
}

export interface SaveChangesRequest {
  expectedPublishedRevision: number;
  expectedDraftRevision: number;
  changes: ContentChange[];
}

export interface SaveChangesResponse {
  success: true;
  publishedRevision: number;
  draftRevision: number;
  message?: string | undefined;
}

export interface PublishRequest {
  expectedPublishedRevision: number;
  expectedDraftRevision: number;
}

export interface PublishResponse {
  success: true;
  publishedRevision: number;
  draftRevision: number;
  promotedCount: number;
}

export interface SessionAuthResponse {
  authenticated: boolean;
  csrfToken?: string | undefined;
  requiresCsrf?: boolean | undefined;
  publishingMode?: PublishingMode | undefined;
  roles?: readonly CopyPatchRole[] | undefined;
}

export type CopyPatchRole = 'editor' | 'publisher';

export interface CopyPatchPrincipal {
  subject: string;
  roles: readonly CopyPatchRole[];
}

export interface CopyPatchHandleContext<THostAuth = unknown> {
  hostAuth?: THostAuth;
  clientAddress?: string;
  signal?: AbortSignal;
}

export interface CopyPatchRequestHandler<THostAuth = unknown> {
  handle(request: Request, context?: CopyPatchHandleContext<THostAuth>): Promise<Response>;
}

export interface PublishedSnapshotReader {
  readPublished(locale: string): Promise<ContentSnapshot>;
}

export interface CopyPatchAuthAdapter<THostAuth = unknown> {
  authenticate(
    request: Request,
    context: Readonly<CopyPatchHandleContext<THostAuth>>,
  ): Promise<CopyPatchPrincipal | null>;
  verifyMutation(
    request: Request,
    principal: Readonly<CopyPatchPrincipal>,
    context: Readonly<CopyPatchHandleContext<THostAuth>>,
  ): Promise<boolean>;
}

export interface PersistenceHealth {
  ok: boolean;
  message?: string;
}

export interface SaveDraftsCommand extends SaveChangesRequest {
  locale: string;
}

export interface PublishDraftsCommand extends PublishRequest {
  locale: string;
}

export interface DiscardDraftsCommand extends PublishRequest {
  locale: string;
}

export interface SaveDraftsResult {
  publishedRevision: number;
  draftRevision: number;
}

export interface PublishDraftsResult extends SaveDraftsResult {
  promotedCount: number;
}

export interface DiscardDraftsResult extends SaveDraftsResult {
  discardedCount: number;
}

export type PersistenceMutationResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'conflict'; latest: EditorSnapshot };

export interface StoredSession extends CopyPatchPrincipal {
  tokenHash: string;
  csrfTokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
}

export interface SessionTouch {
  lastSeenAt: number;
  idleExpiresAt: number;
  csrfTokenHash?: string;
}

export interface RateLimitInput {
  keyHash: string;
  limit: number;
  windowMs: number;
  now: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Every mutation is one atomic compare-and-swap operation. Implementations must
 * compare every expected revision and either commit the complete operation or
 * return a conflict without writing any part of it.
 */
export interface CopyPatchPersistence {
  migrate(): Promise<void>;
  health(): Promise<PersistenceHealth>;
  readPublished(locale: string): Promise<ContentSnapshot>;
  readEditor(locale: string): Promise<EditorSnapshot>;
  saveDrafts(command: SaveDraftsCommand): Promise<PersistenceMutationResult<SaveDraftsResult>>;
  publishDrafts(command: PublishDraftsCommand): Promise<PersistenceMutationResult<PublishDraftsResult>>;
  discardDrafts(command: DiscardDraftsCommand): Promise<PersistenceMutationResult<DiscardDraftsResult>>;
  createSession(session: StoredSession): Promise<void>;
  readSession(tokenHash: string): Promise<StoredSession | null>;
  touchSession(tokenHash: string, update: SessionTouch): Promise<StoredSession | null>;
  deleteSession(tokenHash: string): Promise<void>;
  consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision>;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'CSRF_FAILED'
  | 'ORIGIN_REJECTED'
  | 'RATE_LIMITED'
  | 'CLIENT_ADDRESS_UNAVAILABLE'
  | 'REVISION_CONFLICT'
  | 'UNSUPPORTED_OPERATION'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND';

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown> | undefined;
  };
}

export interface RevisionConflictResponse extends ApiErrorResponse {
  error: {
    code: 'REVISION_CONFLICT';
    message: string;
    details?: Record<string, unknown> | undefined;
  };
  latest: EditorSnapshot;
}

export const CONTENT_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const LOCALE_REGEX = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i;

export const DEFAULT_MAX_TEXT_LENGTH = 10_000;
export const HARD_MAX_TEXT_LENGTH = 100_000;

export const CSRF_HEADER_NAME = 'x-copypatch-csrf';
export const API_BASE_PATH = '/__copypatch/api/v2';

export class RevisionConflictError extends Error {
  readonly code = 'REVISION_CONFLICT' as const;

  constructor(message: string, readonly latest?: EditorSnapshot) {
    super(message);
    this.name = 'RevisionConflictError';
  }
}

export function isValidContentKey(key: string | undefined | null): boolean {
  if (typeof key !== 'string') return false;
  if (key.length < 1 || key.length > 160) return false;
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') return false;
  return CONTENT_KEY_REGEX.test(key);
}

export function isValidLocale(locale: string | undefined | null): boolean {
  if (typeof locale !== 'string') return false;
  if (locale.length < 2 || locale.length > 35) return false;
  return LOCALE_REGEX.test(locale);
}

export function normalizeText(text: string, allowLineBreaks = false): string {
  if (typeof text !== 'string') return '';
  // Strip control characters except newline and tab
  let normalized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  if (!allowLineBreaks) {
    normalized = normalized.replace(/[\r\n]+/g, ' ');
  } else {
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  return normalized;
}
