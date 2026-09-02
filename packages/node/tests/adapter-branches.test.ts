import { createServer, type IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CopyPatchBackend } from '@copypatch/backend';
import {
  createNodeHandler,
  expressMiddleware,
  fastifyCopyPatchPlugin,
  fastifyCopyPatchHandler,
  toRequest,
  writeNodeResponse,
} from '../src/index.js';
import type { ExpressRequest, FastifyRequestLike, NodeHandlerOptions } from '../src/index.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
});

function backend(handler: CopyPatchBackend['handle']): CopyPatchBackend {
  return { handle: handler, readPublished: async () => ({ revision: 1, content: {} }) };
}

function rawRequest(init: Partial<IncomingMessage> = {}): IncomingMessage {
  return Object.assign(Readable.from([]), {
    method: 'GET',
    url: '/',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...init,
  }) as IncomingMessage;
}

function responseSink() {
  return {
    setHeader: vi.fn(),
    end: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    once: vi.fn(),
    off: vi.fn(),
    writableEnded: false,
  };
}

describe('Node adapter branch behavior', () => {
  it('ignores untrusted forwarded metadata, accepts it only with proxy trust, and prefers explicit origin', () => {
    const request = rawRequest({
      url: '/content/en?draft=1',
      headers: { host: 'editor.example.test', 'x-forwarded-host': 'public.example.test', 'x-forwarded-proto': 'https, http' },
    });
    const direct = toRequest(request);
    const trusted = toRequest(request, undefined, true);
    const explicit = toRequest(rawRequest({ url: '/health', headers: { host: 'ignored.example.test' } }), 'https://configured.test');

    expect(direct.url).toBe('http://editor.example.test/content/en?draft=1');
    expect(trusted.url).toBe('https://public.example.test/content/en?draft=1');
    expect(direct.method).toBe('GET');
    expect(explicit.url).toBe('https://configured.test/health');
  });

  it('types resolver inputs as the framework request, preserving host decorations', () => {
    interface ExpressUserRequest extends ExpressRequest { user: { id: string }; }
    interface DecoratedFastifyRequest extends FastifyRequestLike { copyPatchUser: { id: string }; }

    const expressOptions: NodeHandlerOptions<{ id: string }, ExpressUserRequest> = {
      context: (request) => ({ hostAuth: request.user }),
    };
    const fastifyOptions: NodeHandlerOptions<{ id: string }, DecoratedFastifyRequest> = {
      context: (request) => ({ hostAuth: request.copyPatchUser }),
    };

    const express = expressMiddleware<{ id: string }, ExpressUserRequest>(backend(async () => new Response('ok')), expressOptions);
    const fastify = fastifyCopyPatchHandler<{ id: string }, DecoratedFastifyRequest>(backend(async () => new Response('ok')), fastifyOptions);

    expect(express).toBeTypeOf('function');
    expect(fastify).toBeTypeOf('function');
  });

  it('writes empty and non-streaming backend responses to minimal Node response sinks', async () => {
    const empty = responseSink();
    await writeNodeResponse(empty, new Response(null, { status: 204, headers: { 'x-empty': 'yes' } }));
    expect(empty.setHeader).toHaveBeenCalledWith('x-empty', 'yes');
    expect(empty.end).toHaveBeenCalledWith();

    const textOnly = { setHeader: vi.fn(), end: vi.fn(), writableEnded: false };
    await writeNodeResponse(textOnly, new Response('text fallback', { status: 202 }));
    expect(textOnly.end).toHaveBeenCalledWith('text fallback');
  });

  it('turns uncaught backend failures into an empty 500 response', async () => {
    const server = createServer(createNodeHandler(backend(async () => {
      throw new Error('backend failed');
    })));
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');

    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('');
  });

  it('passes normal Express stream requests through while converting non-Error failures for next()', async () => {
    const handled = vi.fn(async () => new Response('express ok'));
    const next = vi.fn();
    const response = responseSink();
    await expressMiddleware(backend(handled))(rawRequest() as never, response as never, next);
    expect(handled).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();

    const failingNext = vi.fn();
    await expressMiddleware(backend(async () => {
      throw 'unstructured failure';
    }))(rawRequest() as never, responseSink() as never, failingNext);
    expect(failingNext).toHaveBeenCalledWith(expect.objectContaining({
      message: 'CopyPatch Express middleware failed.',
    }));
  });

  it('wraps Fastify handlers and preserves an optional host-auth context resolver', async () => {
    const hostAuth = { role: 'editor' };
    const handled = vi.fn(async (_request: Request, context) => {
      expect(context?.hostAuth).toBe(hostAuth);
      return new Response('plugin response', { status: 201 });
    });
    const plugin = fastifyCopyPatchPlugin(backend(handled), {
      context: async () => ({ hostAuth }),
    });
    const reply = { raw: responseSink(), hijack: vi.fn() };

    await plugin.handler({ raw: rawRequest() }, reply as never);
    expect(reply.hijack).toHaveBeenCalledOnce();
    expect(handled).toHaveBeenCalledOnce();
    expect(reply.raw.end).toHaveBeenCalledOnce();
  });
});
