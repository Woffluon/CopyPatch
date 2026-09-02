import type { ComponentType } from 'react';
import type { CopyPatchStore } from './store/store.js';

export type CopyPatchEditorComponent = ComponentType<{
  store: CopyPatchStore;
  apiBase: string;
}>;

export async function loadCopyPatchEditor(): Promise<CopyPatchEditorComponent> {
  const { CopyPatchEditor } = await import('./editor/index.js');
  return CopyPatchEditor;
}
