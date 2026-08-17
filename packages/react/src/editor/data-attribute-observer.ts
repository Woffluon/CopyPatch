import { useEffect } from 'react';
import { CopyPatchStore } from '../store/store.js';
import { normalizeText } from '@copypatch/core';

/**
 * Attaches editing behavior to plain HTML elements with [data-copypatch="key"]
 */
export function useDataAttributeObserver(store: CopyPatchStore) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const state = store.getState();
    if (!state.isEditorActive || !state.isAuthenticated) return;

    const cleanupMap = new Map<HTMLElement, () => void>();

    const attachElement = (el: HTMLElement) => {
      if (cleanupMap.has(el)) return;
      const key = el.getAttribute('data-copypatch');
      if (!key) return;

      // Don't enhance if it has nested non-text child elements (preserve host layout safety)
      if (el.children.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[CopyPatch Warning] Element with [data-copypatch="${key}"] contains nested DOM elements. Enhancement skipped to prevent destroying markup.`
          );
        }
        return;
      }

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

      cleanupMap.set(el, () => {
        el.contentEditable = 'false';
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.cursor = '';
        el.removeEventListener('focus', handleFocus);
        el.removeEventListener('blur', handleBlur);
        el.removeEventListener('input', handleInput);
      });
    };

    const scan = () => {
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
      cleanupMap.forEach((cleanup) => cleanup());
      cleanupMap.clear();
    };
  }, [store]);
}
