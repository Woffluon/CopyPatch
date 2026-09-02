import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createCopyPatchRouteHandlers,
  readPublishedSnapshot,
} from '../src/server.js';
import * as serverApi from '../src/server.js';

interface HostContext {
  session: { id: string };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('@copypatch/next v2 server helpers', () => {
  it('forwards every App Router method to the backend with the original Web Request and Response', async () => {
    const response = new Response('backend response', {
      status: 202,
      headers: { 'x-copypatch-backend': 'untouched' },
    });
    const backend = {
      handle: vi.fn(async (request: Request) => {
        if (request.method === 'PATCH') {
          expect(request.headers.get('x-request-id')).toBe('request-123');
          expect(await request.text()).toBe('{"title":"new"}');
        }
        return response;
      }),
      readPublished: vi.fn(),
    };
    const handlers = createCopyPatchRouteHandlers(backend, {
      unsafeRequestWithoutClientAddress: 'shared-bucket',
    });
    const request = new Request('https://example.test/__copypatch/api/v2/editor/en', {
      method: 'PATCH',
      headers: { 'x-request-id': 'request-123' },
      body: '{"title":"new"}',
    });

    expect(Object.keys(handlers).sort()).toEqual(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
    expect(await handlers.PATCH(request)).toBe(response);
    expect(backend.handle).toHaveBeenCalledWith(request, undefined);
    expect(response.headers.get('x-copypatch-backend')).toBe('untouched');

    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'] as const) {
      const methodRequest = new Request('https://example.test/__copypatch/api/v2', { method });
      expect(await handlers[method](methodRequest)).toBe(response);
      expect(backend.handle).toHaveBeenCalledWith(methodRequest, undefined);
    }
  });

  it('passes opaque host context directly to the backend without serializing it into request headers', async () => {
    const hostContext: HostContext = { session: { id: 'opaque-host-session' } };
    const backend = {
      handle: vi.fn(async (request: Request, context?: { hostAuth?: HostContext; clientAddress?: string }) => {
        expect(context?.hostAuth).toBe(hostContext);
        expect([...request.headers.values()].join(' ')).not.toContain(hostContext.session.id);
        return new Response(null, { status: 204 });
      }),
      readPublished: vi.fn(),
    };
    const resolveContext = vi.fn(async () => ({
      hostAuth: hostContext,
      clientAddress: '203.0.113.12',
    }));
    const request = new Request('https://example.test/__copypatch/api/v2/session', { method: 'POST' });

    const response = await createCopyPatchRouteHandlers(backend, { resolveContext }).POST(request);

    expect(response.status).toBe(204);
    expect(resolveContext).toHaveBeenCalledWith(request);
  });

  it('fails closed for identityless unsafe requests without trusting forwarding headers', async () => {
    const backend = {
      handle: vi.fn(async () => new Response(null, { status: 204 })),
      readPublished: vi.fn(),
    };
    const request = new Request('https://example.test/__copypatch/api/v2/session', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '198.51.100.55',
        forwarded: 'for=198.51.100.55',
      },
    });

    const response = await createCopyPatchRouteHandlers(backend).POST(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'CLIENT_ADDRESS_UNAVAILABLE',
        message: 'A trusted client address is required for unsafe requests.',
      },
    });
    expect(backend.handle).not.toHaveBeenCalled();
  });

  it('keeps trusted client identities isolated and ignores spoofed forwarding headers', async () => {
    const contexts: unknown[] = [];
    const backend = {
      handle: vi.fn(async (_request: Request, context?: unknown) => {
        contexts.push(context);
        return new Response(null, { status: 204 });
      }),
      readPublished: vi.fn(),
    };
    const resolveContext = vi.fn(async (request: Request) => ({
      clientAddress: new URL(request.url).searchParams.get('trusted') ?? undefined,
    }));
    const handlers = createCopyPatchRouteHandlers(backend, { resolveContext });

    await handlers.POST(new Request('https://example.test/api?trusted=203.0.113.10', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.99' },
    }));
    await handlers.POST(new Request('https://example.test/api?trusted=203.0.113.11', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }));

    expect(contexts).toEqual([
      { clientAddress: '203.0.113.10' },
      { clientAddress: '203.0.113.11' },
    ]);
  });

  it('allows an explicit shared-bucket opt-in for identityless unsafe requests', async () => {
    const backend = {
      handle: vi.fn(async () => new Response(null, { status: 204 })),
      readPublished: vi.fn(),
    };
    const request = new Request('https://example.test/__copypatch/api/v2/session', { method: 'POST' });

    const response = await createCopyPatchRouteHandlers(backend, {
      unsafeRequestWithoutClientAddress: 'shared-bucket',
    }).POST(request);

    expect(response.status).toBe(204);
    expect(backend.handle).toHaveBeenCalledWith(request, undefined);
  });

  it('allows identityless safe requests without shared-bucket opt-in', async () => {
    const backend = {
      handle: vi.fn(async () => new Response(null, { status: 204 })),
      readPublished: vi.fn(),
    };
    const request = new Request('https://example.test/__copypatch/api/v2/content/en');

    const response = await createCopyPatchRouteHandlers(backend).GET(request);

    expect(response.status).toBe(204);
    expect(backend.handle).toHaveBeenCalledWith(request, undefined);
  });

  it('reads SSR/RSC snapshots directly from the backend without a self-fetch', async () => {
    const backendSnapshot = {
      revision: 9,
      content: { 'hero.title': 'Published title', locale: 'tr' },
    };
    const backend = {
      handle: vi.fn(),
      readPublished: vi.fn(async () => backendSnapshot),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const first = await readPublishedSnapshot(backend, 'tr');
    const second = await readPublishedSnapshot(backend, 'tr');

    expect(first).toEqual({
      revision: 9,
      content: { 'hero.title': 'Published title', locale: 'tr' },
    });
    expect(first).not.toBe(backendSnapshot);
    expect(first.content).not.toBe(backendSnapshot.content);
    expect(second).not.toBe(first);
    expect(second.content).not.toBe(first.content);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.content)).toBe(true);
    expect(Reflect.set(first.content, 'locale', 'mutated')).toBe(false);
    expect(backendSnapshot.content.locale).toBe('tr');
    expect(backend.readPublished).toHaveBeenCalledTimes(2);
    expect(backend.readPublished).toHaveBeenNthCalledWith(1, 'tr');
    expect(backend.readPublished).toHaveBeenNthCalledWith(2, 'tr');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('exposes only the v2 direct-read helper, without a compatibility alias', async () => {
    const serverSource = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

    expect(serverSource).not.toContain('fetchServerSnapshot');
  });

  it('returns a fresh deeply frozen copy of the host fallback if a direct SSR read fails', async () => {
    const fallback = { revision: 3, content: { title: 'Host fallback' } };
    const backend = {
      handle: vi.fn(),
      readPublished: vi.fn(async () => { throw new Error('storage unavailable'); }),
    };

    const first = await readPublishedSnapshot(backend, 'en', { fallback });
    const second = await readPublishedSnapshot(backend, 'en', { fallback });

    expect(first).toEqual(fallback);
    expect(first).not.toBe(fallback);
    expect(second).not.toBe(first);
    expect(first.content).not.toBe(fallback.content);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.content)).toBe(true);
    expect(Reflect.set(first.content, 'title', 'mutated')).toBe(false);
    expect(fallback.content.title).toBe('Host fallback');
  });

  it('returns a fresh deeply frozen default fallback without exporting a singleton', async () => {
    const backend = {
      handle: vi.fn(),
      readPublished: vi.fn(async () => { throw new Error('storage unavailable'); }),
    };

    const first = await readPublishedSnapshot(backend, 'en');
    const second = await readPublishedSnapshot(backend, 'en');

    expect(first).toEqual({ revision: 1, content: {} });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.content).not.toBe(first.content);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.content)).toBe(true);
    expect(Object.hasOwn(serverApi, 'EMPTY_CONTENT_SNAPSHOT')).toBe(false);
  });

  it('keeps browser/client entry code free of backend imports and declares an explicit server export', async () => {
    const packageJson = parseJsonObject(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const packageExports = packageJson.exports;
    const dependencies = packageJson.dependencies;
    const peerDependencies = packageJson.peerDependencies;
    if (!isRecord(packageExports) || !isRecord(dependencies) || !isRecord(peerDependencies)) {
      throw new TypeError('Expected object-shaped package metadata.');
    }
    const clientSource = await readFile(new URL('../src/index.tsx', import.meta.url), 'utf8');
    const serverSource = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

    expect(packageJson.type).toBe('module');
    expect(packageJson.module).toBeUndefined();
    expect(packageJson.sideEffects).toBe(false);
    expect(packageExports['.']).toBeDefined();
    expect(packageExports['./server']).toBeDefined();
    expect(Object.keys(dependencies).sort()).toEqual([
      '@copypatch/core',
      '@copypatch/react',
    ]);
    expect(peerDependencies).toEqual({
      next: '>=14.0.0 <16.0.0',
      react: '>=18.0.0 <20.0.0',
      'react-dom': '>=18.0.0 <20.0.0',
    });
    expect(clientSource).toContain("'use client'");
    expect(clientSource).not.toContain('@copypatch/backend');
    expect(serverSource).not.toContain('@copypatch/backend');
  });
});
