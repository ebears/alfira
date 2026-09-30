import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  LowPassPatchSchema as LowPassSchema,
  LowPassSettings as LowPassSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_LOW_PASS } from '../shared/filterDefaults';

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

export const lowPassPlugin = new Elysia({ prefix: '/settings/lowpass', name: 'settings-lowpass' })
  .use(authPlugin)

  .get('/', () => fetchLowPassSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: LowPassSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertLowPassSettings(body);
      await syncAllFilters();

      return body;
    },
    { hasPermission: 'audio.manage', body: LowPassSchema, response: { 200: LowPassSettingsSchema } }
  );
