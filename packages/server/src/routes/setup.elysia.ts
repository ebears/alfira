import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { refreshGuildId } from '../lib/config';
import { botHeaders, fetchGuildRoles } from '../lib/discordRoles';
import { setupModeGuard } from '../lib/elysia-guards';
import { type SetupChannel, type SetupGuild } from '../shared';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import { refreshEnabledSources } from '../startDiscord';

const DISCORD_API = 'https://discord.com/api/v10';

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const channelsCache = new Map<string, CacheEntry<SetupChannel[]>>();

// ---------------------------------------------------------------------------
// Request body schema for POST /api/setup/complete
// ---------------------------------------------------------------------------
const SetupCompleteSchema = t.Object({
  guildId: t.String({ minLength: 1 }),
  adminRoleIds: t.String({ minLength: 1 }),
  voiceIdleTimeoutMinutes: t.Integer({ minimum: 1, maximum: 120 }),
  afkNotificationChannelId: t.Optional(t.String()),
  requestNotificationChannelId: t.Optional(t.String()),
  publicUrl: t.Optional(t.String()),
  enabledSources: t.Optional(t.String()),
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchSetupStatus(): {
  setupCompleted: boolean;
  guildId: string | null;
} | null {
  return (
    db
      .select({
        setupCompleted: tables.guildSettings.setupCompleted,
        guildId: tables.guildSettings.guildId,
      })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get() ?? null
  );
}

async function fetchGuildName(guildId: string): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
      headers: botHeaders(),
    });
    if (res.ok) {
      const guild = (await res.json()) as { name: string };
      return guild.name;
    }
  } catch {
    // Guild name is cosmetic — don't fail the request.
  }
  return null;
}

async function fetchBotGuilds(): Promise<SetupGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: botHeaders(),
  });

  if (!res.ok) {
    logger.error({ status: res.status }, 'Failed to fetch bot guilds from Discord');
    return [];
  }

  const guilds = (await res.json()) as {
    id: string;
    name: string;
    icon: string | null;
  }[];

  return guilds.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
  }));
}

async function fetchGuildChannels(guildId: string): Promise<SetupChannel[]> {
  const cached = channelsCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: botHeaders(),
  });

  if (!res.ok) {
    logger.error({ guildId, status: res.status }, 'Failed to fetch guild channels from Discord');
    return [];
  }

  const channels = (await res.json()) as {
    id: string;
    name: string;
    type: number;
  }[];

  const result: SetupChannel[] = channels
    .filter((c) => c.type === 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
    }));

  channelsCache.set(guildId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function saveSetupConfig(data: typeof SetupCompleteSchema.static): void {
  const { guildId, adminRoleIds, voiceIdleTimeoutMinutes: timeout } = data;
  const afkNotificationChannelId = data.afkNotificationChannelId ?? null;
  const requestNotificationChannelId = data.requestNotificationChannelId ?? null;
  const publicUrl = data.publicUrl?.trim() ?? null;
  const enabledSources = data.enabledSources?.trim() ?? 'youtube,soundcloud';

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

  refreshGuildId(guildId);
  refreshEnabledSources(enabledSources);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const setupPlugin = new Elysia({ prefix: '/setup' })
  .derive(deriveAuth)
  .get('/', async () => {
    try {
      const row = fetchSetupStatus();

      if (!row) {
        return Response.json({
          setupCompleted: false,
          guildName: null,
          clientId: process.env.DISCORD_CLIENT_ID ?? '',
        });
      }

      let guildName: string | null = null;
      if (row.setupCompleted && row.guildId) {
        guildName = await fetchGuildName(row.guildId);
      }

      return Response.json({
        setupCompleted: row.setupCompleted,
        guildName,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      });
    } catch {
      return Response.json({
        setupCompleted: false,
        guildName: null,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      });
    }
  })
  .get('/status', async () => {
    try {
      const row = fetchSetupStatus();

      if (!row) {
        return Response.json({
          setupCompleted: false,
          guildName: null,
          clientId: process.env.DISCORD_CLIENT_ID ?? '',
        });
      }

      let guildName: string | null = null;
      if (row.setupCompleted && row.guildId) {
        guildName = await fetchGuildName(row.guildId);
      }

      return Response.json({
        setupCompleted: row.setupCompleted,
        guildName,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      });
    } catch {
      return Response.json({
        setupCompleted: false,
        guildName: null,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      });
    }
  })
  .use(setupModeGuard)
  .get('/guilds', () => {
    return (async (): Promise<Response> => {
      try {
        const guilds = await fetchBotGuilds();
        return Response.json({ guilds });
      } catch (error) {
        logger.error({ error }, 'Error fetching bot guilds');
        return Response.json({ error: 'Could not fetch guild list.' }, { status: 502 });
      }
    })();
  })
  .get('/roles', async ({ query }) => {
    const guildId = (query as Record<string, string>).guildId;
    if (!guildId) {
      return Response.json({ error: 'guildId query parameter is required.' }, { status: 400 });
    }

    const roles = await fetchGuildRoles(guildId);
    return Response.json({ roles });
  })
  .get('/channels', async ({ query }) => {
    const guildId = (query as Record<string, string>).guildId;
    if (!guildId) {
      return Response.json({ error: 'guildId query parameter is required.' }, { status: 400 });
    }

    try {
      const channels = await fetchGuildChannels(guildId);
      return Response.json({ channels });
    } catch (error) {
      logger.error({ error }, 'Error fetching guild channels');
      return Response.json({ error: 'Could not fetch channels.' }, { status: 502 });
    }
  })
  .post(
    '/complete',
    ({ body }) => {
      try {
        saveSetupConfig(body);
        return Response.json({ success: true });
      } catch (error) {
        logger.error({ error }, 'Failed to save setup configuration');
        return Response.json({ error: 'Could not save configuration.' }, { status: 500 });
      }
    },
    { body: SetupCompleteSchema }
  );
