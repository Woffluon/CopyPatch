# Astro SSR + React fixture

[English](README.md) | [Türkçe](README.tr.md)

This is an Astro **SSR** fixture, not a static-site recipe. It mounts the
CopyPatch API at `/__copypatch/api/v2/*` and reads the initial React snapshot
from the local backend during SSR. Run it with a Node-compatible Astro adapter
and set `COPYPATCH_PASSPHRASE_HASH` (plus optional `COPYPATCH_SQLITE_PATH`).

Static-only Astro cannot host the authenticated CopyPatch API or direct server
snapshot read. Keep `output: 'server'`, `prerender = false` on the API route,
and deploy the adapter output as one same-origin Node service.
