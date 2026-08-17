import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  useSyncExternalStore,
  ReactNode,
} from 'react';
import { ContentSnapshot, API_BASE_PATH } from '@copypatch/core';
import { CopyPatchStore } from './store/store.js';

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
  children: ReactNode;
}

// In-flight fetch deduplication cache across React trees
const inFlightRequests = new Map<string, Promise<ContentSnapshot | null>>();

export function CopyPatchProvider({
  locale,
  apiBase = API_BASE_PATH,
  initialSnapshot,
  children,
}: CopyPatchProviderProps) {
  const storeRef = useRef<CopyPatchStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new CopyPatchStore(locale, initialSnapshot);
  }
  const store = storeRef.current;

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

  const [EditorComponent, setEditorComponent] = useState<React.ComponentType<{
    store: CopyPatchStore;
    apiBase: string;
  }> | null>(null);

  useEffect(() => {
    if (isEditorActive && !EditorComponent) {
      import('./editor/index.js')
        .then((mod) => {
          setEditorComponent(() => mod.CopyPatchEditor);
        })
        .catch((err) => {
          console.error('[CopyPatch] Failed to load editor runtime:', err);
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

export function useCopyPatchStore(): CopyPatchStore {
  const ctx = useContext(CopyPatchContext);
  if (!ctx) {
    throw new Error('useCopyPatch must be used within a <CopyPatchProvider>');
  }
  return ctx.store;
}
