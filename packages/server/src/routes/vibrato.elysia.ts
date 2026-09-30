import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  VibratoPatchSchema as VibratoSchema,
  VibratoSettings as VibratoSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_VIBRATO } from '../shared/filterDefaults';

function fetchVibratoSettings(): { enabled: boolean; frequency: number; depth: number } {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.vibratoEnabled ?? DEFAULT_VIBRATO.enabled,
    frequency: row?.vibratoFrequency ?? DEFAULT_VIBRATO.frequency,
    depth: row?.vibratoDepth ?? DEFAULT_VIBRATO.depth,
  };
}

function upsertVibratoSettings(data: { enabled: boolean; frequency: number; depth: number }): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      vibratoEnabled: data.enabled,
      vibratoFrequency: data.frequency,
      vibratoDepth: data.depth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        vibratoEnabled: data.enabled,
        vibratoFrequency: data.frequency,
        vibratoDepth: data.depth,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const vibratoPlugin = new Elysia({ prefix: '/settings/vibrato', name: 'settings-vibrato' })
  .use(authPlugin)

  .get('/', () => fetchVibratoSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: VibratoSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertVibratoSettings(body);
      await syncAllFilters();

      return body;
    },
    { hasPermission: 'audio.manage', body: VibratoSchema, response: { 200: VibratoSettingsSchema } }
  );
