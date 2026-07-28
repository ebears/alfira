import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createApp } from './elysia-app';
import { initGuildId } from './lib/config';
import { ensureTagsMigrated } from './lib/ensureTagsMigrated';
import { pruneRateLimitStores } from './lib/rateLimit';
import { closeAllClients } from './lib/socket';
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
  'JWT_SECRET',
];
const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  logger.error('Copy .env.example to .env and fill in all values.');
  process.exit(1);
}

const PORT = 3001;
const NODELINK_HOME = process.env.NODELINK_HOME ?? '/usr/local/nodelink';

// ---------------------------------------------------------------------------
// Main server
//
// Created during startup in main() after migrations, DB verification,
// and NodeLink are ready. Uses Elysia (which wraps Bun.serve) for all
// HTTP + WebSocket handling.
//
// The Elysia instance is stored in a module-level variable so the
// shutdown handler can call server.stop().
// ---------------------------------------------------------------------------

let server: ReturnType<typeof createApp> | undefined;

function startServer(): void {
  const app = createApp();
  server = app;
  app.listen(PORT, ({ hostname, port }) => {
    logger.info({ hostname, port }, 'Elysia server listening');
  });
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const existing = $client
      .query('SELECT hash FROM "__drizzle_migrations" WHERE hash = ?')
      .get(hash) as { hash: string } | undefined;
    if (existing) {
      continue;
    }

    // Apply migration
    const rawSql = readFileSync(filePath, 'utf-8');
    const statements = rawSql.split(/-->\s*statement-breakpoint/);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) {
        continue;
      }
      try {
        $client.run(trimmed);
      } catch (error) {
        // Skip errors that indicate the schema change was already applied
        // in a previous partial run (RENAME, ADD COLUMN, CREATE TABLE retries).
        const isKnownError =
          error instanceof Error &&
          (error.message.includes('already exists') ||
            error.message.includes('no such column') ||
            error.message.includes('duplicate column name'));
        if (isKnownError) {
          logger.info({ file, stmt: trimmed.slice(0, 50) }, 'Skipping already-applied statement');
          continue;
        }
        throw error;
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
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    // @ts-expect-error Bun global
    const proc = Bun.spawn(['bun', 'src/index.ts'], {
      cwd: NODELINK_HOME,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODELINK_AUTHORIZATION: 'nodelink-internal' },
    });
    nodelinkProcess = proc;
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

    // Fire-and-forget: consume stdout. ReadableStream chunks may contain
    // partial lines — a long line split across chunks becomes two log
    // entries, which matches the Node.js EventEmitter behavior this replaces.
    void (async () => {
      const decoder = new TextDecoder();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-member-access
      for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
        for (const line of decoder.decode(chunk).split('\n')) {
          const trimmed = line.trimEnd();
          if (trimmed) {
            logger.debug({ component: 'NodeLink' }, trimmed);
          }
        }
      }
    })();

    // Fire-and-forget: consume stderr, suppressing git "fatal:" noise.
    void (async () => {
      const decoder = new TextDecoder();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-member-access
      for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
        for (const line of decoder.decode(chunk).split('\n')) {
          const trimmed = line.trimEnd();
          if (!trimmed || trimmed.includes('fatal:')) {
            continue;
          }
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
      setTimeout(() => {
        void checkReady();
      }, 500);
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

void (async () => {
  try {
    await main();
  } catch (error) {
    logger.fatal(error, 'Fatal startup error');
    process.exit(1);
  }
})();

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
let shuttingDown = false;
let nodelinkProcess: unknown;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, 'Starting graceful shutdown');

  // 1. Stop the NodeLink subprocess.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
  (nodelinkProcess as any)?.kill();
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

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
