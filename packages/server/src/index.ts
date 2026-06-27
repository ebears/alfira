import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'cookie';
import { sql } from 'drizzle-orm';
import { logger } from './lib/config';
import { ensureTagsMigrated } from './lib/ensureTagsMigrated';
import { json } from './lib/json';
import { closeAllClients, registerClient, unregisterClient } from './lib/socket';
import { verifySessionToken } from './middleware/requireAuth';
import { handleAuth } from './routes/auth';
import { handleCompressor } from './routes/compressor';
import { handleEqualizerGet, handleEqualizerPatch } from './routes/equalizer';
import { handlePlayer } from './routes/player';
import { handlePlaylists } from './routes/playlists';
import { handleSongs } from './routes/songs';
import { handleTags } from './routes/tags';
import { $client, db } from './shared/db';
import { destroyAllPlayers, startDiscord } from './startDiscord';
import { unregisterStaleCommands } from './utils/unregisterCommands';

// ---------------------------------------------------------------------------
// Validate required environment variables.
// ---------------------------------------------------------------------------
const requiredVars = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'GUILD_ID',
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
// Route context creation
// ---------------------------------------------------------------------------

function createContext(request: Request): RouteContext {
  const parsedCookies = parse(request.headers.get('cookie') || '');
  const token = parsedCookies.session;
  const user = token ? verifySessionToken(token) : null;
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
  try {
    await db.all(sql`SELECT 1`);
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'degraded' }, 503);
  }
}

// ---------------------------------------------------------------------------
// Main server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return setSecurityHeaders(await handleHealth());
    }

    // WebSocket upgrade — auth is handled here before upgrade
    if (url.pathname === '/ws') {
      const cookies = parse(request.headers.get('cookie') || '');
      const token = cookies.session;
      const user = token ? verifySessionToken(token) : null;
      if (!user) {
        return new Response('Unauthorized', { status: 401 });
      }
      // Use server.upgrade() instead of WebSocketPair — it auto-returns 101
      // and attaches data to the WebSocket accessible in the websocket handler.
      const success = server.upgrade(request, { data: { user } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    // Serve built web assets statically (SPA fallback for client-side routing)
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

    // Create auth context for all other routes
    const ctx = createContext(request);

    // Route matching
    if (url.pathname.startsWith('/api/tags')) {
      return setSecurityHeaders(await handleTags(ctx, request));
    }
    if (url.pathname.startsWith('/api/songs')) {
      return setSecurityHeaders(await handleSongs(ctx, request));
    }
    if (url.pathname.startsWith('/api/playlists')) {
      return setSecurityHeaders(await handlePlaylists(ctx, request));
    }
    if (url.pathname.startsWith('/api/player')) {
      return setSecurityHeaders(await handlePlayer(ctx, request));
    }
    if (url.pathname.startsWith('/api/settings/compressor')) {
      return setSecurityHeaders(await handleCompressor(ctx, request));
    }
    if (url.pathname.startsWith('/api/settings/equalizer')) {
      if (request.method === 'GET') return setSecurityHeaders(await handleEqualizerGet(ctx));
      if (request.method === 'PATCH')
        return setSecurityHeaders(await handleEqualizerPatch(ctx, request));
    }
    if (url.pathname.startsWith('/auth')) {
      return setSecurityHeaders(await handleAuth(ctx, request));
    }

    return (
      serveStatic('/app/packages/web/dist/index.html', '/index.html') ??
      setSecurityHeaders(json({ error: 'Not Found' }, 404))
    );
  },
  websocket: {
    data: {} as { user: NonNullable<ReturnType<typeof verifySessionToken>> },
    open(ws) {
      // Log only — user was stored via server.upgrade() data.
      // biome-ignore lint/suspicious/noExplicitAny: ServerWebSocket doesn't expose id at type level
      logger.debug({ socketId: (ws as any).id }, 'WebSocket opened');
      registerClient(ws, ws.data.user);
    },
    message(ws, message) {
      // No-op: client does not send messages
      // biome-ignore lint/suspicious/noExplicitAny: ServerWebSocket doesn't expose id at type level
      logger.debug({ socketId: (ws as any).id, message }, 'Unexpected WebSocket message received');
    },
    close(ws, code, reason) {
      unregisterClient(ws);
      // biome-ignore lint/suspicious/noExplicitAny: ServerWebSocket doesn't expose id at type level
      logger.info({ socketId: (ws as any).id, code, reason }, 'WebSocket closed');
    },
  },
});

logger.info({ port: PORT }, 'Bun server listening');

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------
function runMigrations(): void {
  const MIGRATIONS_DIR = join(__dirname, './shared/db/migrations');

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
        // Skip "already exists" errors — the table/index is already there
        if ((err as Error).message.includes('already exists')) {
          logger.info(
            { file, stmt: trimmed.substring(0, 50) },
            'Skipping already-exists statement'
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
    nodelinkProcess = spawn('/usr/local/bin/bun', ['src/index.ts'], {
      cwd: '/usr/local/nodelink',
      stdio: 'pipe',
      env: { ...process.env, NODELINK_AUTHORIZATION: 'nodelink-internal' },
    });

    nodelinkProcess.stdout?.on('data', (data: Buffer) => {
      logger.debug({ component: 'NodeLink' }, data.toString().trimEnd());
    });

    nodelinkProcess.stderr?.on('data', (data: Buffer) => {
      logger.warn({ component: 'NodeLink' }, data.toString().trimEnd());
    });

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
    checkReady();
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
    await db.all(sql`SELECT 1`);
    logger.info('Connected to database');
  } catch (error) {
    logger.error(error, 'Could not connect to the database');
    process.exit(1);
  }

  // 2.5. Unregister stale Discord slash commands (from pre-web-UI versions).
  try {
    await unregisterStaleCommands();
  } catch (error) {
    logger.error(error, 'Failed to unregister stale commands (non-fatal)');
  }

  // 3. Start NodeLink in-process.
  try {
    await startNodeLink();
  } catch (error) {
    logger.error(error, 'Failed to start NodeLink');
  }

  // 4. Start the Discord bot.
  try {
    await startDiscord();
  } catch (error) {
    logger.error(error, 'Failed to start the Discord bot');
  }
}

main().catch((err) => {
  logger.fatal(err, 'Fatal startup error');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
let shuttingDown = false;
let nodelinkProcess: ReturnType<typeof spawn> | undefined;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Starting graceful shutdown');

  // 1. Stop the NodeLink subprocess.
  nodelinkProcess?.kill();
  logger.info('NodeLink stopped');

  // 2. Stop accepting connections and close all WebSocket clients.
  server.stop();
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

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
