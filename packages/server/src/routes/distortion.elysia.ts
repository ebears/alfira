import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  DistortionPatchSchema as DistortionSchema,
  DistortionSettings as DistortionSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_DISTORTION } from '../shared/filterDefaults';

type DistortionSettings = typeof DistortionSchema.static;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchDistortionSettings(): DistortionSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.distortionEnabled ?? DEFAULT_DISTORTION.enabled,
    sinOffset: row?.distortionSinOffset ?? DEFAULT_DISTORTION.sinOffset,
    sinScale: row?.distortionSinScale ?? DEFAULT_DISTORTION.sinScale,
    cosOffset: row?.distortionCosOffset ?? DEFAULT_DISTORTION.cosOffset,
    cosScale: row?.distortionCosScale ?? DEFAULT_DISTORTION.cosScale,
    tanOffset: row?.distortionTanOffset ?? DEFAULT_DISTORTION.tanOffset,
    tanScale: row?.distortionTanScale ?? DEFAULT_DISTORTION.tanScale,
    offset: row?.distortionOffset ?? DEFAULT_DISTORTION.offset,
    scale: row?.distortionScale ?? DEFAULT_DISTORTION.scale,
  };
}

function upsertDistortionSettings(data: DistortionSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      distortionEnabled: data.enabled,
      distortionSinOffset: data.sinOffset,
      distortionSinScale: data.sinScale,
      distortionCosOffset: data.cosOffset,
      distortionCosScale: data.cosScale,
      distortionTanOffset: data.tanOffset,
      distortionTanScale: data.tanScale,
      distortionOffset: data.offset,
      distortionScale: data.scale,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        distortionEnabled: data.enabled,
        distortionSinOffset: data.sinOffset,
        distortionSinScale: data.sinScale,
        distortionCosOffset: data.cosOffset,
        distortionCosScale: data.cosScale,
        distortionTanOffset: data.tanOffset,
        distortionTanScale: data.tanScale,
        distortionOffset: data.offset,
        distortionScale: data.scale,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const distortionPlugin = new Elysia({
  prefix: '/settings/distortion',
  name: 'settings-distortion',
})
  .use(authPlugin)

  .get('/', () => fetchDistortionSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: DistortionSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertDistortionSettings(body);
      await syncAllFilters();

      return body;
    },
    {
      hasPermission: 'audio.manage',
      body: DistortionSchema,
      response: { 200: DistortionSettingsSchema },
    }
  );
