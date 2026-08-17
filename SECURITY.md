# Security Policy

## Supported Versions

CopyPatch receives continuous security updates on the active major release branch.

| Version | Supported |
| :--- | :--- |
| `0.1.x` | Yes |
| `< 0.1.0` | No |

---

## Security Architecture & Design Invariants

CopyPatch is built with a defensive security posture specifically engineered to mitigate web content manipulation vulnerabilities:

1. **Strict Plain-Text Invariant**: All incoming content is validated with `normalizeText()`. HTML tags, scripts, and Markdown are rejected or stripped. CopyPatch strictly prevents Stored Cross-Site Scripting (XSS).
2. **Password Hashing**: Administrative credentials use Argon2id with memory-hard parameters (19 MiB RAM, 2 iterations, 1 parallelism lane).
3. **Session Hardening**: Sessions use 256-bit entropy cryptographic tokens stored hashed with SHA-256 in SQLite. Cookies use `HttpOnly`, `SameSite=Strict`, and `Secure` attributes, with `__Host-` prefix enforcement in production.
4. **Dual-Token CSRF**: State-mutating endpoints require both a valid session cookie and a synchronized in-memory `x-copypatch-csrf` header.
5. **Origin & Referer Isolation**: State-mutating requests strictly enforce `Origin` and `Referer` allowlist matching. Wildcard origins (`*`) are prohibited.

---

## Reporting a Vulnerability

If you discover a security vulnerability in CopyPatch, please report it responsibly rather than opening a public GitHub issue.

### Reporting Channels

- **GitHub Security Advisories**: Open a draft security advisory via [GitHub Security Advisories](https://github.com/woffluon/CopyPatch/security/advisories/new).
- **Maintainer Contact**: Send encrypted details to `security@copypatch.dev` or contact the maintainer directly on GitHub.

### What to Include in Your Report

- Detailed description of the vulnerability and its potential impact.
- Step-by-step reproduction steps or proof-of-concept (PoC) code.
- Target component (`@copypatch/core`, `@copypatch/react`, `@copypatch/next`, or `@copypatch/server`).
- Suggested remediation if known.

### Response Timeline

- **Initial Acknowledgment**: Within 24 hours.
- **Triage & Reproduction**: Within 48 hours.
- **Fix & Advisory Release**: Coordinated release with a patch version and public CVE/advisory credit.
