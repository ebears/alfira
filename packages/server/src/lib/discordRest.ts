import { logger } from '../shared/logger';

// ---------------------------------------------------------------------------
// Minimal Discord REST helpers — replaces the Seyfert REST surface used by
// voice.ts and displayName.ts.
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not set');
  }
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
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fetch(url, {
      headers: { Authorization: `Bot ${botToken()}` },
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Concurrency limiter — prevents bursting Discord's rate limits when many
// guild member requests fire at once (e.g. resolving display names for a
// page of songs).
// ---------------------------------------------------------------------------

class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private max: number) {}

  acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

const memberFetchLimiter = new ConcurrencyLimiter(4);

// ---------------------------------------------------------------------------
// In-memory cache for guild member fetches.
// Display names / nicknames rarely change, so a 5-minute TTL avoids hitting
// Discord's tight rate limit on GET /guilds/{id}/members/{id} on every
// page navigation. 404s are cached for 1 minute to avoid re-querying users
// who are not in the guild. Errors are not cached.
// ---------------------------------------------------------------------------

const MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;
const NOT_FOUND_CACHE_TTL_MS = 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memberCache = new Map<string, CacheEntry<DiscordGuildMember | null>>();

// In-flight request deduplication: if two callers ask for the same member
// concurrently, they share one promise.
const inflightRequests = new Map<string, Promise<DiscordGuildMember | null>>();

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
 * Results are cached for 5 minutes (404s for 1 minute). In-flight requests
 * for the same user are deduplicated. Concurrency is limited to avoid
 * Discord rate limits.
 */
export async function fetchGuildMember(
  guildId: string,
  userId: string
): Promise<DiscordGuildMember | null> {
  const cacheKey = `${guildId}:${userId}`;

  // Check cache.
  const cached = memberCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Deduplicate in-flight requests.
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = doFetchGuildMember(guildId, userId, cacheKey);
  inflightRequests.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

async function doFetchGuildMember(
  guildId: string,
  userId: string,
  cacheKey: string
): Promise<DiscordGuildMember | null> {
  await memberFetchLimiter.acquire();
  try {
    const res = await discordFetch(`/guilds/${guildId}/members/${userId}`);

    if (res.status === 404) {
      memberCache.set(cacheKey, { data: null, expiresAt: Date.now() + NOT_FOUND_CACHE_TTL_MS });
      return null;
    }

    if (!res.ok) {
      logger.warn({ guildId, userId, status: res.status }, 'Failed to fetch guild member');
      // Don't cache errors — they may be transient.
      return null;
    }

    const member = (await res.json()) as DiscordGuildMember;
    memberCache.set(cacheKey, { data: member, expiresAt: Date.now() + MEMBER_CACHE_TTL_MS });
    return member;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'fetchGuildMember error'
    );
    return null;
  } finally {
    memberFetchLimiter.release();
  }
}
