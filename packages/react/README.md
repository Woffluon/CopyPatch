# @copypatch/react

[English](README.md) | [Türkçe](README.tr.md)

React bindings for CopyPatch. This package gives you the provider, inline editable text component, hooks, and optional editor overlay export needed to let approved users edit copy directly on the page.

## Install

```bash
pnpm add @copypatch/core @copypatch/react
```

## Minimal usage

```tsx
import { CopyPatchProvider, EditableText, useCopyPatch } from '@copypatch/react';

function HeroButton() {
  const label = useCopyPatch('home.cta.label', 'Get started');
  return <button type="button">{label}</button>;
}

export function App() {
  return (
    <CopyPatchProvider
      locale="en"
      onEditorLoadError={(error) => reportError(error)}
    >
      <EditableText contentKey="home.hero.title" as="h1">
        Let clients edit the copy, not the website.
      </EditableText>
      <HeroButton />
    </CopyPatchProvider>
  );
}
```

## Exports

- `@copypatch/react`: `CopyPatchProvider`, `EditableText`, `useCopyPatch`, `useEditableText`, `useCopyPatchStore`, and the readonly `CopyPatchStoreApi` / `CopyPatchStoreState` types
- `@copypatch/react/editor`: `CopyPatchEditor`

## Requirements

- ESM-only package
- Node.js `>=20`
- Peer dependencies: `react` and `react-dom`
- A server-capable host that mounts `@copypatch/backend` at the same-origin
  `/__copypatch/api/v2` path. The provider uses that path by default.

`onEditorLoadError` receives a lazy editor-runtime load failure once, allowing
the host to report it through its own telemetry or error UI.

## Links

- Docs: [copypatch.vercel.app](https://copypatch.vercel.app/)
- Source: [github.com/Woffluon/CopyPatch](https://github.com/Woffluon/CopyPatch)
- Issues: [github.com/Woffluon/CopyPatch/issues](https://github.com/Woffluon/CopyPatch/issues)

## License

MIT
