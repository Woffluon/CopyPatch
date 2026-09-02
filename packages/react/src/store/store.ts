import type { ContentSnapshot, EditorSnapshot, PublishingMode } from '@copypatch/core';

type Listener = () => void;

export interface CopyPatchStoreState {
  readonly locale: string;
  readonly isEditorActive: boolean;
  readonly isAuthenticated: boolean;
  readonly csrfToken: string | null;
  readonly publishingMode: PublishingMode;
  readonly published: Readonly<Record<string, string>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly unsaved: Readonly<Record<string, string>>;
  readonly publishedRevision: number;
  readonly draftRevision: number;
  readonly activeEditingKey: string | null;
  readonly errorMessage: string | null;
  readonly isSaving: boolean;
}

export interface CopyPatchStoreApi {
  getState(): CopyPatchStoreState;
  subscribe(listener: () => void): () => void;
  subscribeKey(key: string, listener: () => void): () => void;
  registerFallback(key: string, fallback: string): void;
  getBaseContent(key: string, fallback?: string): string;
  resolveContent(key: string, fallback: string): string;
  setLocale(locale: string, snapshot?: ContentSnapshot): void;
  setPublishedSnapshot(snapshot: ContentSnapshot): void;
  setEditorSnapshot(snapshot: EditorSnapshot): void;
  setEditorActive(active: boolean): void;
  setAuthenticated(authenticated: boolean, csrfToken?: string | null, mode?: PublishingMode): void;
  setActiveEditingKey(key: string | null): void;
  setUnsavedEdit(key: string, text: string): void;
  discardUnsaved(): void;
  clearDrafts(): void;
  setSaving(isSaving: boolean, errorMessage?: string | null): void;
}

class CopyPatchStore implements CopyPatchStoreApi {
  private state: CopyPatchStoreState;
  private keyListeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private fallbackRegistry = new Map<string, string>();

  constructor(initialLocale: string, initialSnapshot?: ContentSnapshot) {
    this.state = createSnapshot({
      locale: initialLocale,
      isEditorActive: false,
      isAuthenticated: false,
      csrfToken: null,
      publishingMode: 'direct',
      published: initialSnapshot?.content ?? {},
      drafts: {},
      unsaved: {},
      publishedRevision: initialSnapshot?.revision ?? 1,
      draftRevision: 1,
      activeEditingKey: null,
      errorMessage: null,
      isSaving: false,
    });
  }

