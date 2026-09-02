import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { CopyPatchHandleContext } from '@copypatch/core';
import type { AdapterOptions, BackendLike } from './types.js';

export interface NodeHandlerOptions<THostAuth = unknown, TContextInput = IncomingMessage> extends AdapterOptions<THostAuth, TContextInput> {
  origin?: string | undefined;
  /** Honor x-forwarded-host and x-forwarded-proto only behind a trusted proxy. */
  trustProxy?: boolean | undefined;
}

export function createNodeHandler<THostAuth = unknown>(
  backend: BackendLike<THostAuth>,
  options: NodeHandlerOptions<THostAuth> = {},
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleNodeRequest(backend, request, response, options, request).catch(() => {
      if (!response.headersSent) response.statusCode = 500;
      if (!response.writableEnded) response.end();
    });
  };
}

export async function handleNodeRequest<THostAuth = unknown, TContextInput = IncomingMessage>(
  backend: BackendLike<THostAuth>,
  request: IncomingMessage,
  response: ServerResponse,
  options: NodeHandlerOptions<THostAuth, TContextInput> = {},
  contextInput: TContextInput,
): Promise<void> {
  const transportAbort = createTransportAbortSignal(request, response);

  try {
    const context = await options.context?.(contextInput);
    const abort = combineAbortSignals(transportAbort.signal, context?.signal);
    const address = context?.clientAddress ?? request.socket.remoteAddress;
    const backendContext: CopyPatchHandleContext<THostAuth> = {
      ...context,
      ...(address ? { clientAddress: address } : {}),
      signal: abort.signal,
    };
    try {
      const result = await backend.handle(toRequest(request, options.origin, options.trustProxy), backendContext);
      await writeNodeResponse(response, result);
    } finally {
      abort.cleanup();
    }
  } finally {
    transportAbort.cleanup();
  }
}

export function toRequest(request: IncomingMessage, configuredOrigin?: string, trustProxy = false): Request {
  const origin = configuredOrigin ?? requestOrigin(request.headers, trustProxy);
  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(new URL(request.url ?? '/', origin), {
    method,
    headers: request.headers as HeadersInit,
    body: hasBody ? Readable.toWeb(request) as ReadableStream<Uint8Array> : undefined,
    duplex: hasBody ? 'half' : undefined,
  } as RequestInit);
}

function requestOrigin(headers: IncomingHttpHeaders, trustProxy: boolean): string {
  const host = trustProxy ? firstForwardedValue(headers['x-forwarded-host']) ?? headers.host ?? 'localhost' : headers.host ?? 'localhost';
  const protocol = trustProxy ? firstForwardedValue(headers['x-forwarded-proto']) : undefined;
  return `${protocol === 'https' ? 'https' : 'http'}://${host}`;
}

function firstForwardedValue(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const first = value.split(',')[0]?.trim();
  return first || undefined;
}

function createTransportAbortSignal(request: IncomingMessage, response: ServerResponse): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  request.once('error', abort);
  if (typeof request.socket.once === 'function') request.socket.once('close', abort);
  if (typeof response.once === 'function') response.once('close', abort);
  return {
    signal: controller.signal,
    cleanup: () => {
      request.off('aborted', abort);
      request.off('error', abort);
      if (typeof request.socket.off === 'function') request.socket.off('close', abort);
      if (typeof response.off === 'function') response.off('close', abort);
    },
  };
}

function combineAbortSignals(...signals: readonly (AbortSignal | undefined)[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of activeSignals) signal.removeEventListener('abort', abort);
    },
  };
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
