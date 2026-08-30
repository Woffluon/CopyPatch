# @copypatch/next

[English](README.md) | [Türkçe](README.tr.md)

Next.js App Router helpers for CopyPatch. It wraps the React client integration, adapts a colocated v2 backend to an App Router catch-all route, and reads published snapshots directly during SSR/RSC.

## Install

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/backend @copypatch/next
```

## Minimal usage

```tsx
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { readPublishedSnapshot } from '@copypatch/next/server';
import { backend } from '@/lib/copypatch-backend';

export default async function Page() {
  const snapshot = await readPublishedSnapshot(backend, 'en');

  return (
    <NextCopyPatchProvider
      locale="en"
      initialSnapshot={snapshot}
    >
      <EditableText contentKey="home.hero.title" as="h1">
        Pre-rendered headline
      </EditableText>
    </NextCopyPatchProvider>
  );
}
```

Create a catch-all route at `app/%5F%5Fcopypatch/api/v2/[...path]/route.ts`.
The percent-encoded folder name is required because Next treats underscore-
prefixed source folders as private while the public URL remains
`/__copypatch/api/v2`. The
adapter forwards the original Web `Request` and the backend `Response` without
rebuilding either one:

```ts
import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { backend } from '@/lib/copypatch-backend';
import { resolveCopyPatchContext } from '@/lib/copypatch-auth';

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createCopyPatchRouteHandlers(backend, {
    resolveContext: resolveCopyPatchContext,
  });
```

`resolveContext(request)` returns `CopyPatchHandleContext` (including an
optional opaque `hostAuth` value and a trusted `clientAddress` for unsafe
request rate limits). It is passed directly to the backend and is never
serialized into request headers. `readPublishedSnapshot` returns the
backend result directly; supply `{ fallback }` when the host needs a specific
safe snapshot if the read rejects.

## Exports

- `@copypatch/next`: `NextCopyPatchProvider`, `CopyPatchProvider`, `EditableText`, `useCopyPatch`, `useEditableText`, `useCopyPatchStore`
- `@copypatch/next/server`: `createCopyPatchRouteHandlers`, `readPublishedSnapshot`

## Requirements

- ESM-only package
- Node.js `>=20`
- Peer dependencies: `next`, `react`, and `react-dom`
- A configured `@copypatch/backend` instance in the Next.js server runtime; no localhost URL or self-fetch is required

## Links

- Docs: [copypatch.vercel.app](https://copypatch.vercel.app/)
- Source: [github.com/Woffluon/CopyPatch](https://github.com/Woffluon/CopyPatch)
- Issues: [github.com/Woffluon/CopyPatch/issues](https://github.com/Woffluon/CopyPatch/issues)

## License

MIT
