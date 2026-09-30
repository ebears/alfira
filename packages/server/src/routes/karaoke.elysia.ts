import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  KaraokePatchSchema as KaraokeSchema,
  KaraokeSettings as KaraokeSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_KARAOKE } from '../shared/filterDefaults';

type KaraokeSettings = typeof KaraokeSchema.static;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchKaraokeSettings(): KaraokeSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.karaokeEnabled ?? DEFAULT_KARAOKE.enabled,
    level: row?.karaokeLevel ?? DEFAULT_KARAOKE.level,
    monoLevel: row?.karaokeMonoLevel ?? DEFAULT_KARAOKE.monoLevel,
    filterBand: row?.karaokeFilterBand ?? DEFAULT_KARAOKE.filterBand,
    filterWidth: row?.karaokeFilterWidth ?? DEFAULT_KARAOKE.filterWidth,
  };
}

function upsertKaraokeSettings(data: KaraokeSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      karaokeEnabled: data.enabled,
      karaokeLevel: data.level,
      karaokeMonoLevel: data.monoLevel,
      karaokeFilterBand: data.filterBand,
      karaokeFilterWidth: data.filterWidth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        karaokeEnabled: data.enabled,
        karaokeLevel: data.level,
        karaokeMonoLevel: data.monoLevel,
        karaokeFilterBand: data.filterBand,
        karaokeFilterWidth: data.filterWidth,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const karaokePlugin = new Elysia({ prefix: '/settings/karaoke', name: 'settings-karaoke' })
  .use(authPlugin)

  .get('/', () => fetchKaraokeSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: KaraokeSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertKaraokeSettings(body);
      await syncAllFilters();

      return body;
    },
    { hasPermission: 'audio.manage', body: KaraokeSchema, response: { 200: KaraokeSettingsSchema } }
  );
