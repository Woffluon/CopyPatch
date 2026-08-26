import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest, type NodeHandlerOptions } from './native.js';
import type { BackendLike } from './types.js';

export interface ExpressRequest extends IncomingMessage {
  body?: unknown;
}

export type ExpressNext = (error?: Error) => void;

/** Mount this middleware before Express body parsers and any SPA fallback. */
export function expressMiddleware<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth> = {},
): (request: ExpressRequest, response: ServerResponse, next: ExpressNext) => Promise<void> {
  return async (request, response, next) => {
    if (request.readableEnded && request.method !== 'GET' && request.method !== 'HEAD') {
      next(new Error('CopyPatch Express middleware must be mounted before body parsers because the request body has already been consumed.'));
      return;
    }
    try {
      await handleNodeRequest(backend, request, response, options);
    } catch (error) {
      next(error instanceof Error ? error : new Error('CopyPatch Express middleware failed.'));
    }
  };
}
