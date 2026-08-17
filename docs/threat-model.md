# CopyPatch Threat Model & Security Posture

This document provides a comprehensive security assessment of CopyPatch using the STRIDE methodology.

---

## 1. Assets to Protect

- **Visual and Structural Integrity**: Host application layout, typography, and React component tree.
- **Content Modification Authorization**: Administrative credentials and active session states.
- **Audit Trails and Revision History**: SQLite database persistence and historical revisions.
- **Visitor Privacy**: CopyPatch collects zero tracking cookies, analytics identifiers, or visitor telemetry.

---

## 2. STRIDE Threat Analysis Matrix

| STRIDE Category | Threat Description | Severity | CopyPatch Defense Strategy | Residual Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Unauthorized user attempts to authenticate as administrator. | High | Memory-hard Argon2id passphrase verification (19 MiB RAM) + IP rate limiting (10 req/min). | Weak administrative passphrases. Teams must use passphrases >= 16 characters. |
| **Tampering** | Attacker injects malicious HTML, script tags, or SQL payloads into copy. | Critical | Strict plain-text invariant (`normalizeText`), React text node interpolation, and parameterized SQL queries via Drizzle ORM. | None. Injected tags render as inert literal strings. |
| **Repudiation** | Editor denies making unauthorized changes to live copy. | Low | Every mutation updates revision counters and records timestamps in SQLite. | Single shared passphrase does not identify individual team members. |
| **Information Disclosure** | Database file leak exposes active session tokens or plain-text passwords. | High | Passwords hashed with Argon2id; session tokens hashed with SHA-256 before storage in SQLite. | Stolen database file exposes copy strings (which are already public). |
| **Denial of Service** | Flooding backend with concurrent writes or huge payloads. | Medium | 64 KB maximum string size validation + SQLite WAL busy timeout (5000ms) + In-memory visitor cache. | Volumetric DDoS targeting network bandwidth (mitigated by upstream Cloudflare/Nginx). |
| **Elevation of Privilege** | Cross-origin malicious website issues forged edit requests (CSRF). | High | Dual-Token CSRF (`HttpOnly` session cookie + in-memory `x-copypatch-csrf` header) + `Origin`/`Referer` validation. | None. Cross-origin scripts cannot read memory or set custom headers. |

---

## 3. Cryptographic Primitives & Parameters

### Argon2id Passphrase Hashing (RFC 9106)
- **Memory Cost ($m$):** 19 MiB (19,456 KiB)
- **Time Cost ($t$):** 2 iterations
- **Parallelism ($p$):** 1 lane
- **Salt Length:** 256 bits (32 bytes) cryptographically generated per credential record

### Session Token Security
- **Entropy:** 256 bits generated via `crypto.randomBytes(32)`
- **Database Storage:** SHA-256 hash digest
- **Transport Flags:** `HttpOnly`, `SameSite=Strict`, `Secure`, and `__Host-` prefix on production HTTPS

---

## 4. Production Security Checklist

- [ ] Run backend behind TLS/HTTPS to enforce `Secure` and `__Host-` cookie flags.
- [ ] Configure `--origin` to match only trusted domains (e.g. `--origin https://my-site.com`).
- [ ] Choose an administrative passphrase with at least 16 random characters.
- [ ] Set `PRAGMA busy_timeout = 5000` (automatically managed by `@copypatch/server`).
- [ ] Mount SQLite database directory with restricted OS permissions (`chmod 700 /data`).
