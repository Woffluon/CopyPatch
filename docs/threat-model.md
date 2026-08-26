# CopyPatch v2 threat model and security status

[English](threat-model.md) | [Türkçe](threat-model.tr.md)

This document records the current security boundary and material design
decisions. Update it when authentication, persistence, API behavior, or a
threat boundary changes.

## Scope

CopyPatch v2 is embedded in a host application at
`/__copypatch/api/v2`. The host owns transport, TLS, deployment, and access to
the route. CopyPatch does not support a remote API, separate server, CORS
allowlist, or proxy configuration.

## Assets

- Published and draft copy, separated by locale and revision.
- Editor and publisher authorization.
- Session, CSRF, and rate-limit secrets.
- SQLite database files or PostgreSQL records.

## Controls

| Risk | Control |
| --- | --- |
| Stored markup injection | CopyPatch accepts and renders normalized plain text. |
| Cross-site mutation | Every unsafe request must have an exact same-origin `Origin` header. Built-in auth also requires a CSRF header. |
| Unauthorized editing | Built-in passphrase sessions or a host-auth adapter identify the principal; mutations require `editor` or `publisher` roles. |
| Brute-force attempts | Built-in authentication uses Argon2id and persistent rate limiting. |
| Session disclosure at rest | Persistence receives hashes for session, CSRF, and rate-limit identifiers. |
| Concurrent overwrites | Draft and publish operations compare expected published and draft revisions and return `409 REVISION_CONFLICT` on mismatch. |
| Storage failure | Published reads fail safely to the most recent in-memory snapshot or empty fallback. |

## Authentication choices

`createCopyPatchBackend` accepts exactly one authentication strategy:

- Provide `passphraseHash` for CopyPatch-managed authentication. Deploy it only
  over HTTPS because its cookie is secure and same-site.
- Provide `authAdapter` when the host already authenticates users. The adapter
  must return a principal with roles and verify each mutating request.

Host-auth adapters are responsible for integrating the host's CSRF protection,
session lifecycle, authorization source, and trusted client address. Do not
pass raw tokens to persistence implementations.

## Deployment responsibilities

- Keep the API route under the same HTTPS origin as the application.
- Restrict database credentials and back up SQLite/PostgreSQL according to the
  host's recovery policy.
- Run storage migrations before serving traffic.
- Mount Node middleware before body parsers when the selected adapter requires
  the raw request body.
- Do not expose a static-only deployment as an editable CopyPatch instance.

## Status and history

v2 replaces the v1 standalone server model with embedded, same-origin adapters.
`@copypatch/server` is deprecated for new integrations and is scheduled for
retirement in a later major release. Existing published releases stay
available; CopyPatch will not unpublish them.

The intentionally removed npm-publishing and npm-readiness-audit documents are
part of the documentation delete zone. Their deletion is not a gap to refill.
