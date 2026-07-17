import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Minimal Discord REST helpers — replaces the Seyfert REST surface used by
// voice.ts and displayName.ts.
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
  return token;
}

/**
 * Thin wrapper around fetch() for Discord REST calls.
 * Handles 429 rate limits with a single retry.
 */
async function discordFetch(path: string): Promise<Response> {
  const url = `${DISCORD_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${botToken()}` },
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const delayMs = retryAfter ? Number.parseFloat(retryAfter) * 1000 : 1000;
    logger.warn({ path, delayMs }, 'Discord REST rate limited, retrying');
    await new Promise((r) => setTimeout(r, delayMs));
    return fetch(url, {
      headers: { Authorization: `Bot ${botToken()}` },
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Types — minimal shapes matching what we consume from Discord's REST API.
// ---------------------------------------------------------------------------

export interface DiscordGuildMember {
  nick: string | null;
  user: {
    id: string;
    username: string;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a guild member by user ID.
 * Returns null if the member is not in the guild (404) or on other errors.
 */
export async function fetchGuildMember(
  guildId: string,
  userId: string
): Promise<DiscordGuildMember | null> {
  try {
    const res = await discordFetch(`/guilds/${guildId}/members/${userId}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      logger.warn({ guildId, userId, status: res.status }, 'Failed to fetch guild member');
      return null;
    }
    return (await res.json()) as DiscordGuildMember;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'fetchGuildMember error'
    );
    return null;
  }
}
