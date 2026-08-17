import { ContentSnapshot } from '@copypatch/core';

export class SnapshotCache {
  private snapshots = new Map<string, ContentSnapshot>();

  get(locale: string): ContentSnapshot | undefined {
    return this.snapshots.get(locale);
  }

  set(locale: string, snapshot: ContentSnapshot): void {
    // Store immutable copy
    this.snapshots.set(locale, Object.freeze({
      revision: snapshot.revision,
      content: Object.freeze({ ...snapshot.content })
    }));
  }

  delete(locale: string): void {
    this.snapshots.delete(locale);
  }

  clear(): void {
    this.snapshots.clear();
  }
}
