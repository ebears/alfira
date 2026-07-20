import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

import { sql } from 'drizzle-orm';
import { initGuildId, VERSION } from './lib/config';
import { ensureTagsMigrated } from './lib/ensureTagsMigrated';
import { json } from './lib/json';
import { lavalink } from './lib/lavalink';
import { pruneRateLimitStores } from './lib/rateLimit';
import { closeAllClients, registerClient, unregisterClient, type WsClient } from './lib/socket';
import { verifySessionToken } from './middleware/requireAuth';
import { handleAuth } from './routes/auth';
import { handleCompressor } from './routes/compressor';
import { handleEqualizer } from './routes/equalizer';
import { handleGeneralSettings } from './routes/generalSettings';
import { handlePermissions } from './routes/permissions';
import { handlePlayer } from './routes/player';
import { handlePlaylists } from './routes/playlists';
import { handleRequests } from './routes/requests';
import { handleSetup } from './routes/setup';
import { handleSongs } from './routes/songs';
import { handleTags } from './routes/tags';
import { $client, db } from './shared/db';
import { logger } from './shared/logger';
import { destroyAllPlayers, initEnabledSources, startDiscord } from './startDiscord';

// ---------------------------------------------------------------------------
// Validate required environment variables.
// ---------------------------------------------------------------------------
const requiredVars = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'DATABASE_URL',
  'JWT_SECRET',
];
const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  logger.error('Copy .env.example to .env and fill in all values.');
  process.exit(1);
}

const PORT = 3001;

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------
export type RouteContext = {
  user: ReturnType<typeof verifySessionToken>;
  isAdmin: boolean;
  cookies: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function setSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (key === 'Set-Cookie') continue; // Don't overwrite Set-Cookie headers set by routes
    newHeaders.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers: newHeaders });
}

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

