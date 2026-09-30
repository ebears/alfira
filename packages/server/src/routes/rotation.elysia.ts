import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { authPlugin } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import {
  RotationPatchSchema as RotationSchema,
  RotationSettings as RotationSettingsSchema,
} from '../shared/apiSchemas';
import { db, tables } from '../shared/db';
import { DEFAULT_ROTATION } from '../shared/filterDefaults';

function fetchRotationSettings(): { enabled: boolean; rotationHz: number } {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.rotationEnabled ?? DEFAULT_ROTATION.enabled,
    rotationHz: row?.rotationHz ?? DEFAULT_ROTATION.rotationHz,
  };
}

function upsertRotationSettings(data: { enabled: boolean; rotationHz: number }): void {
  db.insert(tables.guildSettings)
    .values({ id: 1, rotationEnabled: data.enabled, rotationHz: data.rotationHz })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { rotationEnabled: data.enabled, rotationHz: data.rotationHz },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const rotationPlugin = new Elysia({
  prefix: '/settings/rotation',
  name: 'settings-rotation',
})
  .use(authPlugin)

  .get('/', () => fetchRotationSettings(), {
    hasPermission: 'audio.manage',
    response: { 200: RotationSettingsSchema },
  })
  .patch(
    '/',
    async ({ body }) => {
      upsertRotationSettings(body);
      await syncAllFilters();

      return body;
    },
    {
      hasPermission: 'audio.manage',
      body: RotationSchema,
      response: { 200: RotationSettingsSchema },
    }
  );
