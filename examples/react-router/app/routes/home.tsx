import { CopyPatchProvider, EditableText } from '@copypatch/react';
import { useLoaderData } from 'react-router';
import type { ContentSnapshot } from '@copypatch/core';
import { getCopyPatchBackend } from '../lib/copypatch.server';

export async function loader(): Promise<{ snapshot: ContentSnapshot }> {
  const backend = await getCopyPatchBackend();
  return { snapshot: await backend.readPublished('en') };
}

export default function Home() {
  const { snapshot } = useLoaderData<typeof loader>();
  return (
    <CopyPatchProvider locale="en" initialSnapshot={snapshot} apiBase="/__copypatch/api/v2">
      <main>
        <EditableText contentKey="hero.title" as="h1">React Router Framework Mode</EditableText>
        <EditableText contentKey="hero.body" as="p">SSR and API share one deployment.</EditableText>
      </main>
    </CopyPatchProvider>
  );
}
