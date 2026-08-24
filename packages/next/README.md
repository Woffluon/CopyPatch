# @copypatch/next

Next.js App Router helpers for CopyPatch. It wraps the React integration for client components and adds a server-side snapshot fetcher so published copy can be rendered during SSR and RSC without hydration drift.

## Install

```bash
pnpm add @copypatch/core @copypatch/react @copypatch/next @copypatch/server
```

## Minimal usage

```tsx
import { NextCopyPatchProvider, EditableText } from '@copypatch/next';
import { fetchServerSnapshot } from '@copypatch/next/server';

export default async function Page() {
  const snapshot = await fetchServerSnapshot('en', {
    apiBaseUrl: process.env.COPYPATCH_API_URL,
    revalidate: 60,
  });

  return (
    <NextCopyPatchProvider
      locale="en"
      apiBase="/__copypatch/api/v1"
      initialSnapshot={snapshot}
    >
      <EditableText contentKey="home.hero.title" as="h1">
        Pre-rendered headline
      </EditableText>
    </NextCopyPatchProvider>
  );
}
```

## Exports

- `@copypatch/next`: `NextCopyPatchProvider`, `CopyPatchProvider`, `EditableText`, `useCopyPatch`, `useEditableText`, `useCopyPatchStore`
- `@copypatch/next/server`: `fetchServerSnapshot`

## Requirements

- ESM-only package
- Node.js `>=20`
- Peer dependencies: `next`, `react`, and `react-dom`
- A running `@copypatch/server` instance for content and editor APIs

## Links

- Docs: [copypatch.dev](https://copypatch.dev)
- Source: [github.com/Woffluon/CopyPatch](https://github.com/Woffluon/CopyPatch)
- Issues: [github.com/Woffluon/CopyPatch/issues](https://github.com/Woffluon/CopyPatch/issues)

## License

MIT
