import { getCopyPatchBackend } from '../lib/copypatch.server';

async function handle(request: Request): Promise<Response> {
  return (await getCopyPatchBackend()).handle(request);
}

// A resource route has no default component and forwards every request method.
export function loader({ request }: { request: Request }): Promise<Response> {
  return handle(request);
}

export function action({ request }: { request: Request }): Promise<Response> {
  return handle(request);
}
