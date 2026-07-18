import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { db, tables } from '../shared/db';

function resolveVersion(): string {
  const envVersion = process.env.ALFIRA_VERSION;
  // Explicit non-dev version — use as-is (e.g., v0.1.0 from Docker build arg).
  if (envVersion && envVersion !== 'dev') return envVersion;

  // Dev — check for explicit git hash override (e.g., from Docker build arg).
  if (process.env.GIT_HASH) return `dev (${process.env.GIT_HASH})`;

  // Dev — try to read the commit hash from the mounted .git directory.
  try {
    const head = readFileSync('/app/.git/HEAD', 'utf-8').trim();
    const match = head.match(/^ref: (.+)$/);
    const hash = match
      ? readFileSync(`/app/.git/${match[1]}`, 'utf-8').trim().slice(0, 7)
      : head.slice(0, 7);
    if (hash) return `dev (${hash})`;
  } catch {
    // No .git available — fall through to plain 'dev'.
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
