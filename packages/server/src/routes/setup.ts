import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { refreshGuildId } from '../lib/config';
import { type RouteContext } from '../lib/context';
import { botHeaders, fetchGuildRoles } from '../lib/discordRoles';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { type SetupChannel, type SetupGuild } from '../shared';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import { refreshEnabledSources } from '../startDiscord';

const DISCORD_API = 'https://discord.com/api/v10';

// ---------------------------------------------------------------------------
// In-memory cache for Discord channels.
// Prevents rate limiting when the frontend fetches these on every settings
// page visit. Entries expire after 60 seconds.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const channelsCache = new Map<string, CacheEntry<SetupChannel[]>>();

// ---------------------------------------------------------------------------
// Request body schema for POST /api/setup/complete
// ---------------------------------------------------------------------------
const SetupCompleteSchema = v.object({
  guildId: v.pipe(v.string(), v.minLength(1)),
  adminRoleIds: v.pipe(v.string(), v.minLength(1)),
  voiceIdleTimeoutMinutes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
  afkNotificationChannelId: v.optional(v.string()),
  requestNotificationChannelId: v.optional(v.string()),
  publicUrl: v.optional(v.string()),
  enabledSources: v.optional(v.string()),
});

// ---------------------------------------------------------------------------
// GET /api/setup/status
// Public — the frontend needs this to decide whether to show the wizard.
// ---------------------------------------------------------------------------
async function handleGetStatus(
  _ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  try {
    const row = db
      .select({
        setupCompleted: tables.guildSettings.setupCompleted,
        guildId: tables.guildSettings.guildId,
      })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get();

    if (!row) {
      return json({
        setupCompleted: false,
        guildName: null,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      });
    }

    let guildName: string | null = null;
    if (row.setupCompleted && row.guildId) {
      try {
        const res = await fetch(`${DISCORD_API}/guilds/${row.guildId}`, {
          headers: botHeaders(),
        });
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const guild = (await res.json()) as { name: string };
          guildName = guild.name;
        }
      } catch {
        // Guild name is cosmetic — don't fail the request.
      }
    }

    return json({
      setupCompleted: row.setupCompleted,
      guildName,
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
    });
  } catch {
    return json({
      setupCompleted: false,
      guildName: null,
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
    });
  }
}

// ---------------------------------------------------------------------------
// GET /api/setup/guilds
// Setup-mode guard — returns guilds the bot is a member of.
// ---------------------------------------------------------------------------
async function handleGetGuilds(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) {
    return guards;
  }

  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, 'Failed to fetch bot guilds from Discord');
      return json({ error: 'Could not fetch guild list from Discord.' }, 502);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const guilds = (await res.json()) as {
      id: string;
      name: string;
      icon: string | null;
    }[];

    const result: SetupGuild[] = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
    }));

    return json({ guilds: result });
  } catch (error) {
    logger.error({ error }, 'Error fetching bot guilds');
    return json({ error: 'Could not fetch guild list.' }, 502);
  }
}

// ---------------------------------------------------------------------------
// GET /api/setup/roles?guildId=...
// Setup-mode guard — returns roles for a specific guild.
// ---------------------------------------------------------------------------
async function handleGetRoles(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const guards = checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) {
    return guards;
  }

  const guildId = url.searchParams.get('guildId');
  if (!guildId) {
    return json({ error: 'guildId query parameter is required.' }, 400);
  }

  const roles = await fetchGuildRoles(guildId);
  return json({ roles });
}

// ---------------------------------------------------------------------------
// GET /api/setup/channels?guildId=...
// Setup-mode guard — returns text channels for a specific guild.
// ---------------------------------------------------------------------------
async function handleGetChannels(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const guards = checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) {
    return guards;
  }

  const guildId = url.searchParams.get('guildId');
  if (!guildId) {
    return json({ error: 'guildId query parameter is required.' }, 400);
  }

  // Serve from cache if available and not expired.
  const cached = channelsCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return json({ channels: cached.data });
  }

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ guildId, status: res.status }, 'Failed to fetch guild channels from Discord');
      return json({ error: 'Could not fetch channels from Discord.' }, 502);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const channels = (await res.json()) as {
      id: string;
      name: string;
      type: number;
    }[];

    // Type 0 = GUILD_TEXT. Filter to text channels only.
    const result: SetupChannel[] = channels
      .filter((c) => c.type === 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
      }));

    channelsCache.set(guildId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return json({ channels: result });
  } catch (error) {
    logger.error({ error }, 'Error fetching guild channels');
    return json({ error: 'Could not fetch channels.' }, 502);
  }
}

// ---------------------------------------------------------------------------
// POST /api/setup/complete
// Setup-mode guard — saves the configuration and marks setup as done.
// ---------------------------------------------------------------------------
async function handlePostComplete(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const parsed = v.safeParse(SetupCompleteSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { guildId, adminRoleIds, voiceIdleTimeoutMinutes: timeout } = parsed.output;
  const afkNotificationChannelId = parsed.output.afkNotificationChannelId ?? null;
  const requestNotificationChannelId = parsed.output.requestNotificationChannelId ?? null;
  const publicUrl = parsed.output.publicUrl?.trim() ?? null;
  const enabledSources = parsed.output.enabledSources?.trim() ?? 'youtube,soundcloud';

  try {
    db.insert(tables.guildSettings)
      .values({
        id: 1,
        guildId,
        setupCompleted: true,
        adminRoleIds,
        voiceIdleTimeoutMinutes: timeout,
        afkNotificationChannelId,
        requestNotificationChannelId,
        publicUrl,
        enabledSources,
      })
      .onConflictDoUpdate({
        target: tables.guildSettings.id,
        set: {
          guildId,
          setupCompleted: true,
          adminRoleIds,
          voiceIdleTimeoutMinutes: timeout,
          afkNotificationChannelId,
          requestNotificationChannelId,
          publicUrl,
          enabledSources,
        },
      })
      .run();

    // Update the in-memory guild ID cache so getGuildId() returns the new value.
    refreshGuildId(guildId);

    // Update the enabled sources cache.
    refreshEnabledSources(enabledSources);

    return json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to save setup configuration');
    return json({ error: 'Could not save configuration.' }, 500);
  }
}

export const handleSetup = routeTable('/api/setup', {
  routes: [
    ['GET', '/', handleGetStatus],
    ['GET', '/status', handleGetStatus],
    ['GET', '/guilds', handleGetGuilds],
    ['GET', '/roles', handleGetRoles],
    ['GET', '/channels', handleGetChannels],
    ['POST', '/complete', handlePostComplete],
  ],
});
