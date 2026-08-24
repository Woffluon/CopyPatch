# @copypatch/server

Node.js server and CLI for CopyPatch. Use it as the runtime that serves snapshots, handles editor authentication, and persists published or draft content in SQLite.

## Install

```bash
pnpm add @copypatch/server
```

## Minimal usage

```ts
import { createCopyPatchServer, initDatabase } from '@copypatch/server';

const config = {
  dbPath: './copypatch.sqlite',
  publicOrigin: 'http://localhost:5173',
};

const dbConnection = initDatabase(config.dbPath);
const server = createCopyPatchServer(config, dbConnection);

export default server.app;
```

```bash
npx copypatch init --db ./copypatch.sqlite
npx copypatch serve --db ./copypatch.sqlite --origin http://localhost:5173
```

## Exports

- `@copypatch/server`: server config, server factory, database helpers, auth helpers, content services, cache utilities, and middleware exports
- `@copypatch/server/cli`: CLI runners such as `runInit`, `runServe`, `runPassword`, and `runMigrate`
- `copypatch`: CLI binary

## Requirements

- ESM-only package
- Node.js `>=20`
- Runtime dependencies include SQLite (`better-sqlite3`) and Hono

## Links

- Docs: [copypatch.dev](https://copypatch.dev)
- Source: [github.com/Woffluon/CopyPatch](https://github.com/Woffluon/CopyPatch)
- Issues: [github.com/Woffluon/CopyPatch/issues](https://github.com/Woffluon/CopyPatch/issues)

## License

MIT
