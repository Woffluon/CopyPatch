import React from 'react';
import ReactDOM from 'react-dom/client';
import { CopyPatchProvider, EditableText } from '@copypatch/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CopyPatchProvider locale="en" apiBase="/__copypatch/api/v2">
      <main>
        <EditableText contentKey="hero.title" as="h1">Vite + Node host</EditableText>
        <EditableText contentKey="hero.body" as="p">The browser and backend have one origin.</EditableText>
      </main>
    </CopyPatchProvider>
  </React.StrictMode>,
);
