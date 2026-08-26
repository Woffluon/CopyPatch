import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createCopyPatchRouteHandlers,
  readPublishedSnapshot,
} from '../src/server.js';

interface HostContext {
  session: { id: string };
}

const snapshot = { revision: 9, content: { 'hero.title': 'Published title' } };

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
    const handlers = createCopyPatchRouteHandlers(backend);
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
      handle: vi.fn(async (request: Request, context?: { hostAuth?: HostContext }) => {
        expect(context?.hostAuth).toBe(hostContext);
        expect([...request.headers.values()].join(' ')).not.toContain(hostContext.session.id);
        return new Response(null, { status: 204 });
      }),
      readPublished: vi.fn(),
    };
    const resolveContext = vi.fn(async () => ({ hostAuth: hostContext }));
    const request = new Request('https://example.test/__copypatch/api/v2/session', { method: 'POST' });

    const response = await createCopyPatchRouteHandlers(backend, { resolveContext }).POST(request);

    expect(response.status).toBe(204);
    expect(resolveContext).toHaveBeenCalledWith(request);
  });

  it('reads SSR/RSC snapshots directly from the backend without a self-fetch', async () => {
    const backend = {
      handle: vi.fn(),
      readPublished: vi.fn(async (locale: string) => ({ ...snapshot, content: { ...snapshot.content, locale } })),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(readPublishedSnapshot(backend, 'tr')).resolves.toEqual({
      revision: 9,
      content: { 'hero.title': 'Published title', locale: 'tr' },
    });
    expect(backend.readPublished).toHaveBeenCalledWith('tr');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('exposes only the v2 direct-read helper, without a compatibility alias', async () => {
    const serverSource = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

    expect(serverSource).not.toContain('fetchServerSnapshot');
  });

  it('returns the host fallback snapshot if a direct SSR read fails', async () => {
    const fallback = { revision: 3, content: { title: 'Host fallback' } };
    const backend = {
      handle: vi.fn(),
      readPublished: vi.fn(async () => { throw new Error('storage unavailable'); }),
    };

    await expect(readPublishedSnapshot(backend, 'en', { fallback })).resolves.toBe(fallback);
  });

  it('keeps browser/client entry code free of backend imports and declares an explicit server export', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
      type: string;
      exports: Record<string, unknown>;
      dependencies: Record<string, string>;
    };
    const clientSource = await readFile(new URL('../src/index.tsx', import.meta.url), 'utf8');

    expect(packageJson.version).toBe('2.0.0');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports['.']).toBeDefined();
    expect(packageJson.exports['./server']).toBeDefined();
    expect(packageJson.dependencies['@copypatch/backend']).toBe('workspace:*');
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      '@copypatch/backend',
      '@copypatch/core',
      '@copypatch/react',
    ]);
    expect(clientSource).toContain("'use client'");
    expect(clientSource).not.toContain('@copypatch/backend');
  });
});
