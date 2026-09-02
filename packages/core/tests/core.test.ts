import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import {
  API_BASE_PATH,
  isValidContentKey,
  isValidLocale,
  normalizeText,
  RevisionConflictError,
  type CopyPatchAuthAdapter,
  type CopyPatchRequestHandler,
  type CopyPatchPersistence,
  type PublishedSnapshotReader,
} from '../src/index.js';

const persistenceContract = (persistence: CopyPatchPersistence): CopyPatchPersistence => persistence;
const authContract = (adapter: CopyPatchAuthAdapter): CopyPatchAuthAdapter => adapter;
const requestHandlerContract = (handler: CopyPatchRequestHandler): CopyPatchRequestHandler => handler;
const snapshotReaderContract = (reader: PublishedSnapshotReader): PublishedSnapshotReader => reader;

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type VerifyMutationReturnsBoolean = Expect<Equal<
  ReturnType<CopyPatchAuthAdapter['verifyMutation']>,
  Promise<boolean>
>>;

const verifyMutationReturnsBoolean: VerifyMutationReturnsBoolean = true;

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

describe('Core Validation & Formatting', () => {
  it('exposes the v2 API base path', () => {
    expect(API_BASE_PATH).toBe('/__copypatch/api/v2');
  });

  it('exports storage-independent async backend contracts', () => {
    expect(typeof persistenceContract).toBe('function');
    expect(typeof authContract).toBe('function');
    expect(typeof requestHandlerContract).toBe('function');
    expect(typeof snapshotReaderContract).toBe('function');
    expect(verifyMutationReturnsBoolean).toBe(true);
    expect(new RevisionConflictError('conflict').code).toBe('REVISION_CONFLICT');
  });

  it('declares public content snapshots as deeply readonly', async () => {
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

    expect(source).toMatch(/interface ContentSnapshot[\s\S]*readonly revision: number;/);
    expect(source).toMatch(/interface ContentSnapshot[\s\S]*readonly content: Readonly<Record<string, string>>;/);
  });

  it('publishes ESM metadata without a redundant module field', async () => {
    const packageJson = parseJsonObject(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(packageJson.module).toBeUndefined();
    expect(packageJson.sideEffects).toBe(false);
  });
  it('validates content keys correctly', () => {
    expect(isValidContentKey('home.hero.title')).toBe(true);
    expect(isValidContentKey('features.card_1:subtitle')).toBe(true);
    expect(isValidContentKey('btn-cta-2026')).toBe(true);

    expect(isValidContentKey('')).toBe(false);
    expect(isValidContentKey('   ')).toBe(false);
    expect(isValidContentKey('home/hero/title')).toBe(false); // No slashes/traversal
    expect(isValidContentKey('../secret')).toBe(false);
    expect(isValidContentKey('__proto__')).toBe(false);
    expect(isValidContentKey('constructor')).toBe(false);
    expect(isValidContentKey('SELECT * FROM users')).toBe(false);
    expect(isValidContentKey('a'.repeat(161))).toBe(false);
  });

  it('validates locales robustly', () => {
    expect(isValidLocale('en')).toBe(true);
    expect(isValidLocale('tr')).toBe(true);
    expect(isValidLocale('en-US')).toBe(true);
    expect(isValidLocale('zh-Hans-CN')).toBe(true);

    expect(isValidLocale('')).toBe(false);
    expect(isValidLocale('e')).toBe(false);
    expect(isValidLocale('invalid_locale_with_underscores')).toBe(false);
    expect(isValidLocale('../../etc/passwd')).toBe(false);
  });

  it('normalizes single-line and multiline plain text safely', () => {
    // Single line mode replaces newlines with space and strips control characters
    const dirty = 'Hello\nWorld\r\nTest\x00\x1B';
    expect(normalizeText(dirty, false)).toBe('Hello World Test');

    // Multiline mode preserves normalized newlines
    expect(normalizeText('Line 1\r\nLine 2\rLine 3', true)).toBe('Line 1\nLine 2\nLine 3');
  });
});
