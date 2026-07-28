import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { EQ_BAND_COLUMNS, eqBandsFromRow, eqBandValues } from '../lib/eqBands';
import { EqualizerSettings as EqualizerSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_EQUALIZER } from '../shared/filterDefaults';

const eqBandValue = t.Integer({ minimum: 0, maximum: 100 });

const EqualizerSchema = t.Object({
  bands: t.Array(eqBandValue, { minLength: 15, maxLength: 15 }),
  enabled: t.Boolean(),
});

type EqualizerSettings = typeof EqualizerSchema.static;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchEqualizerSettings(): EqualizerSettings {
  const row = db
    .select({
      ...EQ_BAND_COLUMNS,
      eqEnabled: tables.guildSettings.eqEnabled,
    })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  return {
    bands: eqBandsFromRow(row),
    enabled: row?.eqEnabled ?? DEFAULT_EQUALIZER.enabled,
  };
}

function upsertEqualizerSettings(data: EqualizerSettings): void {
  db.insert(tables.guildSettings)
    .values({ id: 1, eqEnabled: data.enabled, ...eqBandValues(data.bands) })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { eqEnabled: data.enabled, ...eqBandValues(data.bands) },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const equalizerPlugin = new Elysia({
  prefix: '/settings/equalizer',
  name: 'settings-equalizer',
})
  .use(authPlugin)

  .get('/', () => fetchEqualizerSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: EqualizerSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertEqualizerSettings(body);
      await syncAllFilters();

      return body;
    },
    {
      hasPermission: 'audio.manage',
      body: EqualizerSchema,
      response: { 200: EqualizerSettingsSchema },
    }
  );
