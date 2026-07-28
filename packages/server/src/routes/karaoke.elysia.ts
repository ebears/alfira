import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { KaraokeSettings as KaraokeSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_KARAOKE } from '../shared/filterDefaults';

const KaraokeSchema = t.Object({
  enabled: t.Boolean(),
  level: t.Number({ minimum: 0, maximum: 1 }),
  monoLevel: t.Number({ minimum: 0, maximum: 1 }),
  filterBand: t.Number({ minimum: 50, maximum: 10000 }),
  filterWidth: t.Number({ minimum: 10, maximum: 10000 }),
});

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
  .derive(deriveAuth)

  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchKaraokeSettings(), {
    response: { 200: KaraokeSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertKaraokeSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: KaraokeSchema, response: { 200: KaraokeSettingsSchema } }
  );
