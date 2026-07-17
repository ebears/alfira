import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { refreshGuildId } from '../lib/config';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import type { SetupChannel, SetupGuild, SetupRole } from '../shared';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';

const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders(): Record<string, string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');
  return { Authorization: `Bot ${token}` };
}

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
    const row = await db
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
  const guards = await checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) return guards;

  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, 'Failed to fetch bot guilds from Discord');
      return json({ error: 'Could not fetch guild list from Discord.' }, 502);
    }

    const guilds = (await res.json()) as Array<{
      id: string;
      name: string;
      icon: string | null;
    }>;

    const result: SetupGuild[] = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
    }));

    return json({ guilds: result });
  } catch (err) {
    logger.error({ err }, 'Error fetching bot guilds');
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
  const guards = await checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) return guards;

  const guildId = url.searchParams.get('guildId');
  if (!guildId) {
    return json({ error: 'guildId query parameter is required.' }, 400);
  }

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ guildId, status: res.status }, 'Failed to fetch guild roles from Discord');
      return json({ error: 'Could not fetch roles from Discord.' }, 502);
    }

    const roles = (await res.json()) as Array<{
      id: string;
      name: string;
      color: number;
      managed: boolean;
    }>;

    // Filter out @everyone (id matches guildId) and managed roles (bot integrations).
    const result: SetupRole[] = roles
      .filter((r) => r.id !== guildId && !r.managed)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
      }));

    return json({ roles: result });
  } catch (err) {
    logger.error({ err }, 'Error fetching guild roles');
    return json({ error: 'Could not fetch roles.' }, 502);
  }
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
  const guards = await checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) return guards;

  const guildId = url.searchParams.get('guildId');
  if (!guildId) {
    return json({ error: 'guildId query parameter is required.' }, 400);
  }

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ guildId, status: res.status }, 'Failed to fetch guild channels from Discord');
      return json({ error: 'Could not fetch channels from Discord.' }, 502);
    }

    const channels = (await res.json()) as Array<{
      id: string;
      name: string;
      type: number;
    }>;

    // Type 0 = GUILD_TEXT. Filter to text channels only.
    const result: SetupChannel[] = channels
      .filter((c) => c.type === 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
      }));

    return json({ channels: result });
  } catch (err) {
    logger.error({ err }, 'Error fetching guild channels');
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
  const guards = await checkGuards(ctx, { setupMode: true });
  if (guards instanceof Response) return guards;

  let body: {
    guildId?: unknown;
    adminRoleIds?: unknown;
    voiceIdleTimeoutMinutes?: unknown;
    afkNotificationChannelId?: unknown;
    requestNotificationChannelId?: unknown;
    publicUrl?: unknown;
    enabledSources?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  // Validate guildId
  if (!body.guildId || typeof body.guildId !== 'string') {
    return json({ error: 'guildId is required and must be a string.' }, 400);
  }

  // Validate adminRoleIds
  if (!body.adminRoleIds || typeof body.adminRoleIds !== 'string') {
    return json({ error: 'adminRoleIds is required and must be a comma-separated string.' }, 400);
  }

  // Validate voiceIdleTimeoutMinutes
  const timeout = Number(body.voiceIdleTimeoutMinutes);
  if (
    body.voiceIdleTimeoutMinutes === undefined ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 120
  ) {
    return json({ error: 'voiceIdleTimeoutMinutes must be an integer between 1 and 120.' }, 400);
  }

  // Validate afkNotificationChannelId (optional)
  const afkNotificationChannelId =
    body.afkNotificationChannelId && typeof body.afkNotificationChannelId === 'string'
      ? body.afkNotificationChannelId
      : null;

  // Validate requestNotificationChannelId (optional)
  const requestNotificationChannelId =
    body.requestNotificationChannelId && typeof body.requestNotificationChannelId === 'string'
      ? body.requestNotificationChannelId
      : null;

  // Validate publicUrl (optional)
  const publicUrl =
    body.publicUrl && typeof body.publicUrl === 'string' ? body.publicUrl.trim() : null;

  // Validate enabledSources (optional, defaults to all sources)
  const enabledSources =
    body.enabledSources && typeof body.enabledSources === 'string'
      ? body.enabledSources.trim()
      : 'youtube,soundcloud';

  try {
    await db
      .insert(tables.guildSettings)
      .values({
        id: 1,
        guildId: body.guildId,
        setupCompleted: true,
        adminRoleIds: body.adminRoleIds,
        voiceIdleTimeoutMinutes: timeout,
        afkNotificationChannelId,
        requestNotificationChannelId,
        publicUrl,
        enabledSources,
      })
      .onConflictDoUpdate({
        target: tables.guildSettings.id,
        set: {
          guildId: body.guildId,
          setupCompleted: true,
          adminRoleIds: body.adminRoleIds,
          voiceIdleTimeoutMinutes: timeout,
          afkNotificationChannelId,
          requestNotificationChannelId,
          publicUrl,
          enabledSources,
        },
      })
      .run();

    // Update the in-memory guild ID cache so getGuildId() returns the new value.
    refreshGuildId(body.guildId);

    // Update the enabled sources cache.
    const { refreshEnabledSources } = await import('../startDiscord');
    refreshEnabledSources(enabledSources);

    return json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to save setup configuration');
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
