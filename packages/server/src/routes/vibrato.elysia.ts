import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { VibratoSettings as VibratoSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_VIBRATO } from '../shared/filterDefaults';

const VibratoSchema = t.Object({
  enabled: t.Boolean(),
  frequency: t.Number({ minimum: 0.1, maximum: 14 }),
  depth: t.Number({ minimum: 0, maximum: 1 }),
});

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

export const vibratoPlugin = new Elysia({ prefix: '/settings/vibrato' })
  .derive(deriveAuth)
  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchVibratoSettings(), {
    response: { 200: VibratoSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertVibratoSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: VibratoSchema, response: { 200: VibratoSettingsSchema } }
  );
