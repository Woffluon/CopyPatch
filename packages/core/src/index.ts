/**
 * CopyPatch Core Contract & Types
 */

export type PublishingMode = 'direct' | 'draft';

export interface ContentSnapshot {
  revision: number;
  content: Record<string, string>;
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
  publishingMode?: PublishingMode | undefined;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'CSRF_FAILED'
  | 'ORIGIN_REJECTED'
  | 'RATE_LIMITED'
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

export const CONTENT_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const LOCALE_REGEX = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i;

export const DEFAULT_MAX_TEXT_LENGTH = 10_000;
export const HARD_MAX_TEXT_LENGTH = 100_000;

export const CSRF_HEADER_NAME = 'x-copypatch-csrf';
export const API_BASE_PATH = '/__copypatch/api/v1';

export function isValidContentKey(key: string | undefined | null): boolean {
  if (typeof key !== 'string') return false;
  if (key.length < 1 || key.length > 160) return false;
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
