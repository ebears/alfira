import { describe, expect, test } from 'bun:test';

import { type RouteContext } from './context';
import { json } from './json';
import { matchPath, routeTable } from './routeTable';

// ---------------------------------------------------------------------------
// matchPath
// ---------------------------------------------------------------------------

describe('matchPath', () => {
  test('exact match without params', () => {
    expect(matchPath('/songs', '/songs')).toEqual({});
  });

  test('no match when paths differ', () => {
    expect(matchPath('/songs', '/playlists')).toBeNull();
  });

  test('trailing slash equivalence', () => {
    expect(matchPath('/songs/', '/songs')).toEqual({});
    expect(matchPath('/songs', '/songs/')).toEqual({});
  });

  test('single param extraction', () => {
    expect(matchPath('/songs/abc123', '/songs/:id')).toEqual({ id: 'abc123' });
  });

  test('multiple param extraction', () => {
    expect(matchPath('/playlists/pl1/songs/sg2', '/playlists/:playlistId/songs/:songId')).toEqual({
      playlistId: 'pl1',
      songId: 'sg2',
    });
  });

  test('params in middle of path', () => {
    expect(matchPath('/api/songs/123/edit', '/api/songs/:id/edit')).toEqual({ id: '123' });
  });

  test('different segment count returns null', () => {
    expect(matchPath('/songs/123', '/songs')).toBeNull();
    expect(matchPath('/songs', '/songs/123')).toBeNull();
  });

  test('empty path matches empty template', () => {
    // Both are '/' after filtering empty segments
    expect(matchPath('/', '/')).toEqual({});
  });

  test('explicit segment mismatch returns null', () => {
    expect(matchPath('/songs/123', '/playlists/123')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// routeTable dispatcher
// ---------------------------------------------------------------------------

// Minimal RouteContext for testing
const ctx: RouteContext = {
  user: {
    discordId: '123',
    username: 'test',
    avatar: 'mock-avatar-hash',
    isAdmin: false,
  },
  isAdmin: false,
  cookies: {},
};

describe('routeTable dispatcher', () => {
  test('dispatches to matching GET route with exact path', async () => {
    const handler = routeTable('/api/test', {
      routes: [['GET', '/', () => json({ ok: true })]],
    });

    const req = new Request('http://localhost/api/test');
    const res = await handler(ctx, req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('dispatches to matching POST route', async () => {
    const handler = routeTable('/api/test', {
      routes: [['POST', '/', () => json({ created: true }, 201)]],
    });

    const req = new Request('http://localhost/api/test', { method: 'POST' });
    const res = await handler(ctx, req);
    expect(res.status).toBe(201);
  });

  test('method mismatch returns 404', async () => {
    const handler = routeTable('/api/test', {
      routes: [['POST', '/', () => json({ created: true })]],
    });

    const req = new Request('http://localhost/api/test', { method: 'GET' });
    const res = await handler(ctx, req);
    expect(res.status).toBe(404);
  });

  test('extracts path params and passes them to handler', async () => {
    const handler = routeTable('/api/test', {
      routes: [['GET', '/songs/:id', (_ctx, _req, params) => json({ songId: params.id })]],
    });

    const req = new Request('http://localhost/api/test/songs/abc-123');
    const res = await handler(ctx, req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ songId: 'abc-123' });
  });

  test('multiple params', async () => {
    const handler = routeTable('/api', {
      routes: [
        [
          'GET',
          '/playlists/:pid/songs/:sid',
          (_ctx, _req, params) => json({ playlist: params.pid, song: params.sid }),
        ],
      ],
    });

    const req = new Request('http://localhost/api/playlists/pl1/songs/sg2');
    const res = await handler(ctx, req);
    expect(await res.json()).toEqual({ playlist: 'pl1', song: 'sg2' });
  });

  test('prefix is stripped before matching', async () => {
    const handler = routeTable('/api/v2', {
      routes: [['GET', '/health', () => json({ status: 'ok' })]],
    });

    const req = new Request('http://localhost/api/v2/health');
    const res = await handler(ctx, req);
    expect(res.status).toBe(200);
  });

  test('routes match in registration order (first wins)', async () => {
    const handler = routeTable('/api', {
      routes: [
        ['GET', '/special', () => json({ hit: 'first' })],
        ['GET', '/special', () => json({ hit: 'second' })],
      ],
    });

    const req = new Request('http://localhost/api/special');
    const res = await handler(ctx, req);
    expect(await res.json()).toEqual({ hit: 'first' });
  });

  test('returns 404 for unmatched path', async () => {
    const handler = routeTable('/api', {
      routes: [['GET', '/songs', () => json({})]],
    });

    const req = new Request('http://localhost/api/playlists');
    const res = await handler(ctx, req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not Found' });
  });

  test('rate limits non-GET requests when configured', async () => {
    const handler = routeTable('/api/test-rl', {
      rateLimit: { windowMs: 60_000, maxRequests: 2, bucket: 'test-rl-bucket' },
      routes: [['POST', '/', () => json({ ok: true })]],
    });

    // First two requests should succeed
    const req1 = new Request('http://localhost/api/test-rl', { method: 'POST' });
    const r1 = await handler(ctx, req1);
    expect(r1.status).toBe(200);

    const req2 = new Request('http://localhost/api/test-rl', { method: 'POST' });
    const r2 = await handler(ctx, req2);
    expect(r2.status).toBe(200);

    // Third should be rate-limited
    const req3 = new Request('http://localhost/api/test-rl', { method: 'POST' });
    const r3 = await handler(ctx, req3);
    expect(r3.status).toBe(429);
    expect(await r3.json()).toHaveProperty('retryAfterSeconds');
  });

  test('rate limit does not apply to GET requests', async () => {
    const handler = routeTable('/api/test-rl-get', {
      rateLimit: { windowMs: 60_000, maxRequests: 1, bucket: 'test-rl-get-bucket' },
      routes: [['GET', '/', () => json({ ok: true })]],
    });

    // GET should never be rate-limited
    const r1 = await handler(ctx, new Request('http://localhost/api/test-rl-get'));
    expect(r1.status).toBe(200);

    const r2 = await handler(ctx, new Request('http://localhost/api/test-rl-get'));
    expect(r2.status).toBe(200);
  });

  test('rate limit headers are attached to successful responses', async () => {
    const handler = routeTable('/api/test-rl-headers', {
      rateLimit: { windowMs: 60_000, maxRequests: 5, bucket: 'test-rl-headers' },
      routes: [['POST', '/', () => json({ ok: true })]],
    });

    const req = new Request('http://localhost/api/test-rl-headers', { method: 'POST' });
    const res = await handler(ctx, req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
    expect(res.headers.get('X-RateLimit-Reset')).not.toBeNull();
  });

  test('async handlers work', async () => {
    const handler = routeTable('/api/async', {
      routes: [
        [
          'GET',
          '/',
          async () => {
            await new Promise((resolve) => {
              setTimeout(resolve, 1);
            });
            return json({ async: true });
          },
        ],
      ],
    });

    const req = new Request('http://localhost/api/async');
    const res = await handler(ctx, req);
    expect(await res.json()).toEqual({ async: true });
  });

  test('returns 404 for unknown method on known path', async () => {
    const handler = routeTable('/api', {
      routes: [['GET', '/resource', () => json({})]],
    });

    const req = new Request('http://localhost/api/resource', { method: 'DELETE' });
    const res = await handler(ctx, req);
    expect(res.status).toBe(404);
  });
});
