import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { LowPassSettings as LowPassSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_LOW_PASS } from '../shared/filterDefaults';

const LowPassSchema = t.Object({
  enabled: t.Boolean(),
  smoothing: t.Number({ minimum: 0, maximum: 60 }),
});

function fetchLowPassSettings(): { enabled: boolean; smoothing: number } {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.lowPassEnabled ?? DEFAULT_LOW_PASS.enabled,
    smoothing: row?.lowPassSmoothing ?? DEFAULT_LOW_PASS.smoothing,
  };
}

function upsertLowPassSettings(data: { enabled: boolean; smoothing: number }): void {
  db.insert(tables.guildSettings)
    .values({ id: 1, lowPassEnabled: data.enabled, lowPassSmoothing: data.smoothing })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { lowPassEnabled: data.enabled, lowPassSmoothing: data.smoothing },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const lowPassPlugin = new Elysia({ prefix: '/settings/lowpass' })
  .derive(deriveAuth)
  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchLowPassSettings(), {
    response: { 200: LowPassSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertLowPassSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: LowPassSchema, response: { 200: LowPassSettingsSchema } }
  );
