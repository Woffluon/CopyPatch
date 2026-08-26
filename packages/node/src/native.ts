import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { CopyPatchHandleContext } from '@copypatch/core';
import type { AdapterOptions, BackendLike } from './types.js';

export interface NodeHandlerOptions<THostAuth = unknown> extends AdapterOptions<THostAuth, IncomingMessage> {
  origin?: string | undefined;
}

export function createNodeHandler<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth> = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleNodeRequest(backend, request, response, options).catch(() => {
      if (!response.headersSent) response.statusCode = 500;
      if (!response.writableEnded) response.end();
    });
  };
}

export async function handleNodeRequest<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  request: IncomingMessage,
  response: ServerResponse,
  options: NodeHandlerOptions<THostAuth> = {},
): Promise<void> {
  const abort = new AbortController();
  const abortRequest = () => abort.abort();
  request.once('aborted', abortRequest);
  request.once('error', abortRequest);
  if ('once' in response && typeof response.once === 'function') response.once('close', abortRequest);

  try {
    const context = await options.context?.(request);
    const address = context?.clientAddress ?? request.socket.remoteAddress;
    const backendContext: CopyPatchHandleContext<THostAuth> = {
      ...context,
      ...(address ? { clientAddress: address } : {}),
      signal: abort.signal,
    };
    const result = await backend.handle(toRequest(request, options.origin), backendContext);
    await writeNodeResponse(response, result);
  } finally {
    request.off('aborted', abortRequest);
    request.off('error', abortRequest);
    if ('off' in response && typeof response.off === 'function') response.off('close', abortRequest);
  }
}

export function toRequest(request: IncomingMessage, configuredOrigin?: string): Request {
  const origin = configuredOrigin ?? requestOrigin(request.headers);
  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(new URL(request.url ?? '/', origin), {
    method,
    headers: request.headers as HeadersInit,
    body: hasBody ? Readable.toWeb(request) as ReadableStream<Uint8Array> : undefined,
    duplex: hasBody ? 'half' : undefined,
  } as RequestInit);
}

function requestOrigin(headers: IncomingHttpHeaders): string {
  const host = headers.host ?? 'localhost';
  const forwarded = headers['x-forwarded-proto'];
  const protocol = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : 'http';
  return `${protocol === 'https' ? 'https' : 'http'}://${host}`;
}

export async function writeNodeResponse(response: Pick<ServerResponse, 'setHeader' | 'end' | 'write'> & { writableEnded?: boolean }, result: Response): Promise<void> {
  const setCookies = getSetCookies(result.headers);
  result.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') response.setHeader(name, value);
  });
  if (setCookies.length > 0) response.setHeader('set-cookie', setCookies);

  const target = response as ServerResponse;
  target.statusCode = result.status;
  if (!result.body) {
    response.end();
    return;
  }
  if (typeof response.write !== 'function') {
    response.end(await result.text());
    return;
  }
  for await (const chunk of Readable.fromWeb(result.body as unknown as import('node:stream/web').ReadableStream)) {
    if (!response.write(chunk)) await new Promise<void>((resolve) => (target as unknown as NodeJS.EventEmitter).once('drain', resolve));
  }
  response.end();
}

function getSetCookies(headers: Headers): string[] {
  const values = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (values) return values;
  const joined = headers.get('set-cookie');
  return joined ? [joined] : [];
}
