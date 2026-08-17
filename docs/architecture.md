# CopyPatch System Architecture

CopyPatch is a lightweight, self-hosted inline copy editing architecture for React and Next.js applications.

---

## 1. High-Level Architecture

```text
+===================================================================================+
|                              REACT / NEXT.JS HOST APP                             |
+===================================================================================+
|                                                                                   |
|  [ PUBLIC VISITOR RUNTIME ]                                                       |
|  - Bundle overhead: < 1 kB gzip (0.2 kB core runtime)                             |
|  - Pre-rendered Server Component snapshots -> 0ms React hydration drift           |
|  - Pure text interpolation -> 0% Stored XSS surface -> Zero DB queries            |
|                                                                                   |
|  [ LAZY-LOADED EDIT RUNTIME: ?copypatch=1 ]                                       |
|  - Dynamically fetched (~12 kB gzip) only upon explicit query flag                |
|  - Argon2id Password Modal & Session Token Verification                           |
|  - Native contenteditable="plaintext-only" Caret Preserving Surface               |
|  - Floating Toolbar: Save (Cmd+S), Draft Staging, Discard, Locale Selector        |
|  - Optimistic Concurrency Tracking (expectedPublishedRevision)                   |
+===================================================================================+
                                         |
                       HTTP API (Hono)   |   /__copypatch/api/v1
                                         v
+===================================================================================+
|                               HONO HTTP SERVER                                    |
+===================================================================================+
|  - In-Memory Snapshot Cache   -> Sub-0.2ms responses for public visitors          |
|  - Strict Origin / Referer    -> Matched against configured publicOrigins         |
|  - Dual-Token CSRF Engine     -> HttpOnly Cookie + 'x-copypatch-csrf' memory token|
|  - Sliding-Window Rate Limiter-> 10 requests / minute on /session endpoint        |
|  - Concurrency Gatekeeper     -> Rejects stale mutations with 409 Conflict        |
+===================================================================================+
                                         |
                       Drizzle + WAL     |   Atomic Disk Persistence
                                         v
+===================================================================================+
|                          SINGLE-FILE SQLITE PERSISTENCE                           |
|  - PRAGMA journal_mode = WAL  - PRAGMA synchronous = NORMAL                       |
|  - PRAGMA busy_timeout = 5000 - PRAGMA cache_size = -64000 (64MB)                 |
|  - Tables: auth_credentials, sessions, content_state, content_entries             |
+===================================================================================+
```

---

## 2. Execution Sequences

### Public Visitor Request Flow (Sub-0.2ms)
```text
Browser / CDN                  CopyPatch Host App                   Server Memory Cache
      |                                |                                     |
      |--- 1. HTTP GET / ------------- |                                     |
      |                                |--- 2. Read In-Memory Snapshot ----->|
      |                                |<-- 3. Return JSON Snapshot (0.1ms) -|
      |                                |                                     |
      |<-- 4. HTML with SSR Copy ------|                                     |
      |                                |                                     |
      |=== 5. Zero DB queries, zero client fetch, 0ms hydration drift ======|
```

### Authorized Editor Flow (`?copypatch=1`)
```text
Editor Browser                      Auth / Middleware                   SQLite WAL
      |                                     |                                |
      |--- 1. Open ?copypatch=1 ----------->|                                |
      |--- 2. POST /session (Passphrase) -->|                                |
      |                                     |--- 3. Verify Argon2id Hash --->|
      |<-- 4. Set-Cookie (__Host-Session) --|                                |
      |       + Return CSRF Token In Memory |                                |
      |                                     |                                |
      |--- 5. Edit text inline (Cmd+S) ---->|                                |
      |       Header: x-copypatch-csrf      |--- 6. Verify Revision Match -->|
      |       Body: expectedRevision: 4     |--- 7. Write WAL Transaction -->|
      |<-- 8. 200 OK (New Revision: 5) -----|<-- 8. Atomic Cache Swap -------|
```

---

## 3. Database Schema & Pragmas

CopyPatch initializes SQLite via `better-sqlite3` with high-concurrency pragmas:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -64000; -- 64MB memory allocation
```

### Table Definitions

| Table | Primary Key | Key Columns | Purpose |
| :--- | :--- | :--- | :--- |
| `auth_credentials` | `id` (default 1) | `password_hash`, `updated_at` | Stores Argon2id hash & salt. Exactly 1 row. |
| `sessions` | `token_hash` (SHA-256) | `csrf_token_hash`, `idle_expires_at`, `absolute_expires_at` | Ephemeral session tokens with idle timeout. |
| `content_state` | `locale` | `published_revision`, `draft_revision`, `updated_at` | Tracks independent revision counters per language. |
| `content_entries` | `id` (Auto-inc) | `key`, `locale`, `published_text`, `draft_text`, `updated_at` | Holds actual plain-text copy strings keyed by `(key, locale)`. |

---

## 4. Failure Modes & Recovery Strategies

| Failure Scenario | System Response | Recovery Mechanism |
| :--- | :--- | :--- |
| **Concurrent Edit Collision** | Server returns `409 Conflict (REVISION_CONFLICT)` | Client UI prompts editor to fetch latest snapshot, diff changes, and save safely without overwriting. |
| **Backend Unreachable / Network Offline** | Provider falls back to hardcoded default text in JSX | Zero blank screens or fatal errors for visitors. Editor displays offline retry toast. |
| **Power Loss / Node Crash** | SQLite WAL file automatically recovers on next startup | Uncommitted transactions roll back cleanly; committed transactions persist safely. |
| **Database File Lock Contention** | `PRAGMA busy_timeout = 5000` retries lock up to 5 seconds | Concurrent write requests queue gracefully without throwing immediate `SQLITE_BUSY` errors. |
