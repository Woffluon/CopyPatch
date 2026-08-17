import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useSyncExternalStore,
  useContext,
} from 'react';
import { CopyPatchContext } from '../context.js';
import { normalizeText } from '@copypatch/core';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface UseEditableTextOptions {
  allowLineBreaks?: boolean;
}

export interface UseEditableTextReturn {
  text: string;
  isEditing: boolean;
  isEditorActive: boolean;
  elementRef: React.RefObject<HTMLElement | null>;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: (e: React.FocusEvent) => void;
  onInput: (e: React.FormEvent<HTMLElement>) => void;
  onCompositionStart: (e: React.CompositionEvent<HTMLElement>) => void;
  onCompositionEnd: (e: React.CompositionEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  contentEditable: 'plaintext-only' | boolean;
  suppressContentEditableWarning: boolean;
  'data-copypatch': string;
}

export function useEditableText(
  contentKey: string,
  fallback: string,
  options: UseEditableTextOptions = {}
): UseEditableTextReturn {
  const ctx = useContext(CopyPatchContext);
  const elementRef = useRef<HTMLElement | null>(null);
  const isComposingRef = useRef(false);

  const store = ctx?.store;

  const text = useSyncExternalStore(
    (cb) => (store ? store.subscribeKey(contentKey, cb) : () => {}),
    () => (store ? store.resolveContent(contentKey, fallback) : fallback),
    () => fallback
  );

  const isEditorActive = useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => Boolean(store?.getState().isEditorActive && store?.getState().isAuthenticated),
    () => false
  );

  const isEditing = useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => store?.getState().activeEditingKey === contentKey,
    () => false
  );

  // Sync DOM textContent without resetting caret when not actively focused
  useIsomorphicLayoutEffect(() => {
    if (elementRef.current && isEditorActive) {
      const isFocused =
        typeof document !== 'undefined' && document.activeElement === elementRef.current;
      if (!isFocused && elementRef.current.textContent !== text) {
        elementRef.current.textContent = text;
      }
    }
  }, [text, isEditorActive]);

  const onFocus = useCallback(() => {
    if (store && isEditorActive) {
      store.setActiveEditingKey(contentKey);
    }
  }, [store, isEditorActive, contentKey]);

  const onBlur = useCallback(() => {
    if (store && isEditorActive) {
      if (elementRef.current) {
        const raw = elementRef.current.textContent || '';
        const clean = normalizeText(raw, options.allowLineBreaks);
        store.setUnsavedEdit(contentKey, clean);
      }
      store.setActiveEditingKey(null);
    }
  }, [store, isEditorActive, contentKey, options.allowLineBreaks]);

  const onInput = useCallback(
    (e: React.FormEvent<HTMLElement>) => {
      if (!isEditorActive || !store || isComposingRef.current) return;
      const target = e.currentTarget;
      const raw = target.textContent || '';
      const clean = normalizeText(raw, options.allowLineBreaks);
      store.setUnsavedEdit(contentKey, clean);
    },
    [isEditorActive, store, contentKey, options.allowLineBreaks]
  );

  const onCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLElement>) => {
      isComposingRef.current = false;
      if (!isEditorActive || !store) return;
      const target = e.currentTarget;
      const raw = target.textContent || '';
      const clean = normalizeText(raw, options.allowLineBreaks);
      store.setUnsavedEdit(contentKey, clean);
    },
    [isEditorActive, store, contentKey, options.allowLineBreaks]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!isEditorActive) return;

      // When allowLineBreaks is false, Enter should commit blur or do nothing
      if (!options.allowLineBreaks && e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }

      // Suppress link navigation or form submission while typing
      e.stopPropagation();
    },
    [isEditorActive, options.allowLineBreaks]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (!isEditorActive) return;
      e.preventDefault();

      const text = e.clipboardData.getData('text/plain');
      const clean = normalizeText(text, options.allowLineBreaks);

      // Insert plain text at selection
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(clean);
      range.insertNode(textNode);

      // Move caret to end of inserted text
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);

      if (store && elementRef.current) {
        store.setUnsavedEdit(contentKey, elementRef.current.textContent || '');
      }
    },
    [isEditorActive, store, contentKey, options.allowLineBreaks]
  );

  return {
    text,
    isEditing,
    isEditorActive,
    elementRef,
    onFocus,
    onBlur,
    onInput,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    onPaste,
    contentEditable: isEditorActive ? 'plaintext-only' : false,
    suppressContentEditableWarning: true,
    'data-copypatch': contentKey,
  };
}
