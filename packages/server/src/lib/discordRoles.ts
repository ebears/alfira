import { logger } from '../shared/logger';
import { type SetupRole } from '../shared/types';

const DISCORD_API = 'https://discord.com/api/v10';

export function botHeaders(): Record<string, string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN not set');
  }
  return { Authorization: `Bot ${token}` };
}

// ---------------------------------------------------------------------------
// In-memory cache for Discord guild roles.
// Prevents rate limiting when the frontend fetches roles on every settings /
// permissions page visit. Entries expire after 60 seconds.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  data: SetupRole[];
  expiresAt: number;
}

// Keyed by guild ID — the setup wizard may query multiple guilds before
// one is selected, and the settings + permissions pages query the configured
// guild afterward.
const rolesCache = new Map<string, CacheEntry>();

/**
 * Fetch the roles for a Discord guild, filtering out @everyone and managed
 * (bot-integration) roles. Results are cached for 60 seconds.
 */
export async function fetchGuildRoles(guildId: string): Promise<SetupRole[]> {
  // Serve from cache if available and not expired.
  const cached = rolesCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ guildId, status: res.status }, 'Failed to fetch guild roles from Discord');
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const roles = (await res.json()) as {
      id: string;
      name: string;
      color: number;
      managed: boolean;
    }[];

    const result: SetupRole[] = roles
      .filter((r) => r.id !== guildId && !r.managed)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
      }));

    rolesCache.set(guildId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error) {
    logger.error({ error }, 'Error fetching guild roles');
    return [];
  }
}
