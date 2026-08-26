import type { CopyPatchBackend } from '@copypatch/backend';
import type { CopyPatchHandleContext } from '@copypatch/core';

export type HandleContextResolver<THostAuth = unknown, TRequest = unknown> = (
  request: TRequest,
) => CopyPatchHandleContext<THostAuth> | Promise<CopyPatchHandleContext<THostAuth>>;

export interface AdapterOptions<THostAuth = unknown, TRequest = unknown> {
  context?: HandleContextResolver<THostAuth, TRequest> | undefined;
}

export type BackendLike<THostAuth = unknown> = Pick<CopyPatchBackend<THostAuth>, 'handle'>;
