import type { APIContext, APIRoute } from 'astro';
import { getCopyPatchBackend } from '../../../../lib/copypatch';

export const prerender = false;

const handle: APIRoute = async ({ request, clientAddress }: APIContext) => {
  const backend = await getCopyPatchBackend();
  return backend.handle(request, { clientAddress });
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