  getState(): CopyPatchStoreState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  subscribeKey(key: string, listener: Listener): () => void {
    let set = this.keyListeners.get(key);
    if (!set) {
      set = new Set();
      this.keyListeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) this.keyListeners.delete(key);
    };
  }

  registerFallback(key: string, fallback: string): void {
    if (process.env.NODE_ENV !== 'production') {
      const existing = this.fallbackRegistry.get(key);
      if (existing !== undefined && existing !== fallback) {
        console.warn(
          `[CopyPatch Warning] Duplicate contentKey "${key}" registered with conflicting fallback texts:\n` +
          `  - Existing: "${existing}"\n` +
          `  - New:      "${fallback}"`,
        );
      }
    }
    this.fallbackRegistry.set(key, fallback);
  }

  getBaseContent(key: string, fallback?: string): string {
    if (key in this.state.drafts) return this.state.drafts[key] ?? '';
    if (key in this.state.published) return this.state.published[key] ?? '';
    return fallback ?? this.fallbackRegistry.get(key) ?? '';
  }

  resolveContent(key: string, fallback: string): string {
    this.registerFallback(key, fallback);
    if (this.state.isEditorActive) {
      if (key in this.state.unsaved) return this.state.unsaved[key] ?? '';
      if (key in this.state.drafts) return this.state.drafts[key] ?? '';
    }
    if (key in this.state.published) return this.state.published[key] ?? '';
    return fallback;
  }

  setLocale(locale: string, snapshot?: ContentSnapshot): void {
    if (this.state.locale === locale && snapshot === undefined) return;
    this.commit({
      ...this.state,
      locale,
      published: snapshot?.content ?? {},
      publishedRevision: snapshot?.revision ?? 1,
      drafts: {},
      unsaved: {},
      activeEditingKey: null,
    });
  }

  setPublishedSnapshot(snapshot: ContentSnapshot): void {
    this.commit({
      ...this.state,
      published: snapshot.content,
      publishedRevision: snapshot.revision,
    }, changedKeys(this.state.published, snapshot.content));
  }

  setEditorSnapshot(snapshot: EditorSnapshot): void {
    this.commit({
      ...this.state,
      locale: snapshot.locale,
      publishedRevision: snapshot.publishedRevision,
      draftRevision: snapshot.draftRevision,
      publishingMode: snapshot.publishingMode,
      published: snapshot.published,
      drafts: snapshot.drafts,
    });
  }

  setEditorActive(active: boolean): void {
    this.commit({ ...this.state, isEditorActive: active });
  }

  setAuthenticated(
    authenticated: boolean,
    csrfToken: string | null = null,
    mode?: PublishingMode,
  ): void {
    this.commit({
      ...this.state,
      isAuthenticated: authenticated,
      csrfToken,
      publishingMode: mode ?? this.state.publishingMode,
    });
  }

  setActiveEditingKey(key: string | null): void {
    this.commit({ ...this.state, activeEditingKey: key });
  }

  setUnsavedEdit(key: string, text: string): void {
    const base = this.getBaseContent(key);
    if (text === base) {
      if (!(key in this.state.unsaved)) return;
      const unsaved = { ...this.state.unsaved };
      delete unsaved[key];
      this.commit({ ...this.state, unsaved }, [key]);
      return;
    }
    if (this.state.unsaved[key] === text) return;
    this.commit({ ...this.state, unsaved: { ...this.state.unsaved, [key]: text } }, [key]);
  }

  discardUnsaved(): void {
    const keys = Object.keys(this.state.unsaved);
    if (keys.length === 0) return;
    this.commit({ ...this.state, unsaved: {} }, keys);
  }

  clearDrafts(): void {
    const keys = Object.keys(this.state.drafts);
    if (keys.length === 0) return;
    this.commit({ ...this.state, drafts: {} }, keys);
  }

  setSaving(isSaving: boolean, errorMessage: string | null = null): void {
    this.commit({ ...this.state, isSaving, errorMessage });
  }

  destroy(): void {
    this.globalListeners.clear();
    this.keyListeners.clear();
    this.fallbackRegistry.clear();
  }

  private commit(next: CopyPatchStoreState, keys?: readonly string[]): void {
    if (statesEqual(this.state, next)) return;
    this.state = createSnapshot(next);
    this.notify(keys);
  }

  private notify(changedKeys?: readonly string[]): void {
    const listeners = new Set(this.globalListeners);
    if (changedKeys) {
      for (const key of changedKeys) {
        for (const listener of this.keyListeners.get(key) ?? []) listeners.add(listener);
      }
    } else {
      for (const keyListeners of this.keyListeners.values()) {
        for (const listener of keyListeners) listeners.add(listener);
      }
    }
    for (const listener of listeners) listener();
  }
}

export { CopyPatchStore };

function createSnapshot(state: CopyPatchStoreState): CopyPatchStoreState {
  return Object.freeze({
    ...state,
    published: Object.freeze({ ...state.published }),
    drafts: Object.freeze({ ...state.drafts }),
    unsaved: Object.freeze({ ...state.unsaved }),
  });
}

function statesEqual(left: CopyPatchStoreState, right: CopyPatchStoreState): boolean {
  return (
    left.locale === right.locale &&
    left.isEditorActive === right.isEditorActive &&
    left.isAuthenticated === right.isAuthenticated &&
    left.csrfToken === right.csrfToken &&
    left.publishingMode === right.publishingMode &&
    recordsEqual(left.published, right.published) &&
    recordsEqual(left.drafts, right.drafts) &&
    recordsEqual(left.unsaved, right.unsaved) &&
    left.publishedRevision === right.publishedRevision &&
    left.draftRevision === right.draftRevision &&
    left.activeEditingKey === right.activeEditingKey &&
    left.errorMessage === right.errorMessage &&
    left.isSaving === right.isSaving
  );
}

function recordsEqual(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function changedKeys(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => left[key] !== right[key]);
}
