# Security Policy

[English](SECURITY.md) | [Türkçe](SECURITY.tr.md)

## Supported versions

CopyPatch v3 is the supported release line. The v1 `@copypatch/server` package
is deprecated for new integrations and remains available while users migrate;
published versions are not unpublished.

| Version | Support |
| --- | --- |
| `2.x` | Current |
| `1.x` and earlier | Migration-only, no new feature work |

## Security model

CopyPatch v3 mounts in the host application at `/__copypatch/api/v2`. Mutating
requests require an exact same-origin `Origin` header. CopyPatch does not
support a separate API origin, CORS configuration, or proxy-based deployment.

The backend provides two authentication choices:

- Built-in passphrase sessions use Argon2id, secure HttpOnly same-site cookies,
  short-lived CSRF tokens, and persistent rate-limit state.
- A host-auth adapter identifies the host application's user and must verify
  mutations with the host application's CSRF or request-integrity control.

All content is normalized as plain text. Storage adapters persist token hashes,
not raw session or rate-limit identifiers. Role checks separate `editor` and
`publisher` actions. See [the threat model](docs/threat-model.md) for the
supported threat boundaries and deployment responsibilities. The
[security architecture guide](https://copypatch.vercel.app/docs/security) and
[HTTP API reference](https://copypatch.vercel.app/docs/http-api) cover the
operational details.

## Reporting a vulnerability

Please report vulnerabilities privately instead of opening a public issue.

- Open a draft [GitHub security advisory](https://github.com/woffluon/CopyPatch/security/advisories/new).
- Contact the maintainer through GitHub if the advisory form is unsuitable.

Include the affected package, version, a minimal reproduction, impact, and any
suggested mitigation. We aim to acknowledge reports within two business days
and coordinate disclosure after a fix is available.
