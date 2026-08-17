import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, isNotNull } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import {
  ContentSnapshot,
  EditorSnapshot,
  PublishingMode,
  ContentChange,
  isValidContentKey,
  isValidLocale,
  normalizeText
} from '@copypatch/core';
import { SnapshotCache } from './snapshot-cache.js';

export class ContentService {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private snapshotCache: SnapshotCache,
    private publishingMode: PublishingMode,
    private maxTextLength = 10_000
  ) {}

  /**
   * Warm up the in-memory cache for all locales at startup
   */
  warmCache(): void {
    const states = this.db.select().from(schema.contentState).all();
    for (const state of states) {
      this.rebuildSnapshot(state.locale);
    }
  }

  /**
   * Get the public published snapshot for a locale.
   * Resolves from memory cache, falls back to rebuilding from DB.
   */
  getPublishedSnapshot(locale: string): ContentSnapshot {
    if (!isValidLocale(locale)) {
      return { revision: 1, content: {} };
    }

    const cached = this.snapshotCache.get(locale);
    if (cached) return cached;

    return this.rebuildSnapshot(locale);
  }

  /**
   * Rebuilds the snapshot from SQLite and updates memory cache atomically.
   */
  rebuildSnapshot(locale: string): ContentSnapshot {
    const state = this.ensureContentState(locale);

    // Select all entries where publishedText IS NOT NULL
    const entries = this.db
      .select({
        key: schema.contentEntries.key,
        publishedText: schema.contentEntries.publishedText,
      })
      .from(schema.contentEntries)
      .where(
        and(
          eq(schema.contentEntries.locale, locale),
          isNotNull(schema.contentEntries.publishedText)
        )
      )
      .all();

    const contentMap: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.publishedText !== null) {
        contentMap[entry.key] = entry.publishedText;
      }
    }

    const snapshot: ContentSnapshot = {
      revision: state.publishedRevision,
      content: contentMap,
    };

    this.snapshotCache.set(locale, snapshot);
    return snapshot;
  }

  /**
   * Get full editor snapshot (published + drafts + revisions)
   */
  getEditorSnapshot(locale: string): EditorSnapshot {
    const state = this.ensureContentState(locale);

    const entries = this.db
      .select()
      .from(schema.contentEntries)
      .where(eq(schema.contentEntries.locale, locale))
      .all();

    const published: Record<string, string> = {};
    const drafts: Record<string, string> = {};

    for (const entry of entries) {
      if (entry.publishedText !== null) {
        published[entry.key] = entry.publishedText;
      }
      if (entry.draftText !== null) {
        drafts[entry.key] = entry.draftText;
      }
    }

    return {
      locale,
      publishedRevision: state.publishedRevision,
      draftRevision: state.draftRevision,
      publishingMode: this.publishingMode,
      published,
      drafts,
    };
  }

  /**
   * Save changes (either directly published or as draft, depending on mode)
   */
  saveChanges(
    locale: string,
    expectedPublishedRevision: number,
    expectedDraftRevision: number,
    changes: ContentChange[]
  ): { publishedRevision: number; draftRevision: number } {
    const now = new Date();

    // Validate inputs
    for (const change of changes) {
      if (!isValidContentKey(change.key)) {
        throw new Error(`Invalid content key: ${change.key}`);
      }
      if (typeof change.text !== 'string' || change.text.length > this.maxTextLength) {
        throw new Error(`Text exceeds maximum allowed length of ${this.maxTextLength}`);
      }
    }

    // Execute in transaction
    return this.db.transaction((tx) => {
      const state = tx
        .select()
        .from(schema.contentState)
        .where(eq(schema.contentState.locale, locale))
        .get();

      const currentPubRev = state?.publishedRevision ?? 1;
      const currentDraftRev = state?.draftRevision ?? 1;

      if (this.publishingMode === 'direct') {
        if (expectedPublishedRevision !== currentPubRev) {
          throw new RevisionConflictError(
            `Published revision conflict: expected ${expectedPublishedRevision}, got ${currentPubRev}`
          );
        }

        const nextPubRev = currentPubRev + 1;

        // Upsert changes into publishedText
        for (const change of changes) {
          const cleanText = normalizeText(change.text, true);
          const existing = tx
            .select()
            .from(schema.contentEntries)
            .where(
              and(
                eq(schema.contentEntries.key, change.key),
                eq(schema.contentEntries.locale, locale)
              )
            )
            .get();

          if (existing) {
            tx.update(schema.contentEntries)
              .set({
                publishedText: cleanText,
                updatedAt: now,
              })
              .where(eq(schema.contentEntries.id, existing.id))
              .run();
          } else {
            tx.insert(schema.contentEntries)
              .values({
                key: change.key,
                locale,
                publishedText: cleanText,
                draftText: null,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          }
        }

        // Update content state
        if (state) {
          tx.update(schema.contentState)
            .set({
              publishedRevision: nextPubRev,
              updatedAt: now,
            })
            .where(eq(schema.contentState.locale, locale))
            .run();
        } else {
          tx.insert(schema.contentState)
            .values({
              locale,
              publishedRevision: nextPubRev,
              draftRevision: 1,
              updatedAt: now,
            })
            .run();
        }

        return { publishedRevision: nextPubRev, draftRevision: currentDraftRev };
      } else {
        // Draft mode
        if (expectedDraftRevision !== currentDraftRev) {
          throw new RevisionConflictError(
            `Draft revision conflict: expected ${expectedDraftRevision}, got ${currentDraftRev}`
          );
        }

        const nextDraftRev = currentDraftRev + 1;

        // Upsert changes into draftText
        for (const change of changes) {
          const cleanText = normalizeText(change.text, true);
          const existing = tx
            .select()
            .from(schema.contentEntries)
            .where(
              and(
                eq(schema.contentEntries.key, change.key),
                eq(schema.contentEntries.locale, locale)
              )
            )
            .get();

          if (existing) {
            tx.update(schema.contentEntries)
              .set({
                draftText: cleanText,
                updatedAt: now,
              })
              .where(eq(schema.contentEntries.id, existing.id))
              .run();
          } else {
            tx.insert(schema.contentEntries)
              .values({
                key: change.key,
                locale,
                publishedText: null,
                draftText: cleanText,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          }
        }

        if (state) {
          tx.update(schema.contentState)
            .set({
              draftRevision: nextDraftRev,
              updatedAt: now,
            })
            .where(eq(schema.contentState.locale, locale))
            .run();
        } else {
          tx.insert(schema.contentState)
            .values({
              locale,
              publishedRevision: 1,
              draftRevision: nextDraftRev,
              updatedAt: now,
            })
            .run();
        }

        return { publishedRevision: currentPubRev, draftRevision: nextDraftRev };
      }
    });
  }

  /**
   * Promote drafts to published in draft mode
   */
  publishDrafts(
    locale: string,
    expectedDraftRevision: number
  ): { publishedRevision: number; draftRevision: number; promotedCount: number } {
    if (this.publishingMode !== 'draft') {
      throw new Error('publishDrafts is only supported in draft publishingMode');
    }

    const now = new Date();

    return this.db.transaction((tx) => {
      const state = tx
        .select()
        .from(schema.contentState)
        .where(eq(schema.contentState.locale, locale))
        .get();

      const currentPubRev = state?.publishedRevision ?? 1;
      const currentDraftRev = state?.draftRevision ?? 1;

      if (expectedDraftRevision !== currentDraftRev) {
        throw new RevisionConflictError(
          `Draft revision conflict: expected ${expectedDraftRevision}, got ${currentDraftRev}`
        );
      }

      // Find all entries with active draftText
      const draftEntries = tx
        .select()
        .from(schema.contentEntries)
        .where(
          and(
            eq(schema.contentEntries.locale, locale),
            isNotNull(schema.contentEntries.draftText)
          )
        )
        .all();

      let promotedCount = 0;
      for (const entry of draftEntries) {
        tx.update(schema.contentEntries)
          .set({
            publishedText: entry.draftText,
            draftText: null,
            updatedAt: now,
          })
          .where(eq(schema.contentEntries.id, entry.id))
          .run();
        promotedCount++;
      }

      const nextPubRev = currentPubRev + 1;
      const nextDraftRev = currentDraftRev + 1;

      if (state) {
        tx.update(schema.contentState)
          .set({
            publishedRevision: nextPubRev,
            draftRevision: nextDraftRev,
            updatedAt: now,
          })
          .where(eq(schema.contentState.locale, locale))
          .run();
      } else {
        tx.insert(schema.contentState)
          .values({
            locale,
            publishedRevision: nextPubRev,
            draftRevision: nextDraftRev,
            updatedAt: now,
          })
          .run();
      }

      return {
        publishedRevision: nextPubRev,
        draftRevision: nextDraftRev,
        promotedCount,
      };
    });
  }

  /**
   * Discard all drafts for a locale
   */
  discardDrafts(locale: string): { draftRevision: number } {
    const now = new Date();
    return this.db.transaction((tx) => {
      const state = tx
        .select()
        .from(schema.contentState)
        .where(eq(schema.contentState.locale, locale))
        .get();

      const nextDraftRev = (state?.draftRevision ?? 1) + 1;

      tx.update(schema.contentEntries)
        .set({
          draftText: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.contentEntries.locale, locale),
            isNotNull(schema.contentEntries.draftText)
          )
        )
        .run();

      if (state) {
        tx.update(schema.contentState)
          .set({
            draftRevision: nextDraftRev,
            updatedAt: now,
          })
          .where(eq(schema.contentState.locale, locale))
          .run();
      }

      return { draftRevision: nextDraftRev };
    });
  }

  private ensureContentState(locale: string) {
    let state = this.db
      .select()
      .from(schema.contentState)
      .where(eq(schema.contentState.locale, locale))
      .get();

    if (!state) {
      const now = new Date();
      this.db
        .insert(schema.contentState)
        .values({
          locale,
          publishedRevision: 1,
          draftRevision: 1,
          updatedAt: now,
        })
        .run();

      state = {
        locale,
        publishedRevision: 1,
        draftRevision: 1,
        updatedAt: now,
      };
    }
    return state;
  }
}

export class RevisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevisionConflictError';
  }
}
