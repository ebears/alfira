import { execSync } from 'node:child_process';

function resolveVersion(): string {
  const envVersion = process.env.ALFIRA_VERSION;
  // Explicit non-dev version — use as-is (e.g., v0.1.0 from Docker build arg).
  if (envVersion && envVersion !== 'dev') return envVersion;

  // Dev — try to resolve the current commit hash for traceability.
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    if (hash) return `dev (${hash})`;
  } catch {
    // git not available or not a repo — fall through to plain 'dev'.
  }

  return 'dev';
}

export const VERSION = resolveVersion();

// ---------------------------------------------------------------------------
// Guild ID — lazy-loaded from DB on first access, falling back to env var.
// The DB value is set by the setup wizard and can be updated at runtime.
// Use getGuildId() instead of importing a constant — it reads the cached
// value synchronously after the first async population.
// ---------------------------------------------------------------------------

let _cachedGuildId: string | null = null;
let _guildIdLoaded = false;

export function getGuildId(): string {
  return _cachedGuildId ?? '';
}

/** Must be called once during startup, after migrations and DB are ready. */
export async function initGuildId(): Promise<void> {
  if (_guildIdLoaded) return;

  try {
    // Lazy import to avoid circular dependency at module load time.
    const { db, tables, eq } = await import('../shared/db');
    const row = await db
      .select({ guildId: tables.guildSettings.guildId })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get();

    if (row?.guildId) {
      _cachedGuildId = row.guildId;
    } else {
      _cachedGuildId = process.env.GUILD_ID ?? null;
    }
  } catch {
    // DB not available yet — fall back to env var.
    _cachedGuildId = process.env.GUILD_ID ?? null;
  }

  _guildIdLoaded = true;
}

/** Called after the setup wizard saves a guild ID. Updates the in-memory cache. */
export function refreshGuildId(guildId: string): void {
  _cachedGuildId = guildId;
}
