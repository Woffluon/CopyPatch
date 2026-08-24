# @copypatch/core

Shared ESM contracts and helpers for the CopyPatch package family. Use this package when you need the canonical request/response types, validation helpers, and API constants outside the ready-made React or Next.js integrations.

## Install

```bash
pnpm add @copypatch/core
```

## Minimal usage

```ts
import {
  API_BASE_PATH,
  isValidContentKey,
  normalizeText,
  type ContentSnapshot,
} from '@copypatch/core';

const key = 'home.hero.title';
const ok = isValidContentKey(key);
const text = normalizeText('Hello\nWorld');

const snapshot: ContentSnapshot = {
  revision: 1,
  content: {
    [key]: ok ? text : 'Fallback',
  },
};

console.log(API_BASE_PATH, snapshot);
```

## Exports

- `@copypatch/core`: shared types such as `ContentSnapshot`, `EditorSnapshot`, request/response contracts, API constants, and validation helpers.

## Requirements

- ESM-only package
- Node.js `>=20`

## Links

- Docs: [copypatch.vercel.app](https://copypatch.vercel.app/)
- Source: [github.com/Woffluon/CopyPatch](https://github.com/Woffluon/CopyPatch)
- Issues: [github.com/Woffluon/CopyPatch/issues](https://github.com/Woffluon/CopyPatch/issues)

## License

MIT
