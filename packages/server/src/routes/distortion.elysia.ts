import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { DistortionSettings as DistortionSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_DISTORTION } from '../shared/filterDefaults';

const DistortionSchema = t.Object({
  enabled: t.Boolean(),
  sinOffset: t.Number({ minimum: -1, maximum: 1 }),
  sinScale: t.Number({ minimum: 0, maximum: 5 }),
  cosOffset: t.Number({ minimum: -1, maximum: 1 }),
  cosScale: t.Number({ minimum: 0, maximum: 5 }),
  tanOffset: t.Number({ minimum: -1, maximum: 1 }),
  tanScale: t.Number({ minimum: 0, maximum: 5 }),
  offset: t.Number({ minimum: -1, maximum: 1 }),
  scale: t.Number({ minimum: 0, maximum: 5 }),
});

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

export const distortionPlugin = new Elysia({ prefix: '/settings/distortion' })
  .derive(deriveAuth)
  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchDistortionSettings(), {
    response: { 200: DistortionSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertDistortionSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: DistortionSchema, response: { 200: DistortionSettingsSchema } }
  );
