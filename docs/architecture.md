# CopyPatch System Architecture

CopyPatch is a lightweight, self-hosted inline copy editing architecture for React and Next.js applications.

---

## 1. High-Level Architecture

```mermaid
flowchart TD
    subgraph Host["React / Next.js Host Application"]
        direction TB
        subgraph VisitorPlane["Public Visitor Plane"]
            VP1["Visitor Browser (less than 1 kB gzip runtime)"]
            VP2["Pre-rendered SSR / RSC Snapshot (0ms drift)"]
            VP3["Pure String Interpolation (0% Stored XSS)"]
        end

        subgraph EditPlane["Authorized Edit Plane (?copypatch=1)"]
            EP1["Argon2id Passphrase Auth Modal"]
            EP2["Native Caret Editing (contenteditable=plaintext-only)"]
            EP3["Floating Toolbar (Save Cmd+S / Draft / Discard / Locale)"]
            EP4["In-Memory Store with Optimistic Concurrency"]
        end
    end

    subgraph Server["CopyPatch Standalone / Embedded Server (Hono)"]
        direction TB
        S1["In-Memory Snapshot Cache (Sub-0.2ms Visitor Reads)"]
        S2["Security Shield (Origin/Referer Allowlist + Rate Limiting)"]
        S3["Dual-Token CSRF Engine (HttpOnly Cookie + Header)"]
        S4["Optimistic Concurrency Gate (409 Conflict Rejection)"]
    end

    subgraph Database["Single-File SQLite Storage (WAL Mode)"]
        direction TB
        DB1[("SQLite Database: copypatch.sqlite")]
        DB2["PRAGMA journal_mode = WAL, PRAGMA synchronous = NORMAL"]
        DB3["Tables: auth_credentials, sessions, content_state, content_entries"]
    end

    VisitorPlane -->|"1. GET /__copypatch/api/v1/content/:locale"| S1
    EditPlane -->|"2. POST /session (Argon2id Auth)"| S2
    EditPlane -->|"3. PUT /patches (Dual-Token CSRF + Cmd+S)"| S3
    S3 --> S4
    S4 -->|"4. Atomic Transaction"| DB1
    DB1 -.->|"5. Write-Ahead Log"| DB2
    S4 -->|"6. Atomic Snapshot Swap"| S1
```

---

## 2. Execution Sequences

### Public Visitor Request Flow (Sub-0.2ms)

```mermaid
sequenceDiagram
    autonumber
    actor Visitor as Visitor Browser
    participant App as Host App (SSR / RSC)
    participant Cache as In-Memory Cache (0.2ms)

    Visitor->>App: HTTP GET /
    App->>Cache: Read Published Locale Snapshot
    Cache-->>App: Snapshot JSON (< 0.2ms)
    App-->>Visitor: HTML with Pre-Rendered Copy
    Note over Visitor,App: Zero hydration drift, zero disk I/O queries
```

### Authorized Editor Flow (`?copypatch=1`)

```mermaid
sequenceDiagram
    autonumber
    actor Editor as Editor Browser (?copypatch=1)
    participant Server as CopyPatch API (Hono)
    participant Cache as In-Memory Cache
    participant DB as SQLite WAL

    Editor->>Server: POST /session (Passphrase)
    Server->>DB: Verify Argon2id Password Hash
    DB-->>Server: Credentials Valid
    Server-->>Editor: Set-Cookie (__Host-Session) + Memory CSRF Token

    Note over Editor: Inline editing with plaintext caret preservation

    Editor->>Server: PUT /patches (x-copypatch-csrf header + Cmd+S)
    Server->>DB: Verify Revision Match & Execute WAL Transaction
    DB-->>Server: Transaction Committed
    Server->>Cache: Atomic In-Memory Snapshot Swap
    Server-->>Editor: 200 OK (New Published Revision)
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
