// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyPatchStore } from '../src/store/store.js';
import { Toolbar } from '../src/editor/Toolbar.js';
import { CopyPatchEditor } from '../src/editor/index.js';
import { useDataAttributeObserver } from '../src/editor/data-attribute-observer.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function createDraftStore(): CopyPatchStore {
  const store = new CopyPatchStore('en');
  store.setEditorActive(true);
  store.setAuthenticated(true, 'csrf-token', 'draft');
  store.setEditorSnapshot({
    locale: 'en',
    publishedRevision: 3,
    draftRevision: 4,
    publishingMode: 'draft',
    published: { 'hero.title': 'Published title' },
    drafts: { 'hero.title': 'Draft title' },
  });
  return store;
}

describe('editor runtime', () => {
  it('publishes with both revision preconditions and stores both returned revisions', async () => {
    const store = createDraftStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      publishedRevision: 5,
      draftRevision: 6,
      promotedCount: 1,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Toolbar store={store} apiBase="/__copypatch/api/v2" onLogout={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      expectedPublishedRevision: 3,
      expectedDraftRevision: 4,
    });
    await waitFor(() => expect(store.getState()).toMatchObject({
      publishedRevision: 5,
      draftRevision: 6,
      drafts: {},
      published: { 'hero.title': 'Draft title' },
    }));
  });

  it('accepts an authenticated host session that explicitly does not require CSRF', async () => {
    const store = new CopyPatchStore('en');
    store.setEditorActive(true);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        authenticated: true,
        requiresCsrf: false,
        publishingMode: 'draft',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        locale: 'en',
        publishedRevision: 1,
        draftRevision: 1,
        publishingMode: 'draft',
        published: {},
        drafts: {},
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<CopyPatchEditor store={store} apiBase="/__copypatch/api/v2" />);

    await screen.findByRole('complementary', { name: 'CopyPatch Edit Toolbar' });
    expect(store.getState()).toMatchObject({ isAuthenticated: true, csrfToken: null, publishingMode: 'draft' });
  });

  it('attaches after authentication and detaches when a data attribute is removed', async () => {
    const store = new CopyPatchStore('en');
    const target = document.createElement('p');
    target.setAttribute('data-copypatch', 'hero.title');
    target.textContent = 'Original title';
    document.body.appendChild(target);

    function ObserverHarness() {
      useDataAttributeObserver(store);
      return null;
    }

    render(<ObserverHarness />);
    act(() => {
      store.setEditorActive(true);
      store.setAuthenticated(true, 'csrf-token');
    });

    await waitFor(() => expect(target.contentEditable).toBe('plaintext-only'));
    target.removeAttribute('data-copypatch');
    await waitFor(() => expect(target.contentEditable).not.toBe('plaintext-only'));
  });
});
