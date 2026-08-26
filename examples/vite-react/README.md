# Vite React static fixture

This browser-only fixture uses the canonical same-origin
`/__copypatch/api/v2` base path and deliberately has no Vite dev-server proxy.

Static-only Vite deployments cannot host CopyPatch's authenticated API. Use
`examples/vite-node` when the Vite UI and Node CopyPatch handler must share one
deployment.
