# React Router v7 Framework Mode fixture

This fixture uses React Router **v7 Framework Mode** with SSR enabled. Its
resource route forwards `/__copypatch/api/v2/*` requests to the colocated
CopyPatch backend, and the home loader reads the server snapshot directly.
The route configuration imports and spreads `copyPatchRoutes`, which is the
same small registration step shown by `copypatch init --framework react-router`.

Set `COPYPATCH_PASSPHRASE_HASH` and optionally `COPYPATCH_SQLITE_PATH`. Do not
deploy this pattern as a static SPA: CopyPatch requires the Framework Mode Node
server so browser requests, session cookies, and origin validation use one
deployment origin.
