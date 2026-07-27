import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { join } from 'node:path';

import { elysiaJson } from './lib/apiResponse';
import { VERSION } from './lib/config';
import { parseCookies } from './lib/cookies';
import { lavalink } from './lib/lavalink';
import { registerClient, unregisterClient, type WsClient } from './lib/socket';
import { verifySessionToken } from './middleware/requireAuth';
import { authPlugin } from './routes/auth.elysia';
import { channelMixPlugin } from './routes/channelMix.elysia';
import { compressorPlugin } from './routes/compressor.elysia';
import { distortionPlugin } from './routes/distortion.elysia';
import { equalizerPlugin } from './routes/equalizer.elysia';
import { filtersPlugin } from './routes/filters.elysia';
import { generalSettingsPlugin } from './routes/generalSettings.elysia';
import { karaokePlugin } from './routes/karaoke.elysia';
import { lowPassPlugin } from './routes/lowPass.elysia';
import { permissionsPlugin } from './routes/permissions.elysia';
import { playerPlugin } from './routes/player.elysia';
import { playlistsPlugin } from './routes/playlists.elysia';
import { requestsPlugin } from './routes/requests.elysia';
import { rotationPlugin } from './routes/rotation.elysia';
import { setupPlugin } from './routes/setup.elysia';
import { songsPlugin } from './routes/songs.elysia';
import { tagsPlugin } from './routes/tags.elysia';
import { timescalePlugin } from './routes/timescale.elysia';
import { tremoloPlugin } from './routes/tremolo.elysia';
import { vibratoPlugin } from './routes/vibrato.elysia';
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

export function createApp(): Elysia {
  const apiApp = new Elysia({ prefix: '/api' }).get('/version', () =>
    elysiaJson({ version: VERSION })
  );

  // Native Elysia route groups
  apiApp.use(tagsPlugin);
  apiApp.use(channelMixPlugin);
  apiApp.use(compressorPlugin);
  apiApp.use(distortionPlugin);
  apiApp.use(equalizerPlugin);
  apiApp.use(filtersPlugin);
  apiApp.use(generalSettingsPlugin);
  apiApp.use(karaokePlugin);
  apiApp.use(lowPassPlugin);
  apiApp.use(rotationPlugin);
  apiApp.use(timescalePlugin);
  apiApp.use(tremoloPlugin);
  apiApp.use(vibratoPlugin);
  apiApp.use(setupPlugin);
  apiApp.use(permissionsPlugin);
  apiApp.use(playerPlugin);
  apiApp.use(songsPlugin);
  apiApp.use(playlistsPlugin);
  apiApp.use(requestsPlugin);

  const authApp = new Elysia({ prefix: '/auth' });
  authApp.use(authPlugin);

  const app = new Elysia()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    .derive(deriveAuth as unknown as (ctx: Record<string, unknown>) => Record<string, unknown>)
    .use(apiApp)
    .use(authApp)
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
      return elysiaJson(
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
