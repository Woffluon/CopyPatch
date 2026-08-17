import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const contentEntries = sqliteTable(
  'content_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    locale: text('locale').notNull(),
    publishedText: text('published_text'), // null means no override
    draftText: text('draft_text'), // null means no draft override
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('key_locale_idx').on(table.key, table.locale)
  ]
);

export const contentState = sqliteTable('content_state', {
  locale: text('locale').primaryKey(),
  publishedRevision: integer('published_revision').notNull().default(1),
  draftRevision: integer('draft_revision').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const authCredentials = sqliteTable('auth_credentials', {
  id: integer('id').primaryKey().default(1),
  passwordHash: text('password_hash').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
  idleExpiresAt: integer('idle_expires_at', { mode: 'timestamp' }).notNull(),
  absoluteExpiresAt: integer('absolute_expires_at', { mode: 'timestamp' }).notNull(),
});
