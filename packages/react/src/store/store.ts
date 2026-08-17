import { ContentSnapshot, EditorSnapshot, PublishingMode } from '@copypatch/core';

export type Listener = () => void;

export interface CopyPatchStoreState {
  locale: string;
  isEditorActive: boolean;
  isAuthenticated: boolean;
  csrfToken: string | null;
  publishingMode: PublishingMode;
  published: Record<string, string>;
  drafts: Record<string, string>;
  unsaved: Record<string, string>;
  publishedRevision: number;
  draftRevision: number;
  activeEditingKey: string | null;
  errorMessage: string | null;
  isSaving: boolean;
}

export class CopyPatchStore {
  private state: CopyPatchStoreState;
  private keyListeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private fallbackRegistry = new Map<string, string>();

  constructor(initialLocale: string, initialSnapshot?: ContentSnapshot) {
    this.state = {
      locale: initialLocale,
      isEditorActive: false,
      isAuthenticated: false,
      csrfToken: null,
      publishingMode: 'direct',
      published: initialSnapshot?.content ? { ...initialSnapshot.content } : {},
      drafts: {},
      unsaved: {},
      publishedRevision: initialSnapshot?.revision ?? 1,
      draftRevision: 1,
      activeEditingKey: null,
      errorMessage: null,
      isSaving: false,
    };
  }

  getState(): CopyPatchStoreState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
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
      if (set?.size === 0) {
        this.keyListeners.delete(key);
      }
    };
  }

  private notify(changedKeys?: string[]) {
    for (const listener of this.globalListeners) {
      listener();
    }
    if (changedKeys) {
      for (const key of changedKeys) {
        const listeners = this.keyListeners.get(key);
        if (listeners) {
          for (const listener of listeners) {
            listener();
          }
        }
      }
    } else {
      for (const keySet of this.keyListeners.values()) {
        for (const listener of keySet) {
          listener();
        }
      }
    }
  }

  registerFallback(key: string, fallback: string): void {
    if (process.env.NODE_ENV !== 'production') {
      const existing = this.fallbackRegistry.get(key);
      if (existing !== undefined && existing !== fallback) {
        console.warn(
          `[CopyPatch Warning] Duplicate contentKey "${key}" registered with conflicting fallback texts:\n` +
          `  - Existing: "${existing}"\n` +
          `  - New:      "${fallback}"`
        );
      }
    }
    this.fallbackRegistry.set(key, fallback);
  }

  /**
   * Resolve persistent baseline content without unsaved edits:
   * draft (if draft mode / exists) -> published -> fallback
   */
  getBaseContent(key: string, fallback?: string): string {
    if (key in this.state.drafts) {
      return this.state.drafts[key] ?? '';
    }
    if (key in this.state.published) {
      return this.state.published[key] ?? '';
    }
    return fallback ?? this.fallbackRegistry.get(key) ?? '';
  }

  /**
   * Resolve content for key with priority:
   * unsaved -> draft (if editor) -> published -> fallback
   */
  resolveContent(key: string, fallback: string): string {
    this.registerFallback(key, fallback);

    if (this.state.isEditorActive) {
      if (key in this.state.unsaved) {
        return this.state.unsaved[key] ?? '';
      }
      if (key in this.state.drafts) {
        return this.state.drafts[key] ?? '';
      }
    }

    if (key in this.state.published) {
      return this.state.published[key] ?? '';
    }

    return fallback;
  }

  setLocale(locale: string, snapshot?: ContentSnapshot) {
    if (this.state.locale === locale && !snapshot) return;

    this.state = {
      ...this.state,
      locale,
      published: snapshot?.content ? { ...snapshot.content } : {},
      publishedRevision: snapshot?.revision ?? 1,
      drafts: {},
      unsaved: {},
    };
    this.notify();
  }

  setPublishedSnapshot(snapshot: ContentSnapshot) {
    const keys = Object.keys(snapshot.content);
    this.state = {
      ...this.state,
      published: { ...snapshot.content },
      publishedRevision: snapshot.revision,
    };
    this.notify(keys);
  }

  setEditorSnapshot(snapshot: EditorSnapshot) {
    this.state = {
      ...this.state,
      locale: snapshot.locale,
      publishedRevision: snapshot.publishedRevision,
      draftRevision: snapshot.draftRevision,
      publishingMode: snapshot.publishingMode,
      published: { ...snapshot.published },
      drafts: { ...snapshot.drafts },
    };
    this.notify();
  }

  setEditorActive(active: boolean) {
    if (this.state.isEditorActive === active) return;
    this.state = { ...this.state, isEditorActive: active };
    this.notify();
  }

  setAuthenticated(authenticated: boolean, csrfToken?: string | null, mode?: PublishingMode) {
    this.state = {
      ...this.state,
      isAuthenticated: authenticated,
      csrfToken: csrfToken ?? this.state.csrfToken,
      publishingMode: mode ?? this.state.publishingMode,
    };
    this.notify();
  }

  setActiveEditingKey(key: string | null) {
    if (this.state.activeEditingKey === key) return;
    this.state = { ...this.state, activeEditingKey: key };
    this.notify();
  }

  setUnsavedEdit(key: string, text: string) {
    const base = this.getBaseContent(key);
    const currentUnsaved = this.state.unsaved[key];

    // If edited text is identical to base content, clear dirty state
    if (text === base) {
      if (key in this.state.unsaved) {
        const nextUnsaved = { ...this.state.unsaved };
        delete nextUnsaved[key];
        this.state = { ...this.state, unsaved: nextUnsaved };
        this.notify([key]);
      }
      return;
    }

    // Don't trigger redundant notification if text hasn't changed
    if (currentUnsaved === text) return;

    const nextUnsaved = { ...this.state.unsaved, [key]: text };
    this.state = { ...this.state, unsaved: nextUnsaved };
    this.notify([key]);
  }

  discardUnsaved() {
    const changedKeys = Object.keys(this.state.unsaved);
    this.state = { ...this.state, unsaved: {} };
    this.notify(changedKeys);
  }

  clearDrafts() {
    const changedKeys = Object.keys(this.state.drafts);
    this.state = { ...this.state, drafts: {} };
    this.notify(changedKeys);
  }

  setSaving(isSaving: boolean, errorMessage: string | null = null) {
    this.state = { ...this.state, isSaving, errorMessage };
    this.notify();
  }

  destroy(): void {
    this.globalListeners.clear();
    this.keyListeners.clear();
    this.fallbackRegistry.clear();
  }
}