function serveStatic(filePath: string, pathname: string): Response | undefined {
  const file = Bun.file(filePath);
  if (file.size === 0) return undefined;
  const ext = pathname.includes('.') ? `.${pathname.split('.').pop()}` : '.html';
  const contentType = STATIC_EXTENSIONS[ext] ?? 'text/plain';
  return new Response(file, {
    headers: { 'Content-Type': contentType },
  });
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function getSessionUser(cookieHeader: string): ReturnType<typeof verifySessionToken> {
  const cookies = parseCookies(cookieHeader);
  const token = cookies.session;
  return token ? verifySessionToken(token) : null;
}

function createContext(request: Request): RouteContext {
  const parsedCookies = parseCookies(request.headers.get('cookie') || '');
  const user = getSessionUser(request.headers.get('cookie') || '');
  const cookies: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsedCookies)) {
    if (value !== undefined) cookies[key] = value;
  }
  return { user, isAdmin: user?.isAdmin ?? false, cookies };
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function handleHealth(): Promise<Response> {
  const checks: Record<string, string> = {};

  // Database
  try {
    db.all(sql`SELECT 1`);
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // NodeLink
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const res = await fetch('http://127.0.0.1:2333/v4/info', {
      headers: { Authorization: 'nodelink-internal' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    checks.nodelink = res.ok ? 'ok' : 'error';
  } catch {
    checks.nodelink = 'error';
  }

  // Discord gateway
  checks.discord = lavalink.getSessionId() ? 'ok' : 'disconnected';

  const allOk = Object.values(checks).every((v) => v === 'ok');
  return json({ status: allOk ? 'ok' : 'degraded', version: VERSION, checks }, allOk ? 200 : 503);
}

// ---------------------------------------------------------------------------
// Route wrapper — creates auth context for Bun's native routes.
// ---------------------------------------------------------------------------

/** Wrap a routeTable handler for use with Bun.serve({ routes }). */
function apiRoute(handler: (ctx: RouteContext, request: Request) => Response | Promise<Response>) {
  return async (request: Request) => {
    const ctx = createContext(request);
    return setSecurityHeaders(await handler(ctx, request));
  };
}

// ---------------------------------------------------------------------------
// Main server
//
// Created during startup in main() after migrations, DB verification,
// and NodeLink are ready. Uses Bun's native routes (v1.2.3+) for all
// API endpoints; the fetch fallback handles WebSocket upgrades and
// static file / SPA serving.
//
// The server instance is stored in a module-level variable so the
// shutdown handler can call server.stop().
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;

function startServer(): void {
  server = Bun.serve({
    port: PORT,
    routes: {
      '/health': async () => setSecurityHeaders(await handleHealth()),
      '/api/version': () => setSecurityHeaders(json({ version: VERSION })),
      '/api/tags': apiRoute(handleTags),
      '/api/tags/*': apiRoute(handleTags),
      '/api/requests': apiRoute(handleRequests),
      '/api/requests/*': apiRoute(handleRequests),
      '/api/songs': apiRoute(handleSongs),
      '/api/songs/*': apiRoute(handleSongs),
      '/api/playlists': apiRoute(handlePlaylists),
      '/api/playlists/*': apiRoute(handlePlaylists),
      '/api/player': apiRoute(handlePlayer),
      '/api/player/*': apiRoute(handlePlayer),
      '/api/settings/compressor': apiRoute(handleCompressor),
      '/api/settings/compressor/*': apiRoute(handleCompressor),
      '/api/settings/equalizer': apiRoute(handleEqualizer),
      '/api/settings/equalizer/*': apiRoute(handleEqualizer),
      '/api/permissions': apiRoute(handlePermissions),
      '/api/permissions/*': apiRoute(handlePermissions),
      '/api/settings/general': apiRoute(handleGeneralSettings),
      '/api/settings/general/*': apiRoute(handleGeneralSettings),
      '/api/setup': apiRoute(handleSetup),
      '/api/setup/*': apiRoute(handleSetup),
      '/auth': apiRoute(handleAuth),
      '/auth/*': apiRoute(handleAuth),
    },
    fetch(request, server) {
      const url = new URL(request.url);

      // WebSocket upgrade — auth is handled here before upgrade.
      // `server` is passed as the second argument to fetch (Bun 1.2+).
      if (url.pathname === '/ws') {
        const user = getSessionUser(request.headers.get('cookie') || '');
        if (!user) {
          return new Response('Unauthorized', { status: 401 });
        }
        const success = server.upgrade(request, { data: { user } });
        if (success) return undefined;
        return new Response('WebSocket upgrade failed', { status: 500 });
      }

      // Serve built web assets statically (SPA fallback for client-side routing).
      // API routes are handled by `routes` above; `fetch` only runs for
      // unmatched paths (static files, SPA, 404s).
      const pathname = url.pathname;
      const ext = pathname.includes('.') ? `.${pathname.split('.').pop()}` : '.html';
      const isAsset =
        Object.hasOwn(STATIC_EXTENSIONS, ext) ||
        url.pathname.startsWith('/assets/') ||
        url.pathname === '/sw.js' ||
        url.pathname === '/registerSW.js';

      if (isAsset || url.pathname === '/') {
        const filePath = `/app/packages/web/dist${url.pathname === '/' ? '/index.html' : url.pathname}`;
        const response = serveStatic(filePath, url.pathname);
        if (response) return response;
      }

      return (
        serveStatic('/app/packages/web/dist/index.html', '/index.html') ??
        setSecurityHeaders(json({ error: 'Not Found' }, 404))
      );
    },
    websocket: {
      data: {} as { user: NonNullable<ReturnType<typeof verifySessionToken>> },
      open(ws) {
        const wsc = ws as unknown as WsClient;
        logger.debug({ socketId: wsc.id }, 'WebSocket opened');
        registerClient(wsc, ws.data.user);
      },
      message(ws, message) {
        const wsc = ws as unknown as WsClient;
        // No-op: client does not send messages
        logger.debug({ socketId: wsc.id, message }, 'Unexpected WebSocket message received');
      },
      close(ws, code, reason) {
        const wsc = ws as unknown as WsClient;
        unregisterClient(wsc);
        logger.info({ socketId: wsc.id, code, reason }, 'WebSocket closed');
      },
    },
  });

  logger.info({ port: PORT }, 'Bun server listening');
}

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------
function runMigrations(): void {
  const MIGRATIONS_DIR = join(import.meta.dir, './shared/db/migrations');

  // Ensure the drizzle migrations tracking table exists (SQLite: INTEGER PRIMARY KEY AUTOINCREMENT)
  $client.run(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = join(MIGRATIONS_DIR, file);
    const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');

    // Check if already applied
    const existing = $client
      .query('SELECT hash FROM "__drizzle_migrations" WHERE hash = ?')
      .get(hash) as { hash: string } | undefined;
    if (existing) continue;

    // Apply migration
    const rawSql = readFileSync(filePath, 'utf-8');
    const statements = rawSql.split(/-->\s*statement-breakpoint/);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      try {
        $client.run(trimmed);
      } catch (err) {
        // Skip errors that indicate the schema change was already applied
        // in a previous partial run (RENAME, ADD COLUMN, CREATE TABLE retries).
        if (
          (err as Error).message.includes('already exists') ||
          (err as Error).message.includes('no such column') ||
          (err as Error).message.includes('duplicate column name')
        ) {
          logger.info(
            { file, stmt: trimmed.substring(0, 50) },
            'Skipping already-applied statement'
          );
          continue;
        }
        throw err;
      }
    }

    $client.run(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)`, [
      hash,
      Date.now(),
    ]);
    logger.info({ file }, 'Applied migration');
  }
}

// ---------------------------------------------------------------------------
// NodeLink subprocess
// ---------------------------------------------------------------------------
function startNodeLink(): Promise<void> {
  return new Promise((resolve) => {
    nodelinkProcess = Bun.spawn(['/usr/local/bin/bun', 'src/index.ts'], {
      cwd: '/usr/local/nodelink',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODELINK_AUTHORIZATION: 'nodelink-internal' },
    });

    // Fire-and-forget: consume stdout. ReadableStream chunks may contain
    // partial lines — a long line split across chunks becomes two log
    // entries, which matches the Node.js EventEmitter behavior this replaces.
    void (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of nodelinkProcess.stdout as ReadableStream<Uint8Array>) {
        for (const line of decoder.decode(chunk).split('\n')) {
          const trimmed = line.trimEnd();
          if (trimmed) logger.debug({ component: 'NodeLink' }, trimmed);
        }
      }
    })();

    // Fire-and-forget: consume stderr, suppressing git "fatal:" noise.
    void (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of nodelinkProcess.stderr as ReadableStream<Uint8Array>) {
        for (const line of decoder.decode(chunk).split('\n')) {
          const trimmed = line.trimEnd();
          if (!trimmed || trimmed.includes('fatal:')) continue;
          logger.warn({ component: 'NodeLink' }, trimmed);
        }
      }
    })();

    const checkReady = async () => {
      try {
        const res = await fetch('http://127.0.0.1:2333/v4/info', {
          headers: { Authorization: 'nodelink-internal' },
        });
        if (res.ok) {
          logger.info('NodeLink is ready');
          resolve();
          return;
        }
      } catch {
        /* retry */
      }
      setTimeout(checkReady, 500);
    };
    void checkReady();
  });
}

async function main(): Promise<void> {
  // 1. Run migrations.
  try {
    runMigrations();
    logger.info('Migrations complete');
  } catch (error) {
    logger.error(error, 'Migration failed (continuing anyway — database may already be set up)');
  }

  // 1.5. Migrate existing song tags to the Tag table if needed.
  try {
    await ensureTagsMigrated();
  } catch (error) {
    logger.error(error, 'Tag migration failed (tags may not appear in autocomplete)');
  }

  // 2. Verify database connectivity.
  try {
    db.all(sql`SELECT 1`);
    logger.info('Connected to database');
  } catch (error) {
    logger.error(error, 'Could not connect to the database');
    process.exit(1);
  }

  // 2.5. Initialize guild ID cache.
  try {
    initGuildId();
    logger.info('Guild ID cache initialized');
  } catch (error) {
    logger.error(error, 'Failed to initialize guild settings');
  }

  // 2.6. Initialize enabled sources cache.
  try {
    initEnabledSources();
    logger.info('Enabled sources cache initialized');
  } catch (error) {
    logger.error(error, 'Failed to initialize enabled sources cache');
  }

  // 3. Start NodeLink in-process.
  try {
    await startNodeLink();
  } catch (error) {
    logger.error(error, 'Failed to start NodeLink');
  }

  // 3.5. Periodically prune stale rate-limit entries (every 5 minutes).
  setInterval(pruneRateLimitStores, 5 * 60_000);

  // 4. Start the Discord bot.
  try {
    await startDiscord();
  } catch (error) {
    logger.error(error, 'Failed to start the Discord bot');
  }

  // 5. Start the HTTP server — only after everything else is ready.
  startServer();
}

main().catch((err) => {
  logger.fatal(err, 'Fatal startup error');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
let shuttingDown = false;
let nodelinkProcess: ReturnType<typeof Bun.spawn> | undefined;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Starting graceful shutdown');

  // 1. Stop the NodeLink subprocess.
  nodelinkProcess?.kill();
  logger.info('NodeLink stopped');

  // 2. Stop accepting connections and close all WebSocket clients.
  void server?.stop();
  closeAllClients();
  logger.info('Server stopped');

  // 3. Destroy all players (FFmpeg + voice connections).
  destroyAllPlayers();
  logger.info('All players destroyed');

  // 4. Close database connection.
  $client.close();
  logger.info('Database disconnected');

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
