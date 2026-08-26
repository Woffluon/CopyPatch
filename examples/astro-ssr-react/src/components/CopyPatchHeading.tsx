import { CopyPatchProvider, EditableText } from '@copypatch/react';
import type { ContentSnapshot } from '@copypatch/core';

export default function CopyPatchHeading({ initialSnapshot }: { initialSnapshot: ContentSnapshot }) {
  return (
    <CopyPatchProvider locale="en" initialSnapshot={initialSnapshot} apiBase="/__copypatch/api/v2">
      <main>
        <EditableText contentKey="hero.title" as="h1">Astro SSR + React</EditableText>
        <EditableText contentKey="hero.body" as="p">This copy was read from the embedded backend.</EditableText>
      </main>
    </CopyPatchProvider>
  );
}
