import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { join } from 'node:path';

import { VERSION } from './lib/config';
import { parseCookies } from './lib/cookies';
import { API_SECURITY_HEADERS, wrapLegacy } from './lib/elysia-adapter';
import { json } from './lib/json';
import { lavalink } from './lib/lavalink';
import { registerClient, unregisterClient, type WsClient } from './lib/socket';
import { verifySessionToken } from './middleware/requireAuth';
import { handleAuth } from './routes/auth';
import { handleChannelMix } from './routes/channelMix';
import { handleCompressor } from './routes/compressor';
import { handleDistortion } from './routes/distortion';
import { handleEqualizer } from './routes/equalizer';
import { handleFilters } from './routes/filters';
import { handleGeneralSettings } from './routes/generalSettings';
import { handleKaraoke } from './routes/karaoke';
import { handleLowPass } from './routes/lowPass';
import { handlePermissions } from './routes/permissions';
import { handlePlayer } from './routes/player';
import { handlePlaylists } from './routes/playlists';
import { handleRequests } from './routes/requests';
import { handleRotation } from './routes/rotation';
import { handleSetup } from './routes/setup';
import { handleSongs } from './routes/songs';
import { tagsPlugin } from './routes/tags.elysia';
import { handleTimescale } from './routes/timescale';
import { handleTremolo } from './routes/tremolo';
import { handleVibrato } from './routes/vibrato';
import { db } from './shared/db';
import { logger } from './shared/logger';

const WEB_DIST = join(import.meta.dir, '../../web/dist');

const STATIC_EXTENSIONS: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function deriveAuth({
  cookie,
  request,
}: {
  cookie: Record<string, { value?: string }>;
  request: Request;
}) {
  const token = cookie.session?.value;
  const user = token ? verifySessionToken(token) : null;
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  return { user, isAdmin: user?.isAdmin ?? false, cookies };
}

function serveStatic(pathname: string): Response | undefined {
  const filePath = pathname === '/' ? join(WEB_DIST, 'index.html') : join(WEB_DIST, pathname);
  // @ts-expect-error Bun global
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const file = Bun.file(filePath);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (file.size === 0 && pathname !== '/') {
    return undefined;
  }
  const ext = pathname.includes('.') ? `.${pathname.split('.').pop()}` : '.html';
  const contentType = STATIC_EXTENSIONS[ext] ?? 'text/plain';
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return new Response(file, {
    headers: { 'Content-Type': contentType },
  });
}

function isAssetPath(pathname: string): boolean {
  const ext = pathname.includes('.') ? `.${pathname.split('.').pop()}` : '';
  return (
    Object.hasOwn(STATIC_EXTENSIONS, ext) ||
    pathname.startsWith('/assets/') ||
    pathname === '/sw.js' ||
    pathname === '/registerSW.js'
  );
}

type LegacyHandler = ReturnType<typeof wrapLegacy>;

const API_LEGACY_ROUTES: [string, LegacyHandler][] = [
  ['/requests', wrapLegacy(handleRequests)],
  ['/songs', wrapLegacy(handleSongs)],
  ['/playlists', wrapLegacy(handlePlaylists)],
  ['/player', wrapLegacy(handlePlayer)],
  ['/settings/channelmix', wrapLegacy(handleChannelMix)],
  ['/settings/compressor', wrapLegacy(handleCompressor)],
  ['/settings/distortion', wrapLegacy(handleDistortion)],
  ['/settings/equalizer', wrapLegacy(handleEqualizer)],
  ['/settings/filters', wrapLegacy(handleFilters)],
  ['/settings/karaoke', wrapLegacy(handleKaraoke)],
  ['/settings/lowpass', wrapLegacy(handleLowPass)],
  ['/settings/rotation', wrapLegacy(handleRotation)],
  ['/settings/timescale', wrapLegacy(handleTimescale)],
  ['/settings/tremolo', wrapLegacy(handleTremolo)],
  ['/settings/vibrato', wrapLegacy(handleVibrato)],
  ['/permissions', wrapLegacy(handlePermissions)],
  ['/settings/general', wrapLegacy(handleGeneralSettings)],
  ['/setup', wrapLegacy(handleSetup)],
];

function registerLegacyRoutes<T extends Elysia>(app: T, routes: [string, LegacyHandler][]): T {
  for (const [path, handler] of routes) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    app.all(path, handler as unknown as Record<string, unknown>);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    app.all(`${path}/*`, handler as unknown as Record<string, unknown>);
  }
  return app;
}

export function createApp(): Elysia {
  const apiApp = new Elysia({ prefix: '/api' }).get('/version', () => json({ version: VERSION }));

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  registerLegacyRoutes(apiApp as unknown as Elysia, API_LEGACY_ROUTES);

  // Native Elysia routes — tagsPlugin registers /tags routes directly
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  tagsPlugin(apiApp as unknown as Elysia);

  const authApp = new Elysia({ prefix: '/auth' });

  const authLegacy = wrapLegacy(handleAuth);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  authApp.all('', authLegacy as unknown as Record<string, unknown>);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  authApp.all('/*', authLegacy as unknown as Record<string, unknown>);

  const app = new Elysia()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    .derive(deriveAuth as unknown as (ctx: Record<string, unknown>) => Record<string, unknown>)
    // Security headers on API and auth routes only (not static files)
    .onAfterHandle(({ request, set }) => {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
          set.headers[key] = value;
        }
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    .use(apiApp as unknown as Elysia)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    .use(authApp as unknown as Elysia)
    .get('/health', async () => {
      const checks: Record<string, string> = {};

      try {
        db.all(sql`SELECT 1`);
        checks.database = 'ok';
      } catch {
        checks.database = 'error';
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, 500);
        const res = await fetch('http://127.0.0.1:2333/v4/info', {
          headers: { Authorization: 'nodelink-internal' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        checks.nodelink = res.ok ? 'ok' : 'error';
      } catch {
        checks.nodelink = 'error';
      }

      checks.discord = lavalink.getSessionId() ? 'ok' : 'disconnected';

      const allOk = Object.values(checks).every((v) => v === 'ok');
      return json(
        { status: allOk ? 'ok' : 'degraded', version: VERSION, checks },
        allOk ? 200 : 503
      );
    })
    .ws('/ws', {
      open(ws) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const wsc = ws as unknown as WsClient;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const data = ws.data as { user: ReturnType<typeof verifySessionToken> };
        logger.debug({ socketId: wsc.id }, 'WebSocket opened');
        if (data.user) {
          registerClient(wsc, data.user);
        } else {
          logger.warn({ socketId: wsc.id }, 'WebSocket opened without auth user');
          wsc.close();
        }
      },
      message(ws, message) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const wsc = ws as unknown as WsClient;
        logger.debug({ socketId: wsc.id, message }, 'Unexpected WebSocket message received');
      },
      close(ws, code, reason) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const wsc = ws as unknown as WsClient;
        unregisterClient(wsc);
        logger.info({ socketId: wsc.id, code, reason }, 'WebSocket closed');
      },
    })
    .get('/*', ({ request, set }) => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (isAssetPath(pathname) || pathname === '/') {
        const response = serveStatic(pathname);
        if (response) {
          set.headers['Content-Type'] = response.headers.get('Content-Type') ?? 'text/plain';
          return response;
        }
      }

      const indexResponse = serveStatic('/');
      if (indexResponse) {
        set.headers['Content-Type'] = 'text/html';
        return indexResponse;
      }

      set.status = 404;
      return { error: 'Not Found' };
    });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return app as unknown as Elysia;
}
