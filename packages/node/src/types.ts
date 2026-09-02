import type { CopyPatchBackend } from '@copypatch/backend';
import type { CopyPatchHandleContext } from '@copypatch/core';

export type HandleContextResolver<THostAuth = unknown, TContextInput = unknown> = (
  request: TContextInput,
) => CopyPatchHandleContext<THostAuth> | Promise<CopyPatchHandleContext<THostAuth>>;

export interface AdapterOptions<THostAuth = unknown, TContextInput = unknown> {
  context?: HandleContextResolver<THostAuth, TContextInput> | undefined;
}

export type BackendLike<THostAuth = unknown> = Pick<CopyPatchBackend<THostAuth>, 'handle'>;
