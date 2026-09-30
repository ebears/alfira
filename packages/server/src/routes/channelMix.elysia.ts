import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  ChannelMixPatchSchema as ChannelMixSchema,
  ChannelMixSettings as ChannelMixSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_CHANNEL_MIX } from '../shared/filterDefaults';

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

export const channelMixPlugin = new Elysia({
  prefix: '/settings/channelmix',
  name: 'settings-channelmix',
})
  .use(authPlugin)

  .get('/', () => fetchChannelMixSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: ChannelMixSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertChannelMixSettings(body);
      await syncAllFilters();

      return body;
    },
    {
      hasPermission: 'audio.manage',
      body: ChannelMixSchema,
      response: { 200: ChannelMixSettingsSchema },
    }
  );
