// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyPatchContext, CopyPatchProvider } from '../src/context.js';
import { EditableText } from '../src/components/EditableText.js';
import { useCopyPatch } from '../src/hooks/useCopyPatch.js';
import { AuthModal } from '../src/editor/AuthModal.js';
import { CopyPatchEditor } from '../src/editor/index.js';
import { Toolbar } from '../src/editor/Toolbar.js';
import { useDataAttributeObserver } from '../src/editor/data-attribute-observer.js';
import { CopyPatchStore } from '../src/store/store.js';
import * as publicApi from '../src/index.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function CopyValue({ contentKey = 'hero.title', fallback = 'Fallback title' }: {
  contentKey?: string;
  fallback?: string;
}) {
  return <output>{useCopyPatch(contentKey, fallback)}</output>;
}

function editorStore(): CopyPatchStore {
  const store = new CopyPatchStore('en', {
    revision: 2,
    content: { 'hero.title': 'Original title' },
  });
  store.setEditorActive(true);
  store.setAuthenticated(true, 'csrf-token');
  return store;
}

describe('React public rendering APIs', () => {
  it('exposes the public React API through the package entry point', () => {
    expect(publicApi.CopyPatchProvider).toBe(CopyPatchProvider);
    expect(publicApi.EditableText).toBe(EditableText);
  });

  it('returns the fallback from useCopyPatch outside a provider', () => {
    render(<CopyValue fallback="Standalone fallback" />);

    expect(screen.getByText('Standalone fallback')).toBeTruthy();
  });

  it('deduplicates provider snapshot requests while updating every subscribed tree', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      revision: 7,
      content: { 'hero.title': 'Fetched title' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <>
        <CopyPatchProvider locale="en" apiBase="/copy-api"><CopyValue /></CopyPatchProvider>
        <CopyPatchProvider locale="en" apiBase="/copy-api"><CopyValue /></CopyPatchProvider>
      </>,
    );

    await waitFor(() => expect(screen.getAllByText('Fetched title')).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/copy-api/content/en', {
      headers: { Accept: 'application/json' },
    });
  });

  it('keeps fallback text visible when the provider snapshot request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(
      <CopyPatchProvider locale="en" apiBase="/copy-api">
        <CopyValue fallback="Offline fallback" />
      </CopyPatchProvider>,
    );

    expect(screen.getByText('Offline fallback')).toBeTruthy();
    await Promise.resolve();
    expect(screen.getByText('Offline fallback')).toBeTruthy();
  });

  it('edits, normalizes, and commits an EditableText value in authenticated editor mode', async () => {
    const store = editorStore();
    const parentClick = vi.fn();

    render(
      <CopyPatchContext.Provider value={{ store, apiBase: '/copy-api', locale: 'en' }}>
        <button onClick={parentClick} type="button">
          <EditableText contentKey="hero.title" as="span">Original title</EditableText>
        </button>
      </CopyPatchContext.Provider>,
    );

    const editable = document.querySelector<HTMLElement>('[data-copypatch="hero.title"]')!;
    await waitFor(() => expect(editable.textContent).toBe('Original title'));
    expect(editable.getAttribute('contenteditable')).toBe('plaintext-only');

    fireEvent.focus(editable);
    expect(store.getState().activeEditingKey).toBe('hero.title');

    editable.textContent = '  Edited\n title  ';
    fireEvent.input(editable);
    expect(store.getState().unsaved['hero.title']).toBe('  Edited  title  ');

    fireEvent.click(editable);
    expect(parentClick).not.toHaveBeenCalled();

    editable.textContent = 'Committed title';
    fireEvent.keyDown(editable, { key: 'Enter' });
    fireEvent.blur(editable);
    expect(store.getState().unsaved['hero.title']).toBe('Committed title');
    expect(store.getState().activeEditingKey).toBeNull();
  });

  it('does not save intermediate composition text until composition ends', async () => {
    const store = editorStore();
    render(
      <CopyPatchContext.Provider value={{ store, apiBase: '/copy-api', locale: 'en' }}>
        <EditableText contentKey="hero.title">Original title</EditableText>
      </CopyPatchContext.Provider>,
    );

    const editable = document.querySelector<HTMLElement>('[data-copypatch="hero.title"]')!;
    await waitFor(() => expect(editable.textContent).toBe('Original title'));
    fireEvent.compositionStart(editable);
    editable.textContent = 'Composing';
    fireEvent.input(editable);
    expect(store.getState().unsaved).toEqual({});

    editable.textContent = 'Completed';
    fireEvent.compositionEnd(editable);
    expect(store.getState().unsaved['hero.title']).toBe('Completed');
  });

  it('renders a semantic visitor element without editing controls before authentication', () => {
    const store = new CopyPatchStore('en');
    render(
      <CopyPatchContext.Provider value={{ store, apiBase: '/copy-api', locale: 'en' }}>
        <EditableText as="h2" contentKey="hero.title" className="hero-copy">Visitor title</EditableText>
      </CopyPatchContext.Provider>,
    );

    const heading = screen.getByRole('heading', { name: 'Visitor title' });
    expect(heading.getAttribute('contenteditable')).toBeNull();
    expect(heading.className).toBe('hero-copy');
  });

  it('pastes normalized plain text at the current selection', async () => {
    const store = editorStore();
    render(
      <CopyPatchContext.Provider value={{ store, apiBase: '/copy-api', locale: 'en' }}>
        <EditableText contentKey="hero.title">Original title</EditableText>
      </CopyPatchContext.Provider>,
    );

    const editable = document.querySelector<HTMLElement>('[data-copypatch="hero.title"]')!;
    await waitFor(() => expect(editable.textContent).toBe('Original title'));
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.paste(editable, {
      clipboardData: { getData: vi.fn().mockReturnValue('\nPasted') },
    });

    expect(store.getState().unsaved['hero.title']).toBe('Original title Pasted');
  });

  it('ignores a paste when the browser has no active text selection', async () => {
    const store = editorStore();
    render(
      <CopyPatchContext.Provider value={{ store, apiBase: '/copy-api', locale: 'en' }}>
        <EditableText contentKey="hero.title">Original title</EditableText>
      </CopyPatchContext.Provider>,
    );

    const editable = document.querySelector<HTMLElement>('[data-copypatch="hero.title"]')!;
    await waitFor(() => expect(editable.textContent).toBe('Original title'));
    window.getSelection()!.removeAllRanges();
    fireEvent.paste(editable, { clipboardData: { getData: vi.fn().mockReturnValue('Ignored') } });

    expect(store.getState().unsaved).toEqual({});
  });

  it('preserves line breaks and keeps focus when line breaks are allowed', async () => {
    const store = editorStore();
    render(
      <CopyPatchContext.Provider value={{ store, apiBase: '/copy-api', locale: 'en' }}>
        <EditableText contentKey="hero.title" allowLineBreaks>Original title</EditableText>
      </CopyPatchContext.Provider>,
    );

    const editable = document.querySelector<HTMLElement>('[data-copypatch="hero.title"]')!;
    await waitFor(() => expect(editable.textContent).toBe('Original title'));
    fireEvent.focus(editable);
    editable.textContent = 'First line\nSecond line';
    fireEvent.input(editable);
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(store.getState().unsaved['hero.title']).toBe('First line\nSecond line');
    expect(store.getState().activeEditingKey).toBe('hero.title');
  });
});

