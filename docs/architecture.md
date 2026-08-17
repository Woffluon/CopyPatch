# CopyPatch System Architecture

CopyPatch is a lightweight, open-source inline copy editing system for React and Next.js applications.

## High-Level Architecture

```text
+-------------------------------------------------------------------------------+
| Host React / Next.js Application                                              |
|                                                                               |
|   +-- Public Visitor Runtime (< 1 kB gzip, 0.2 kB core)                      |
|   |     - In-Memory Published Locale Snapshot                                 |
|   |     - Zero database queries on public page loads                          |
|   |                                                                           |
|   +-- Lazy Editor Runtime (Loaded only when ?copypatch=1 is present)          |
|         - Argon2id Auth Modal & Session Verification                          |
|         - Native contenteditable="plaintext-only" Caret Preserving Surface    |
|         - Floating Double-Bezel Toolbar                                       |
|         - Optimistic Concurrency Control (expectedPublishedRevision)          |
|         - Mutation Submissions (PUT /patches, POST /publish)                  |
+-------------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------------+
| Hono API Server (Standalone Binary or Embedded Express/Hono Router)           |
|                                                                               |
|   - In-Memory Snapshot Cache (Sub-0.2ms Visitor Responses, Atomic Rebuild)    |
|   - Strict Origin & Referer Validation against publicOrigins                  |
|   - Dual-Token CSRF Validation (Session Cookie + x-copypatch-csrf Header)     |
|   - Sliding-Window IP Rate Limiter                                            |
+-------------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------------+
| SQLite Database (better-sqlite3 + Drizzle ORM + WAL Mode)                     |
|                                                                               |
|   - auth_credentials: Argon2id Passphrase Hash & 256-bit Salt                 |
|   - sessions: SHA-256 Hashed Session Tokens & Expiry                          |
|   - locales: Active Locales, Published Revision, Draft Revision               |
|   - patches: Content Keys, Published Text, Draft Text, Timestamps             |
|   - revisions: Immutable Audit Log for Rollbacks                              |
+-------------------------------------------------------------------------------+
```

## Core Invariants

1. **Strict Plain Text**: CopyPatch stores only plain strings. HTML tags, JSX, markdown, and script injections are strictly rejected and sanitized on both client and server.
2. **Zero Hydration Mismatch**: `@copypatch/next` pre-renders published snapshots on the server via React Server Components (RSC) to ensure instant SEO indexing and 0ms hydration drift.
3. **Sub-0.2ms Reads**: Public visitor endpoints read directly from the in-memory immutable snapshot map without executing SQLite disk I/O queries.
4. **Optimistic Concurrency**: Revisions are tracked per locale (`publishedRevision`, `draftRevision`). Conflicting concurrent edits fail safely with HTTP `409 Conflict`.
5. **Deterministic Self-Hosting**: Operates on a single-file SQLite database with Write-Ahead Logging (WAL) and zero external database dependencies.
