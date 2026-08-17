import { useSyncExternalStore, useContext } from 'react';
import { CopyPatchContext } from '../context.js';

/**
 * High-level read hook: returns the resolved string for a contentKey
 */
export function useCopyPatch(contentKey: string, fallback: string): string {
  const ctx = useContext(CopyPatchContext);
  if (!ctx) {
    // Graceful SSR/unwrapped fallback
    return fallback;
  }

  const { store } = ctx;

  return useSyncExternalStore(
    (onStoreChange) => store.subscribeKey(contentKey, onStoreChange),
    () => store.resolveContent(contentKey, fallback),
    () => fallback
  );
}
