import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { refreshGuildId } from '../lib/config';
import { botHeaders, fetchGuildRoles } from '../lib/discordRoles';
import { setupModeGuard } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import {
  SetupChannel as SetupChannelSchema,
  SetupGuild as SetupGuildSchema,
  SetupRole as SetupRoleSchema,
  SetupStatus as SetupStatusSchema,
} from '../lib/responseSchemas';
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

export const setupPlugin = new Elysia({ prefix: '/setup', name: 'setup' })
  .derive(deriveAuth)

  .get(
    '/',
    async () => {
      const row = fetchSetupStatus();

      if (!row) {
        return {
          setupCompleted: false,
          guildName: null,
          clientId: process.env.DISCORD_CLIENT_ID ?? '',
        };
      }

      let guildName: string | null = null;
      if (row.setupCompleted && row.guildId) {
        guildName = await fetchGuildName(row.guildId);
      }

      return {
        setupCompleted: row.setupCompleted,
        guildName,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      };
    },
    { response: { 200: SetupStatusSchema } }
  )
  .get(
    '/status',
    async () => {
      const row = fetchSetupStatus();

      if (!row) {
        return {
          setupCompleted: false,
          guildName: null,
          clientId: process.env.DISCORD_CLIENT_ID ?? '',
        };
      }

      let guildName: string | null = null;
      if (row.setupCompleted && row.guildId) {
        guildName = await fetchGuildName(row.guildId);
      }

      return {
        setupCompleted: row.setupCompleted,
        guildName,
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
      };
    },
    { response: { 200: SetupStatusSchema } }
  )
  .use(setupModeGuard)
  .get(
    '/guilds',
    async () => {
      try {
        const guilds = await fetchBotGuilds();
        return { guilds };
      } catch (error) {
        logger.error({ error }, 'Error fetching bot guilds');
        throw new ApiError(502, 'Could not fetch guild list.');
      }
    },
    { response: { 200: t.Object({ guilds: t.Array(SetupGuildSchema) }) } }
  )
  .get(
    '/roles',
    async ({ query }) => {
      const guildId = query.guildId;

      const roles = await fetchGuildRoles(guildId);
      return { roles };
    },
    {
      query: t.Object({ guildId: t.String() }),
      response: { 200: t.Object({ roles: t.Array(SetupRoleSchema) }) },
    }
  )
  .get(
    '/channels',
    async ({ query }) => {
      const guildId = query.guildId;

      try {
        const channels = await fetchGuildChannels(guildId);
        return { channels };
      } catch (error) {
        logger.error({ error }, 'Error fetching guild channels');
        throw new ApiError(502, 'Could not fetch channels.');
      }
    },
    {
      query: t.Object({ guildId: t.String() }),
      response: { 200: t.Object({ channels: t.Array(SetupChannelSchema) }) },
    }
  )
  .post(
    '/complete',
    ({ body }) => {
      try {
        saveSetupConfig(body);
        return { success: true };
      } catch (error) {
        logger.error({ error }, 'Failed to save setup configuration');
        throw new ApiError(500, 'Could not save configuration.');
      }
    },
    { body: SetupCompleteSchema, response: { 200: t.Object({ success: t.Literal(true) }) } }
  );
