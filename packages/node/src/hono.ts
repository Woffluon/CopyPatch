import type { AdapterOptions, BackendLike } from './types.js';

export interface HonoContextLike { req: { raw: Request }; }

export function createHonoHandler<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  options: AdapterOptions<THostAuth, HonoContextLike> = {},
): (context: HonoContextLike) => Promise<Response> {
  return async (context) => backend.handle(context.req.raw, await options.context?.(context));
}
