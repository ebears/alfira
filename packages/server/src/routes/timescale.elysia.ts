import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { getGuildId } from '../lib/config';
import { authPlugin } from '../lib/elysia-guards';
import { TimescaleSettings as TimescaleSettingsSchema } from '../lib/responseSchemas';
import { emitPlayerUpdate } from '../lib/socket';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_TIMESCALE } from '../shared/filterDefaults';
import { getPlayer } from '../startDiscord';

const TimescaleSchema = t.Object({
  enabled: t.Boolean(),
  speed: t.Number({ minimum: 0.5, maximum: 2 }),
  pitch: t.Number({ minimum: 0.5, maximum: 2 }),
  rate: t.Number({ minimum: 0.5, maximum: 2 }),
});

type TimescaleSettings = typeof TimescaleSchema.static;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchTimescaleSettings(): TimescaleSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.timescaleEnabled ?? DEFAULT_TIMESCALE.enabled,
    speed: row?.timescaleSpeed ?? DEFAULT_TIMESCALE.speed,
    pitch: row?.timescalePitch ?? DEFAULT_TIMESCALE.pitch,
    rate: row?.timescaleRate ?? DEFAULT_TIMESCALE.rate,
  };
}

function upsertTimescaleSettings(data: TimescaleSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      timescaleEnabled: data.enabled,
      timescaleSpeed: data.speed,
      timescalePitch: data.pitch,
      timescaleRate: data.rate,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        timescaleEnabled: data.enabled,
        timescaleSpeed: data.speed,
        timescalePitch: data.pitch,
        timescaleRate: data.rate,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const timescalePlugin = new Elysia({
  prefix: '/settings/timescale',
  name: 'settings-timescale',
})
  .use(authPlugin)

  .get('/', () => fetchTimescaleSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: TimescaleSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertTimescaleSettings(body);
      await syncAllFilters();

      // Broadcast updated timescaleSpeed so the client's progress bar
      // immediately reflects the new playback rate.
      const player = getPlayer(getGuildId());
      if (player) {
        emitPlayerUpdate(player.getQueueState());
      }

      return body;
    },
    {
      hasPermission: 'audio.manage',
      body: TimescaleSchema,
      response: { 200: TimescaleSettingsSchema },
    }
  );
