import React, { useSyncExternalStore, useState, useEffect } from 'react';
import { CopyPatchStore } from '../store/store.js';
import {
  CSRF_HEADER_NAME,
  SaveChangesRequest,
  SaveChangesResponse,
  PublishResponse,
  ApiErrorResponse,
  PublishRequest,
  RevisionConflictResponse,
} from '@copypatch/core';

export interface ToolbarProps {
  store: CopyPatchStore;
  apiBase: string;
  onLogout: () => void;
}

export function Toolbar({ store, apiBase, onLogout }: ToolbarProps) {
  // Subscribe to store updates for reactive toolbar controls
  useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.getState(),
    () => store.getState()
  );

  const state = store.getState();
  const unsavedCount = Object.keys(state.unsaved).length;
  const draftCount = Object.keys(state.drafts).length;

  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  // Keyboard shortcut support: Cmd/Ctrl + S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (unsavedCount > 0 && !state.isSaving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unsavedCount, state.isSaving, state.publishedRevision, state.draftRevision, state.locale, state.csrfToken]);

  const handleSave = async () => {
    if (unsavedCount === 0) return;
    store.setSaving(true, null);

    const changes = Object.entries(state.unsaved).map(([key, text]) => ({
      key,
      text,
    }));

    const payload: SaveChangesRequest = {
      expectedPublishedRevision: state.publishedRevision,
      expectedDraftRevision: state.draftRevision,
      changes,
    };

    try {
      const res = await fetch(
        `${apiBase}/editor/${encodeURIComponent(state.locale)}/changes`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            [CSRF_HEADER_NAME]: state.csrfToken || '',
            Origin: window.location.origin,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = await readErrorAndRefreshSnapshot(res, store);
        store.setSaving(false, err.error?.message || 'Failed to save changes.');
        return;
      }

      const data: SaveChangesResponse = await res.json();
      if (state.publishingMode === 'direct') {
        const nextPublished = { ...state.published, ...state.unsaved };
        store.setPublishedSnapshot({
          revision: data.publishedRevision,
          content: nextPublished,
        });
        store.discardUnsaved();
      } else {
        const nextDrafts = { ...state.drafts, ...state.unsaved };
        store.setEditorSnapshot({
          locale: state.locale,
          publishedRevision: data.publishedRevision,
          draftRevision: data.draftRevision,
          publishingMode: state.publishingMode,
          published: state.published,
          drafts: nextDrafts,
        });
        store.discardUnsaved();
      }
      store.setSaving(false, null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error saving changes.';
      store.setSaving(false, message);
    }
  };

  const handlePublish = async () => {
    if (state.publishingMode !== 'draft') return;
    store.setSaving(true, null);

    try {
      const res = await fetch(
        `${apiBase}/editor/${encodeURIComponent(state.locale)}/publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [CSRF_HEADER_NAME]: state.csrfToken || '',
            Origin: window.location.origin,
          },
          body: JSON.stringify({
            expectedPublishedRevision: state.publishedRevision,
            expectedDraftRevision: state.draftRevision,
          } satisfies PublishRequest),
        }
      );

      if (!res.ok) {
        const err = await readErrorAndRefreshSnapshot(res, store);
        store.setSaving(false, err.error?.message || 'Failed to publish drafts.');
        return;
      }

      const data: PublishResponse = await res.json();
      const nextPublished = { ...state.published, ...state.drafts };
      store.setEditorSnapshot({
        locale: state.locale,
        publishedRevision: data.publishedRevision,
        draftRevision: data.draftRevision,
        publishingMode: state.publishingMode,
        published: nextPublished,
        drafts: {},
      });
      store.setSaving(false, null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error publishing drafts.';
      store.setSaving(false, message);
    }
  };

  const handleDiscard = () => {
    if (confirm('Discard all unsaved local changes?')) {
      store.discardUnsaved();
    }
  };

  const handleExit = () => {
    if (unsavedCount > 0) {
      if (!confirm('You have unsaved changes. Exit edit mode anyway?')) {
        return;
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('copypatch');
    window.history.replaceState({}, '', url.toString());
    store.setEditorActive(false);
  };

  return (
    <aside
      aria-label="CopyPatch Edit Toolbar"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999990,
        display: 'flex',
        alignItems: 'center',
        padding: '5px',
        borderRadius: '9999px',
        backgroundColor: 'rgba(10, 10, 14, 0.88)',
        backdropFilter: 'blur(28px) saturate(190%)',
        WebkitBackdropFilter: 'blur(28px) saturate(190%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow:
          '0 28px 60px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '13px',
        color: '#f4f4f5',
        userSelect: 'none',
        transition: 'all 300ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Inner Enclosure / Concentric Shell */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '4px 12px',
          borderRadius: '9999px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
        }}
      >
        {/* Brand Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '5px',
              backgroundColor: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(59, 130, 246, 0.4)',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <strong style={{ fontWeight: 650, letterSpacing: '-0.02em', fontSize: '13px', color: '#ffffff' }}>
            CopyPatch
          </strong>
          <span
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#d4d4d8',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: '11px',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: '0.04em',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {state.locale}
          </span>
        </div>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'rgba(255, 255, 255, 0.12)' }} />

        {/* Status Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {unsavedCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#fbbf24',
                  boxShadow: '0 0 8px #fbbf24',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#fbbf24', fontWeight: 550, fontSize: '12.5px' }}>
                {unsavedCount} unsaved edit{unsavedCount > 1 ? 's' : ''}
              </span>
            </div>
          ) : draftCount > 0 && state.publishingMode === 'draft' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#60a5fa',
                  boxShadow: '0 0 8px #60a5fa',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#93c5fd', fontWeight: 550, fontSize: '12.5px' }}>
                {draftCount} saved draft{draftCount > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                  boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#a1a1aa', fontSize: '12.5px' }}>Ready to edit</span>
            </div>
          )}

          {state.errorMessage && (
            <span
              style={{
                color: '#f87171',
                maxWidth: '220px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
              title={state.errorMessage}
            >
              {state.errorMessage}
            </span>
          )}
        </div>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'rgba(255, 255, 255, 0.12)' }} />

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {unsavedCount > 0 && (
            <button
              type="button"
              onClick={handleDiscard}
              onMouseEnter={() => setHoveredButton('discard')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                backgroundColor: hoveredButton === 'discard' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: '#a1a1aa',
                border: '1px solid transparent',
                padding: '5px 10px',
                borderRadius: '9999px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '12px',
                transition: 'all 150ms ease',
              }}
            >
              Discard
            </button>
          )}

          {/* Primary Save Button with Button-in-Button Shortcut Badge */}
          <button
            type="button"
            onClick={handleSave}
            disabled={unsavedCount === 0 || state.isSaving}
            onMouseEnter={() => setHoveredButton('save')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              backgroundColor:
                unsavedCount > 0
                  ? hoveredButton === 'save'
                    ? '#1d4ed8'
                    : '#2563eb'
                  : 'rgba(255, 255, 255, 0.06)',
              color: unsavedCount > 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
              border: unsavedCount > 0 ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
              padding: '5px 12px',
              borderRadius: '9999px',
              cursor: unsavedCount > 0 && !state.isSaving ? 'pointer' : 'default',
              fontWeight: 600,
              fontSize: '12.5px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow:
                unsavedCount > 0
                  ? '0 4px 12px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                  : 'none',
              transform: hoveredButton === 'save' && unsavedCount > 0 ? 'translateY(-0.5px)' : 'none',
              transition: 'all 150ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <span>
              {state.isSaving
                ? 'Saving...'
                : state.publishingMode === 'direct'
                ? 'Save'
                : 'Save Draft'}
            </span>
            {unsavedCount > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                ⌘S
              </span>
            )}
          </button>

          {/* Publish Draft Button */}
          {state.publishingMode === 'draft' && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={draftCount === 0 || state.isSaving}
              onMouseEnter={() => setHoveredButton('publish')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                backgroundColor:
                  draftCount > 0
                    ? hoveredButton === 'publish'
                      ? '#15803d'
                      : '#16a34a'
                    : 'rgba(255, 255, 255, 0.06)',
                color: draftCount > 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
                border: draftCount > 0 ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '9999px',
                cursor: draftCount > 0 && !state.isSaving ? 'pointer' : 'default',
                fontWeight: 600,
                fontSize: '12.5px',
                boxShadow:
                  draftCount > 0
                    ? '0 4px 12px rgba(22, 163, 74, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                    : 'none',
                transform: hoveredButton === 'publish' && draftCount > 0 ? 'translateY(-0.5px)' : 'none',
                transition: 'all 150ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
            >
              Publish
            </button>
          )}

          {/* Exit Edit Mode */}
          <button
            type="button"
            onClick={handleExit}
            onMouseEnter={() => setHoveredButton('exit')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              backgroundColor: hoveredButton === 'exit' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: '#a1a1aa',
              border: '1px solid transparent',
              padding: '5px 10px',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 150ms ease',
            }}
            title="Exit edit mode"
          >
            ✕ Exit
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            onMouseEnter={() => setHoveredButton('logout')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              backgroundColor: hoveredButton === 'logout' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
              color: hoveredButton === 'logout' ? '#f87171' : '#ef4444',
              border: '1px solid transparent',
              padding: '5px 8px',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontSize: '11.5px',
              fontWeight: 550,
              transition: 'all 150ms ease',
            }}
            title="Logout from editor session"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}

async function readErrorAndRefreshSnapshot(response: Response, store: CopyPatchStore): Promise<ApiErrorResponse> {
  const error = await response.json().catch(() => ({})) as ApiErrorResponse & Partial<RevisionConflictResponse>;
  if (error.error?.code === 'REVISION_CONFLICT' && error.latest) {
    store.setEditorSnapshot(error.latest);
  }
  return error;
}
