import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { TremoloSettings as TremoloSettingsSchema } from '../lib/responseSchemas';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_TREMOLO } from '../shared/filterDefaults';

const TremoloSchema = t.Object({
  enabled: t.Boolean(),
  frequency: t.Number({ minimum: 0.1, maximum: 14 }),
  depth: t.Number({ minimum: 0, maximum: 1 }),
});

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

export const tremoloPlugin = new Elysia({ prefix: '/settings/tremolo' })
  .derive(deriveAuth)

  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchTremoloSettings(), {
    response: { 200: TremoloSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertTremoloSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: TremoloSchema, response: { 200: TremoloSettingsSchema } }
  );
