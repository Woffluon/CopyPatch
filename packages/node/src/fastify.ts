import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest, type NodeHandlerOptions } from './native.js';
import type { BackendLike } from './types.js';

export interface FastifyRequestLike { raw: IncomingMessage; }
export interface FastifyReplyLike { raw: ServerResponse; hijack(): void; }

/** Register this route before Fastify content-type parsers so `request.raw` is still readable. */
export function fastifyCopyPatchHandler<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth> = {},
): (request: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void> {
  return async (request, reply) => {
    reply.hijack();
    await handleNodeRequest(backend, request.raw, reply.raw, {
      ...options,
      ...(options.context ? { context: async (raw: IncomingMessage) => options.context!(raw) } : {}),
    });
  };
}

export function fastifyCopyPatchPlugin<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth> = {},
): { handler: ReturnType<typeof fastifyCopyPatchHandler<THostAuth>> } {
  return { handler: fastifyCopyPatchHandler(backend, options) };
}