describe('editor controls', () => {
  it('submits a usable session response from the authentication modal', async () => {
    const store = new CopyPatchStore('en');
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      csrfToken: 'new-csrf',
      publishingMode: 'draft',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthModal apiBase="/copy-api" store={store} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock editor/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('new-csrf', 'draft'));
    expect(fetchMock).toHaveBeenCalledWith('/copy-api/session', expect.objectContaining({ method: 'POST' }));
  });

  it('surfaces a server authentication error and permits cancelling with Escape', async () => {
    const onCancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Incorrect passphrase' },
    }), { status: 401, headers: { 'content-type': 'application/json' } })));

    render(<AuthModal apiBase="/copy-api" store={new CopyPatchStore('en')} onSuccess={vi.fn()} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock editor/i }));

    expect(await screen.findByText('Incorrect passphrase')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete successful authentication response', async () => {
    const onSuccess = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      requiresCsrf: true,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    render(<AuthModal apiBase="/copy-api" store={new CopyPatchStore('en')} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'missing-csrf' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock editor/i }));

    expect(await screen.findByText('Unexpected authentication response from server.')).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the underlying network error when authentication cannot reach the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));

    render(<AuthModal apiBase="/copy-api" store={new CopyPatchStore('en')} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'retry-me' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock editor/i }));

    expect(await screen.findByText('Network unavailable')).toBeTruthy();
  });

  it('uses a safe network error message for non-Error authentication failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'));

    render(<AuthModal apiBase="/copy-api" store={new CopyPatchStore('en')} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'retry-me' } });
    fireEvent.click(screen.getByRole('button', { name: /unlock editor/i }));

    expect(await screen.findByText('Network error communicating with CopyPatch backend.')).toBeTruthy();
  });

  it('saves direct-mode edits with revision and CSRF preconditions', async () => {
    const store = editorStore();
    store.setUnsavedEdit('hero.title', 'Saved title');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      publishedRevision: 3,
      draftRevision: 1,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<Toolbar store={store} apiBase="/copy-api" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(store.getState().unsaved).toEqual({}));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      expectedPublishedRevision: 2,
      expectedDraftRevision: 1,
      changes: [{ key: 'hero.title', text: 'Saved title' }],
    });
    expect(store.getState()).toMatchObject({ publishedRevision: 3, published: { 'hero.title': 'Saved title' } });
  });

  it('refreshes the editor snapshot when a save conflicts with a newer revision', async () => {
    const store = editorStore();
    store.setUnsavedEdit('hero.title', 'Local title');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'REVISION_CONFLICT', message: 'Refresh before saving' },
      latest: {
        locale: 'en',
        publishedRevision: 8,
        draftRevision: 1,
        publishingMode: 'direct',
        published: { 'hero.title': 'Server title' },
        drafts: {},
      },
    }), { status: 409, headers: { 'content-type': 'application/json' } })));

    render(<Toolbar store={store} apiBase="/copy-api" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^save/i }));

    await waitFor(() => expect(store.getState().errorMessage).toBe('Refresh before saving'));
    expect(store.getState()).toMatchObject({
      publishedRevision: 8,
      published: { 'hero.title': 'Server title' },
      unsaved: { 'hero.title': 'Local title' },
    });
  });

  it('handles toolbar discard, exit, logout, and hover controls without leaving edit mode unexpectedly', () => {
    const store = editorStore();
    const onLogout = vi.fn();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    store.setUnsavedEdit('hero.title', 'Unsaved title');

    render(<Toolbar store={store} apiBase="/copy-api" onLogout={onLogout} />);
    const discard = screen.getByRole('button', { name: 'Discard' });
    fireEvent.mouseEnter(discard);
    fireEvent.mouseLeave(discard);
    fireEvent.click(discard);
    expect(store.getState().unsaved).toEqual({});

    act(() => {
      store.setUnsavedEdit('hero.title', 'Unsaved again');
    });
    const exit = screen.getByRole('button', { name: /exit/i });
    fireEvent.mouseEnter(exit);
    fireEvent.mouseLeave(exit);
    fireEvent.click(exit);
    expect(store.getState().isEditorActive).toBe(false);

    const logout = screen.getByRole('button', { name: 'Logout' });
    fireEvent.mouseEnter(logout);
    fireEvent.mouseLeave(logout);
    fireEvent.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps edit mode active when the user declines the unsaved-exit confirmation', () => {
    const store = editorStore();
    store.setUnsavedEdit('hero.title', 'Keep this edit');
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<Toolbar store={store} apiBase="/copy-api" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /exit/i }));

    expect(store.getState().isEditorActive).toBe(true);
    expect(store.getState().unsaved['hero.title']).toBe('Keep this edit');
  });

  it('leaves edits intact when discard is declined and exits immediately when no edits remain', () => {
    const store = editorStore();
    store.setUnsavedEdit('hero.title', 'Keep this edit');
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<Toolbar store={store} apiBase="/copy-api" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(store.getState().unsaved['hero.title']).toBe('Keep this edit');

    act(() => {
      store.discardUnsaved();
    });
    fireEvent.click(screen.getByRole('button', { name: /exit/i }));
    expect(store.getState().isEditorActive).toBe(false);
  });

  it('detaches nested data-attribute elements to preserve their host markup', async () => {
    const store = editorStore();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const target = document.createElement('p');
    target.setAttribute('data-copypatch', 'hero.title');
    target.innerHTML = '<em>Protected markup</em>';
    document.body.appendChild(target);

    function ObserverHarness() {
      useDataAttributeObserver(store);
      return null;
    }

    render(<ObserverHarness />);
    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    expect(target.getAttribute('contenteditable')).toBeNull();
    warning.mockRestore();
  });

  it('captures input and blur edits for enhanced data-attribute elements', async () => {
    const store = editorStore();
    const target = document.createElement('p');
    target.setAttribute('data-copypatch', 'hero.title');
    target.textContent = 'Original title';
    document.body.appendChild(target);

    function ObserverHarness() {
      useDataAttributeObserver(store);
      return null;
    }

    render(<ObserverHarness />);
    await waitFor(() => expect(target.contentEditable).toBe('plaintext-only'));
    fireEvent.focus(target);
    expect(store.getState().activeEditingKey).toBe('hero.title');

    target.textContent = 'Updated\ntitle';
    fireEvent.input(target);
    expect(store.getState().unsaved['hero.title']).toBe('Updated title');

    fireEvent.blur(target);
    expect(store.getState().activeEditingKey).toBeNull();
  });

  it('logs out through the editor portal and clears authentication even if the request succeeds', async () => {
    const store = editorStore();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        authenticated: true,
        requiresCsrf: false,
        publishingMode: 'direct',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        locale: 'en',
        publishedRevision: 2,
        draftRevision: 1,
        publishingMode: 'direct',
        published: { 'hero.title': 'Original title' },
        drafts: {},
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<CopyPatchEditor store={store} apiBase="/copy-api" />);
    const logout = await screen.findByRole('button', { name: 'Logout' });
    fireEvent.click(logout);

    await waitFor(() => expect(store.getState().isAuthenticated).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith('/copy-api/session', expect.objectContaining({ method: 'DELETE' }));
  });
});
