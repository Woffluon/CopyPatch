# CopyPatch Threat Model & Security Posture

## 1. Assets to Protect

- Public website visual integrity, typography, and React component tree.
- Content modification authorization and session state.
- Single-file SQLite database integrity and audit history.
- Visitor privacy (CopyPatch collects zero visitor tracking data or cookies).

## 2. Threat Analysis & Mitigations

| Threat | Severity | Mitigation Strategy | Residual Risk |
| :--- | :--- | :--- | :--- |
| **Passphrase Brute-Force** | High | Sliding-window IP rate limiting on `/session` + Argon2id memory hardness (19 MiB RAM, t=2). | Distributed botnets could attempt low-frequency attacks against weak passwords. Maintainers must use passphrases >= 16 chars. |
| **Cross-Site Request Forgery (CSRF)** | High | `SameSite=Strict` cookies + custom memory-held `x-copypatch-csrf` header validated on all state mutations. | None. Cross-origin scripts cannot set custom headers or inspect memory. |
| **Cross-Site Scripting (Stored XSS)** | Critical | Strict plain-text invariant. React string interpolation and DOM `textContent` only. Zero `dangerouslySetInnerHTML`. | None. HTML tags are treated as inert strings. |
| **SQL Injection** | Critical | Parameterized SQL queries via Drizzle ORM + `better-sqlite3`. Strict regex validation for content keys and locales. | None. |
| **Cross-Origin Mutation** | High | Strict server-side `Origin` and `Referer` validation against explicitly configured `publicOrigins` allowlist. | None. |
| **Session Hijacking** | High | 256-bit cryptographically secure random session tokens, hashed in DB with SHA-256, stored in `HttpOnly` + `Secure` + `__Host-` cookies with idle and absolute expiration. | Local machine compromise where attacker has full browser profile / disk access. |
