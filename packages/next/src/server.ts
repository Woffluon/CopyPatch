import type { CopyPatchBackend } from '@copypatch/backend';
import type { ContentSnapshot, CopyPatchHandleContext } from '@copypatch/core';

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
}

/**
 * Adapts a CopyPatch backend to an App Router catch-all `route.ts` file.
 * Requests and responses pass through without cloning or serialization.
 */
export function createCopyPatchRouteHandlers<THostAuth = unknown>(
  backend: CopyPatchBackend<THostAuth>,
  options: CopyPatchRouteHandlerOptions<THostAuth> = {},
): CopyPatchRouteHandlers {
  const handle: CopyPatchRouteHandler = async (request) => {
    const context = options.resolveContext ? await options.resolveContext(request) : undefined;
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
  fallback?: ContentSnapshot;
}

export const EMPTY_CONTENT_SNAPSHOT: ContentSnapshot = { revision: 1, content: {} };

/** Reads published copy in SSR/RSC directly from the colocated backend. */
export async function readPublishedSnapshot(
  backend: Pick<CopyPatchBackend, 'readPublished'>,
  locale: string,
  options: ReadPublishedSnapshotOptions = {},
): Promise<ContentSnapshot> {
  try {
    return await backend.readPublished(locale);
  } catch {
    return options.fallback ?? EMPTY_CONTENT_SNAPSHOT;
  }
}
