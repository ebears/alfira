import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  TremoloPatchSchema as TremoloSchema,
  TremoloSettings as TremoloSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_TREMOLO } from '../shared/filterDefaults';

function fetchTremoloSettings(): { enabled: boolean; frequency: number; depth: number } {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.tremoloEnabled ?? DEFAULT_TREMOLO.enabled,
    frequency: row?.tremoloFrequency ?? DEFAULT_TREMOLO.frequency,
    depth: row?.tremoloDepth ?? DEFAULT_TREMOLO.depth,
  };
}

function upsertTremoloSettings(data: { enabled: boolean; frequency: number; depth: number }): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      tremoloEnabled: data.enabled,
      tremoloFrequency: data.frequency,
      tremoloDepth: data.depth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        tremoloEnabled: data.enabled,
        tremoloFrequency: data.frequency,
        tremoloDepth: data.depth,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const tremoloPlugin = new Elysia({ prefix: '/settings/tremolo', name: 'settings-tremolo' })
  .use(authPlugin)

  .get('/', () => fetchTremoloSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: TremoloSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertTremoloSettings(body);
      await syncAllFilters();

      return body;
    },
    { hasPermission: 'audio.manage', body: TremoloSchema, response: { 200: TremoloSettingsSchema } }
  );
