import type {
  ApiErrorResponse,
  ContentSnapshot,
  CopyPatchHandleContext,
  CopyPatchRequestHandler,
  PublishedSnapshotReader,
} from '@copypatch/core';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type CopyPatchRouteHandler = (request: Request) => Promise<Response>;

export interface CopyPatchRouteHandlers {
  GET: CopyPatchRouteHandler;
  POST: CopyPatchRouteHandler;
  PUT: CopyPatchRouteHandler;
  PATCH: CopyPatchRouteHandler;
  DELETE: CopyPatchRouteHandler;
  HEAD: CopyPatchRouteHandler;
  OPTIONS: CopyPatchRouteHandler;
}

export interface CopyPatchRouteHandlerOptions<THostAuth = unknown> {
  /** Resolves opaque host state without putting it in HTTP headers. */
  resolveContext?: (
    request: Request,
  ) => CopyPatchHandleContext<THostAuth> | undefined | Promise<CopyPatchHandleContext<THostAuth> | undefined>;
  /** Explicitly accepts one shared backend rate-limit bucket when no trusted address is available. */
  unsafeRequestWithoutClientAddress?: 'shared-bucket';
}

/**
 * Adapts a CopyPatch backend to an App Router catch-all `route.ts` file.
 * Requests and responses pass through without cloning or serialization.
 */
export function createCopyPatchRouteHandlers<THostAuth = unknown>(
  backend: CopyPatchRequestHandler<THostAuth>,
  options: CopyPatchRouteHandlerOptions<THostAuth> = {},
): CopyPatchRouteHandlers {
  const handle: CopyPatchRouteHandler = async (request) => {
    const context = options.resolveContext ? await options.resolveContext(request) : undefined;
    const hasClientAddress = typeof context?.clientAddress === 'string'
      && context.clientAddress.trim().length > 0;
    if (
      UNSAFE_METHODS.has(request.method.toUpperCase())
      && !hasClientAddress
      && options.unsafeRequestWithoutClientAddress !== 'shared-bucket'
    ) {
      const body: ApiErrorResponse = {
        error: {
          code: 'CLIENT_ADDRESS_UNAVAILABLE',
          message: 'A trusted client address is required for unsafe requests.',
        },
      };
      return Response.json(body, {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
    return backend.handle(request, context);
  };

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    PATCH: handle,
    DELETE: handle,
    HEAD: handle,
    OPTIONS: handle,
  };
}

export interface ReadPublishedSnapshotOptions {
  /** Used only when the backend read rejects, so the host can keep rendering safely. */
  readonly fallback?: ContentSnapshot;
}

function freezeSnapshot(snapshot: ContentSnapshot): ContentSnapshot {
  const content = Object.freeze({ ...snapshot.content });
  return Object.freeze({ revision: snapshot.revision, content });
}

/** Reads published copy in SSR/RSC directly from the colocated backend. */
export async function readPublishedSnapshot(
  backend: PublishedSnapshotReader,
  locale: string,
  options: ReadPublishedSnapshotOptions = {},
): Promise<ContentSnapshot> {
  try {
    return freezeSnapshot(await backend.readPublished(locale));
  } catch {
    return freezeSnapshot(options.fallback ?? { revision: 1, content: {} });
  }
}
