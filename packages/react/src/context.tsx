import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { API_BASE_PATH, type ContentSnapshot } from '@copypatch/core';
import { CopyPatchStore, type CopyPatchStoreApi } from './store/store.js';
import { loadCopyPatchEditor, type CopyPatchEditorComponent } from './editor-loader.js';

export interface CopyPatchContextValue {
  store: CopyPatchStore;
  apiBase: string;
  locale: string;
}

export const CopyPatchContext = createContext<CopyPatchContextValue | null>(null);

export interface CopyPatchProviderProps {
  locale: string;
  apiBase?: string;
  initialSnapshot?: ContentSnapshot;
  onEditorLoadError?: (error: Error) => void;
  children: ReactNode;
}

// In-flight fetch deduplication cache across React trees
const inFlightRequests = new Map<string, Promise<ContentSnapshot | null>>();

export function CopyPatchProvider({
  locale,
  apiBase = API_BASE_PATH,
  initialSnapshot,
  onEditorLoadError,
  children,
}: CopyPatchProviderProps) {
  const storeRef = useRef<CopyPatchStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new CopyPatchStore(locale, initialSnapshot);
  }
  const store = storeRef.current;
  const onEditorLoadErrorRef = useRef(onEditorLoadError);
  const editorLoadErrorReportedRef = useRef(false);

  useEffect(() => {
    onEditorLoadErrorRef.current = onEditorLoadError;
  }, [onEditorLoadError]);

  // Sync locale changes
  useEffect(() => {
    store.setLocale(locale);
  }, [store, locale]);

  // Check for ?copypatch=1 query parameter to trigger editor mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('copypatch') === '1') {
      store.setEditorActive(true);
    }
  }, [store]);

  // Fetch published snapshot for active locale (if not SSR-hydrated or when locale changes)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cacheKey = `${apiBase}:${locale}`;
    let isMounted = true;

    async function fetchSnapshot() {
      if (inFlightRequests.has(cacheKey)) {
        const cachedPromise = inFlightRequests.get(cacheKey)!;
        const res = await cachedPromise;
        if (res && isMounted) {
          store.setPublishedSnapshot(res);
        }
        return;
      }

      const reqPromise = (async () => {
        try {
          const res = await fetch(`${apiBase}/content/${encodeURIComponent(locale)}`, {
            headers: {
              Accept: 'application/json',
            },
          });
          if (res.status === 200) {
            const data: ContentSnapshot = await res.json();
            return data;
          }
        } catch {
          // Graceful failure tolerance: keep fallback content without crashing host
        } finally {
          inFlightRequests.delete(cacheKey);
        }
        return null;
      })();

      inFlightRequests.set(cacheKey, reqPromise);
      const data = await reqPromise;
      if (data && isMounted) {
        store.setPublishedSnapshot(data);
      }
    }

    fetchSnapshot();

    return () => {
      isMounted = false;
    };
  }, [apiBase, locale, store]);

  // Lazy-load editor overlay when ?copypatch=1 is present
  const isEditorActive = useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.getState().isEditorActive,
    () => false
  );

  const [EditorComponent, setEditorComponent] = useState<CopyPatchEditorComponent | null>(null);

  useEffect(() => {
    if (isEditorActive && !EditorComponent) {
      loadCopyPatchEditor()
        .then((Editor) => {
          setEditorComponent(() => Editor);
        })
        .catch((error: unknown) => {
          if (editorLoadErrorReportedRef.current) return;
          editorLoadErrorReportedRef.current = true;
          onEditorLoadErrorRef.current?.(toError(error));
        });
    }
  }, [isEditorActive, EditorComponent]);

  return (
    <CopyPatchContext.Provider value={{ store, apiBase, locale }}>
      {children}
      {isEditorActive && EditorComponent && (
        <EditorComponent store={store} apiBase={apiBase} />
      )}
    </CopyPatchContext.Provider>
  );
}

export function useCopyPatchStore(): CopyPatchStoreApi {
  const ctx = useContext(CopyPatchContext);
  if (!ctx) {
    throw new Error('useCopyPatch must be used within a <CopyPatchProvider>');
  }
  return ctx.store;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Failed to load the CopyPatch editor runtime.');
}
