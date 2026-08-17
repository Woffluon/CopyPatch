import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import fs from 'node:fs';
import path from 'node:path';

export interface DatabaseConnection {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

export function initDatabase(dbPath: string): DatabaseConnection {
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const sqlite = new Database(resolvedPath);
  if (fs.existsSync(resolvedPath)) {
    try {
      fs.chmodSync(resolvedPath, 0o600);
    } catch {
      // Ignore chmod failure on non-posix systems
    }
  }

  // Production pragmas
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');

  // Run embedded schema creation / migrations
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS content_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      locale TEXT NOT NULL,
      published_text TEXT,
      draft_text TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS key_locale_idx ON content_entries (key, locale);

    CREATE TABLE IF NOT EXISTS content_state (
      locale TEXT PRIMARY KEY,
      published_revision INTEGER NOT NULL DEFAULT 1,
      draft_revision INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_credentials (
      id INTEGER PRIMARY KEY DEFAULT 1,
      password_hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      csrf_token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      idle_expires_at INTEGER NOT NULL,
      absolute_expires_at INTEGER NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });

  return { sqlite, db };
}
