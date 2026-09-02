import { describe, it, expect, vi } from 'vitest';
import { CopyPatchStore } from '../src/store/store.js';

describe('React CopyPatchStore', () => {
  it('resolves content hierarchy correctly (fallback -> published -> draft -> unsaved)', () => {
    const store = new CopyPatchStore('en', {
      revision: 1,
      content: {
        'title.key': 'Published Title',
      },
    });

    // 1. Unregistered key resolves fallback
    expect(store.resolveContent('non.existent', 'Default Fallback')).toBe('Default Fallback');

    // 2. Published override
    expect(store.resolveContent('title.key', 'Default Fallback')).toBe('Published Title');

    // 3. Enable editor mode & add saved draft
    store.setEditorActive(true);
    store.setEditorSnapshot({
      locale: 'en',
      publishedRevision: 1,
      draftRevision: 2,
      publishingMode: 'draft',
      published: { 'title.key': 'Published Title' },
      drafts: { 'title.key': 'Draft Title' },
    });
    expect(store.resolveContent('title.key', 'Default Fallback')).toBe('Draft Title');

    // 4. Local unsaved edit takes precedence in editor mode
    store.setUnsavedEdit('title.key', 'Unsaved In-Memory Title');
    expect(store.resolveContent('title.key', 'Default Fallback')).toBe('Unsaved In-Memory Title');

    // 5. Visitors (editor inactive) only see published
    store.setEditorActive(false);
    expect(store.resolveContent('title.key', 'Default Fallback')).toBe('Published Title');
  });

  it('granularly notifies key-level subscribers without global rerender overhead', () => {
    const store = new CopyPatchStore('en');
    let key1Fired = 0;
    let key2Fired = 0;

    store.subscribeKey('key1', () => {
      key1Fired++;
    });
    store.subscribeKey('key2', () => {
      key2Fired++;
    });

    store.setUnsavedEdit('key1', 'New Val');
    expect(key1Fired).toBe(1);
    expect(key2Fired).toBe(0); // key2 untouched

    store.setUnsavedEdit('key2', 'New Val 2');
    expect(key1Fired).toBe(1);
    expect(key2Fired).toBe(1);
  });

  it('does not register unsaved edit when value matches baseline content and clears dirty state when reverted', () => {
    const store = new CopyPatchStore('en', {
      revision: 1,
      content: {
        'hero.title': 'Original Title',
      },
    });
    store.setEditorActive(true);

    // Initial state has 0 unsaved edits
    expect(Object.keys(store.getState().unsaved).length).toBe(0);

    // Setting same text as base content should not dirty state
    store.setUnsavedEdit('hero.title', 'Original Title');
    expect(Object.keys(store.getState().unsaved).length).toBe(0);

    // Setting new text registers 1 unsaved edit
    store.setUnsavedEdit('hero.title', 'Changed Title');
    expect(Object.keys(store.getState().unsaved).length).toBe(1);
    expect(store.getState().unsaved['hero.title']).toBe('Changed Title');

    // Reverting text back to baseline clears unsaved edit
    store.setUnsavedEdit('hero.title', 'Original Title');
    expect(Object.keys(store.getState().unsaved).length).toBe(0);
  });

  it('clears the focused key when changing locale so edits cannot remain attached to another locale', () => {
    const store = new CopyPatchStore('en');
    store.setActiveEditingKey('hero.title');

    store.setLocale('tr');

    expect(store.getState().activeEditingKey).toBeNull();
  });

  it('keeps immutable snapshots stable until one real mutation and notifies each subscriber once', () => {
    const store = new CopyPatchStore('en', {
      revision: 1,
      content: { 'hero.title': 'Original title' },
    });
    const listener = vi.fn();
    store.subscribe(listener);
    store.subscribeKey('hero.title', listener);

    const initial = store.getState();
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.published)).toBe(true);
    expect(Reflect.set(initial.published, 'hero.title', 'Tampered title')).toBe(false);
    expect(store.getState()).toBe(initial);
    expect(store.getState().published['hero.title']).toBe('Original title');

    store.setEditorActive(false);
    expect(store.getState()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();

    store.setUnsavedEdit('hero.title', 'Edited title');
    const edited = store.getState();
    expect(edited).not.toBe(initial);
    expect(Object.isFrozen(edited.unsaved)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    store.setUnsavedEdit('hero.title', 'Edited title');
    expect(store.getState()).toBe(edited);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
