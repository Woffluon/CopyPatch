'use client';

import React from 'react';
import {
  CopyPatchProvider,
  CopyPatchProviderProps,
  EditableText,
  useCopyPatch,
  useEditableText,
  useCopyPatchStore,
} from '@copypatch/react';

export function NextCopyPatchProvider(props: CopyPatchProviderProps) {
  return <CopyPatchProvider {...props} />;
}

export {
  CopyPatchProvider,
  EditableText,
  useCopyPatch,
  useEditableText,
  useCopyPatchStore,
};
