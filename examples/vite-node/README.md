# Vite + Node same-deployment fixture

This is the serverful counterpart to `examples/vite-react`. It starts Vite in
middleware mode and mounts the Node adapter before the Vite SPA fallback, so
`/__copypatch/api/v2/*` stays in the same deployment and origin as the React
app.

Set `COPYPATCH_PASSPHRASE_HASH` and optionally `COPYPATCH_SQLITE_PATH`, then run
`pnpm --filter example-vite-node dev`. Do not replace this mount with a
cross-origin dev proxy: CopyPatch relies on host cookies and exact same-origin
mutation checks.
