import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CopyPatchStore } from '../store/store.js';
import { AuthModal } from './AuthModal.js';
import { Toolbar } from './Toolbar.js';
import { useDataAttributeObserver } from './data-attribute-observer.js';
import { SessionAuthResponse, EditorSnapshot, CSRF_HEADER_NAME } from '@copypatch/core';

export interface CopyPatchEditorProps {
  store: CopyPatchStore;
  apiBase: string;
}

export function CopyPatchEditor({ store, apiBase }: CopyPatchEditorProps) {
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  const isAuthenticated = useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.getState().isAuthenticated,
    () => false
  );

  const isEditorActive = useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.getState().isEditorActive,
    () => false
  );

  // Setup non-intrusive isolated portal container in DOM
  useEffect(() => {
    setMounted(true);
    let root = document.getElementById('copypatch-portal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'copypatch-portal-root';
      document.body.appendChild(root);
    }
    setPortalRoot(root);

    return () => {
      // Clean up portal container on unmount
      if (root && root.parentNode) {
        root.parentNode.removeChild(root);
      }
    };
  }, []);

  const locale = useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.getState().locale,
    () => store.getState().locale
  );

  // Check active session status and refetch editor snapshot on locale or session change
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch(`${apiBase}/session`, {
          headers: {
            Accept: 'application/json',
          },
        });
        if (res.ok) {
          const data: SessionAuthResponse = await res.json();
          if (data.authenticated && data.csrfToken) {
            store.setAuthenticated(true, data.csrfToken, data.publishingMode);
            // Fetch complete editor snapshot for active locale
            fetchEditorSnapshot();
          } else {
            store.setAuthenticated(false, null);
          }
        }
      } catch {
        store.setAuthenticated(false, null);
      }
    }

    async function fetchEditorSnapshot() {
      const state = store.getState();
      try {
        const res = await fetch(
          `${apiBase}/editor/${encodeURIComponent(state.locale)}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );
        if (res.ok) {
          const snapshot: EditorSnapshot = await res.json();
          store.setEditorSnapshot(snapshot);
        }
      } catch (err) {
        console.error('[CopyPatch] Failed to load editor snapshot:', err);
      }
    }

    if (isEditorActive) {
      checkSession();
    }
  }, [isEditorActive, apiBase, store, locale]);

  // Observe [data-copypatch] attributes
  useDataAttributeObserver(store);

  const handleAuthSuccess = async (csrfToken: string) => {
    store.setAuthenticated(true, csrfToken);
    const state = store.getState();
    try {
      const res = await fetch(
        `${apiBase}/editor/${encodeURIComponent(state.locale)}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
      if (res.ok) {
        const snapshot: EditorSnapshot = await res.json();
        store.setEditorSnapshot(snapshot);
      }
    } catch (err) {
      console.error('[CopyPatch] Failed to load editor snapshot after login:', err);
    }
  };

  const handleLogout = async () => {
    const state = store.getState();
    try {
      await fetch(`${apiBase}/session`, {
        method: 'DELETE',
        headers: {
          [CSRF_HEADER_NAME]: state.csrfToken || '',
          Origin: window.location.origin,
        },
      });
    } catch {
      // ignore
    }
    store.setAuthenticated(false, null);
  };

  const handleCancelAuth = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('copypatch');
    window.history.replaceState({}, '', url.toString());
    store.setEditorActive(false);
  };

  if (!mounted || !portalRoot || !isEditorActive) return null;

  return createPortal(
    <>
      {!isAuthenticated ? (
        <AuthModal
          apiBase={apiBase}
          store={store}
          onSuccess={handleAuthSuccess}
          onCancel={handleCancelAuth}
        />
      ) : (
        <Toolbar
          store={store}
          apiBase={apiBase}
          onLogout={handleLogout}
        />
      )}
    </>,
    portalRoot
  );
}
