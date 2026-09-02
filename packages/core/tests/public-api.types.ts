import type {
  ContentSnapshot,
  CopyPatchAuthAdapter,
  CopyPatchRequestHandler,
  PublishedSnapshotReader,
} from '../src/index.js';

const requestHandler: CopyPatchRequestHandler = {
  handle: async () => new Response(null, { status: 204 }),
};
const snapshotReader: PublishedSnapshotReader = {
  readPublished: async () => ({ revision: 1, content: {} }),
};

const invalidAdapter: CopyPatchAuthAdapter = {
  authenticate: async () => null,
  // @ts-expect-error Mutation verification must resolve to an explicit boolean.
  verifyMutation: async () => undefined,
};

function assertDeepReadonly(snapshot: ContentSnapshot): void {
  // @ts-expect-error Published revisions are readonly.
  snapshot.revision = 2;
  // @ts-expect-error Published content entries are readonly.
  snapshot.content.title = 'mutated';
}

void requestHandler;
void snapshotReader;
void invalidAdapter;
void assertDeepReadonly;
