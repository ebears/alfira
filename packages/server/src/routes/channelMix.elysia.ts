import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { ChannelMixSettings as ChannelMixSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_CHANNEL_MIX } from '../shared/filterDefaults';

const ChannelMixSchema = t.Object({
  enabled: t.Boolean(),
  leftToLeft: t.Number({ minimum: 0, maximum: 1 }),
  leftToRight: t.Number({ minimum: 0, maximum: 1 }),
  rightToLeft: t.Number({ minimum: 0, maximum: 1 }),
  rightToRight: t.Number({ minimum: 0, maximum: 1 }),
});

type ChannelMixSettings = typeof ChannelMixSchema.static;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchChannelMixSettings(): ChannelMixSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.channelMixEnabled ?? DEFAULT_CHANNEL_MIX.enabled,
    leftToLeft: row?.channelMixLeftToLeft ?? DEFAULT_CHANNEL_MIX.leftToLeft,
    leftToRight: row?.channelMixLeftToRight ?? DEFAULT_CHANNEL_MIX.leftToRight,
    rightToLeft: row?.channelMixRightToLeft ?? DEFAULT_CHANNEL_MIX.rightToLeft,
    rightToRight: row?.channelMixRightToRight ?? DEFAULT_CHANNEL_MIX.rightToRight,
  };
}

function upsertChannelMixSettings(data: ChannelMixSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      channelMixEnabled: data.enabled,
      channelMixLeftToLeft: data.leftToLeft,
      channelMixLeftToRight: data.leftToRight,
      channelMixRightToLeft: data.rightToLeft,
      channelMixRightToRight: data.rightToRight,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        channelMixEnabled: data.enabled,
        channelMixLeftToLeft: data.leftToLeft,
        channelMixLeftToRight: data.leftToRight,
        channelMixRightToLeft: data.rightToLeft,
        channelMixRightToRight: data.rightToRight,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const channelMixPlugin = new Elysia({ prefix: '/settings/channelmix' })
  .derive(deriveAuth)
  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchChannelMixSettings(), {
    response: { 200: ChannelMixSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertChannelMixSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: ChannelMixSchema, response: { 200: ChannelMixSettingsSchema } }
  );
