import { createCopyPatchRouteHandlers } from '@copypatch/next/server';
import { bootstrapCopyPatch } from '../../../../../lib/copypatch';

export const runtime = 'nodejs';

type RouteHandler = (request: Request) => Promise<Response>;

function route(method: keyof ReturnType<typeof createCopyPatchRouteHandlers>): RouteHandler {
  return async (request) => {
    const backend = await bootstrapCopyPatch();
    return createCopyPatchRouteHandlers(backend, {
      // This single-instance example deliberately shares one rate-limit bucket.
      // Production hosts should resolve a trusted platform client address.
      unsafeRequestWithoutClientAddress: 'shared-bucket',
    })[method](request);
  };
}

export const GET = route('GET');
export const POST = route('POST');
export const PUT = route('PUT');
export const PATCH = route('PATCH');
export const DELETE = route('DELETE');
export const HEAD = route('HEAD');
export const OPTIONS = route('OPTIONS');
