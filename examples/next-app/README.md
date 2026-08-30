# Next.js App Router fixture

[English](README.md) | [Türkçe](README.tr.md)

This fixture embeds `@copypatch/backend` in the same Next Node deployment. The
catch-all route owns `/__copypatch/api/v2/*`; no proxy or external CopyPatch
server is required.

Set `COPYPATCH_PASSPHRASE_HASH` and, optionally, `COPYPATCH_SQLITE_PATH` before
using the editor. The page reads its initial published snapshot directly from
the colocated backend. Without the hash, it renders fallback copy but the API
route remains disabled rather than enabling a development secret.
