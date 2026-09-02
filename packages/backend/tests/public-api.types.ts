import type {
  CopyPatchRequestHandler,
  PublishedSnapshotReader,
} from '@copypatch/core';
import {
  createCopyPatchBackend,
  type CopyPatchBackend,
} from '../src/index.js';

// @ts-expect-error SESSION_COOKIE_NAME is an internal implementation detail.
import { SESSION_COOKIE_NAME } from '../src/index.js';
// @ts-expect-error CopyPatchBackendOptions is inferred from createCopyPatchBackend, not exported.
import type { CopyPatchBackendOptions } from '../src/index.js';
// @ts-expect-error generateToken is an internal security helper.
import { generateToken } from '../src/index.js';
// @ts-expect-error hashesEqual is an internal security helper.
import { hashesEqual } from '../src/index.js';
// @ts-expect-error hashRateLimitKey is an internal security helper.
import { hashRateLimitKey } from '../src/index.js';
// @ts-expect-error hashToken is an internal security helper.
import { hashToken } from '../src/index.js';
// @ts-expect-error verifyPassphrase is an internal security helper.
import { verifyPassphrase } from '../src/index.js';

type Expect<T extends true> = T;
type BackendUsesCorePorts<THostAuth> = Expect<
  CopyPatchBackend<THostAuth> extends CopyPatchRequestHandler<THostAuth> & PublishedSnapshotReader
    ? true
    : false
>;

const backendUsesCorePorts: BackendUsesCorePorts<{ subject: string }> = true;
const acceptsOptions = (
  options: Parameters<typeof createCopyPatchBackend>[0],
): Parameters<typeof createCopyPatchBackend>[0] => options;
const runtimeExports: readonly unknown[] = [
  createCopyPatchBackend,
];

void backendUsesCorePorts;
void acceptsOptions;
void runtimeExports;
void SESSION_COOKIE_NAME;
void generateToken;
void hashesEqual;
void hashRateLimitKey;
void hashToken;
void verifyPassphrase;
