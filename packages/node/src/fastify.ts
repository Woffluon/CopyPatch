import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest, type NodeHandlerOptions } from './native.js';
import type { BackendLike } from './types.js';

export interface FastifyRequestLike { raw: IncomingMessage; }
export interface FastifyReplyLike { raw: ServerResponse; hijack(): void; }

/** Register this route before Fastify content-type parsers so `request.raw` is still readable. */
export function fastifyCopyPatchHandler<THostAuth = unknown, TRequest extends FastifyRequestLike = FastifyRequestLike>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth, TRequest> = {},
): (request: TRequest, reply: FastifyReplyLike) => Promise<void> {
  return async (request, reply) => {
    reply.hijack();
    await handleNodeRequest(backend, request.raw, reply.raw, options, request);
  };
}

export function fastifyCopyPatchPlugin<THostAuth = unknown, TRequest extends FastifyRequestLike = FastifyRequestLike>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth, TRequest> = {},
): { handler: ReturnType<typeof fastifyCopyPatchHandler<THostAuth, TRequest>> } {
  return { handler: fastifyCopyPatchHandler(backend, options) };
}
