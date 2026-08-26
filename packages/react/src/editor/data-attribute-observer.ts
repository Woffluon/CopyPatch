import { useEffect, useSyncExternalStore } from 'react';
import { CopyPatchStore } from '../store/store.js';
import { normalizeText } from '@copypatch/core';

/**
 * Attaches editing behavior to plain HTML elements with [data-copypatch="key"]
 */
export function useDataAttributeObserver(store: CopyPatchStore) {
  const shouldObserve = useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => {
      const state = store.getState();
      return state.isEditorActive && state.isAuthenticated;
    },
    () => false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!shouldObserve) return;

    const cleanupMap = new Map<HTMLElement, { key: string; cleanup: () => void }>();

    const attachElement = (el: HTMLElement) => {
      const key = el.getAttribute('data-copypatch');
      if (!key) return;
      const existing = cleanupMap.get(el);
      if (existing?.key === key) return;
      if (existing) {
        existing.cleanup();
        cleanupMap.delete(el);
      }

      // Don't enhance if it has nested non-text child elements (preserve host layout safety)
      if (el.children.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[CopyPatch Warning] Element with [data-copypatch="${key}"] contains nested DOM elements. Enhancement skipped to prevent destroying markup.`
          );
        }
        return;
      }

      const originalContentEditable = el.contentEditable;
      const originalOutline = el.style.outline;
      const originalOutlineOffset = el.style.outlineOffset;
      const originalCursor = el.style.cursor;

      el.contentEditable = 'plaintext-only';
      el.style.outline = '1px dashed rgba(59, 130, 246, 0.4)';
      el.style.outlineOffset = '2px';
      el.style.cursor = 'text';

      const handleFocus = () => store.setActiveEditingKey(key);
      const handleBlur = () => {
        store.setUnsavedEdit(key, normalizeText(el.textContent || '', false));
        store.setActiveEditingKey(null);
      };
      const handleInput = () => {
        store.setUnsavedEdit(key, normalizeText(el.textContent || '', false));
      };

      el.addEventListener('focus', handleFocus);
      el.addEventListener('blur', handleBlur);
      el.addEventListener('input', handleInput);

      cleanupMap.set(el, { key, cleanup: () => {
        el.contentEditable = originalContentEditable;
        el.style.outline = originalOutline;
        el.style.outlineOffset = originalOutlineOffset;
        el.style.cursor = originalCursor;
        el.removeEventListener('focus', handleFocus);
        el.removeEventListener('blur', handleBlur);
        el.removeEventListener('input', handleInput);
      }});
    };

    const scan = () => {
      for (const [element, entry] of cleanupMap) {
        if (!element.isConnected || !element.hasAttribute('data-copypatch')) {
          entry.cleanup();
          cleanupMap.delete(element);
        }
      }
      const elements = document.querySelectorAll<HTMLElement>('[data-copypatch]');
      elements.forEach(attachElement);
    };

    scan();

    const observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-copypatch'],
    });

    return () => {
      observer.disconnect();
      cleanupMap.forEach(({ cleanup }) => cleanup());
      cleanupMap.clear();
    };
  }, [store, shouldObserve]);
}
