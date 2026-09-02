import { createServer, request as nodeRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CopyPatchBackend } from '@copypatch/backend';
import { createHonoHandler, createNodeHandler, expressMiddleware, fastifyCopyPatchHandler } from '../src/index.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
});

function backend(handler: CopyPatchBackend['handle']): CopyPatchBackend {
  return { handle: handler, readPublished: async () => ({ revision: 1, content: {} }) };
}

async function serverRequest(handler: (request: IncomingMessage, response: ServerResponse) => void, init: RequestInit & { path?: string } = {}) {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return fetch(`http://127.0.0.1:${address.port}${init.path ?? '/'}`, init);
}

describe('native Node handler', () => {
  it('streams request and response bodies, retains headers/status and duplicate Set-Cookie values', async () => {
    const handle = vi.fn(async (request: Request, context) => {
      expect(await request.text()).toBe('streamed request');
      expect(context.clientAddress).toBe('127.0.0.1');
      return new Response(Readable.toWeb(Readable.from(['first-', 'second'])) as ReadableStream, {
        status: 207,
        headers: [['x-copy', 'yes'], ['set-cookie', 'one=1; Path=/'], ['set-cookie', 'two=2; Path=/']],
      });
    });
    const response = await serverRequest(createNodeHandler(backend(handle)), { method: 'POST', body: 'streamed request' });
    expect(response.status).toBe(207);
    expect(response.headers.get('x-copy')).toBe('yes');
    expect(response.headers.getSetCookie()).toEqual(['one=1; Path=/', 'two=2; Path=/']);
    expect(await response.text()).toBe('first-second');
    expect(handle).toHaveBeenCalledOnce();
  });

  it('forwards an aborted request as an AbortSignal without buffering the body', async () => {
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const handling = new Promise<void>((resolve) => { started = resolve; });
    const handler = createNodeHandler(backend(async (_request, context) => {
      signal = context?.signal;
      started();
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response('late');
    }));
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const pending = nodeRequest({ host: '127.0.0.1', port: address.port, method: 'POST', headers: { 'content-length': '524288' } });
    pending.on('error', () => undefined);
    pending.write('partial request body');
    await handling;
    pending.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(signal?.aborted).toBe(true);
  });

  it('combines a host abort signal with the Node transport signal', async () => {
    const hostAbort = new AbortController();
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const handling = new Promise<void>((resolve) => { started = resolve; });
    const handler = createNodeHandler(backend(async (_request, context) => {
      signal = context?.signal;
      started();
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response('late');
    }), { context: () => ({ signal: hostAbort.signal }) });
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');

    const pending = fetch(`http://127.0.0.1:${address.port}/`);
    await handling;
    hostAbort.abort();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(signal?.aborted).toBe(true);
    await pending;
  });
});

describe('framework adapters', () => {
  it('rejects an Express request after a body parser consumed it', async () => {
    const next = vi.fn();
    const response = { headersSent: false, statusCode: 200, setHeader: vi.fn(), end: vi.fn(), once: vi.fn() };
    await expressMiddleware(backend(async () => new Response('ok')))({ method: 'POST', url: '/', headers: {}, readableEnded: true } as never, response as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('before body parsers') }));
  });

  it('uses Fastify raw request/reply and hijacks before writing', async () => {
    const hijack = vi.fn();
    const end = vi.fn();
    const raw = Object.assign(Readable.from([]), { method: 'GET', url: '/', headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    await fastifyCopyPatchHandler(backend(async () => new Response('fastify', { status: 201 })))({ raw } as never, { raw: { setHeader: vi.fn(), end }, hijack } as never);
    expect(hijack).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledWith('fastify');
  });

  it('returns the backend response directly for Hono, without serializing opaque context', async () => {
    const opaque = { token: 'private' };
    const handler = createHonoHandler(backend(async (_request, context) => {
      expect(context?.hostAuth).toBe(opaque);
      return new Response('hono', { status: 202, headers: [['set-cookie', 'a=1'], ['set-cookie', 'b=2']] });
    }), { context: () => ({ hostAuth: opaque }) });
    const response = await handler({ req: { raw: new Request('http://example.test/') } } as never);
    expect(response.status).toBe(202);
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
  });
});
