import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_ROTATION } from '../shared/filterDefaults';

const RotationSchema = t.Object({
  enabled: t.Boolean(),
  rotationHz: t.Number({ minimum: 0, maximum: 1 }),
});

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

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const rotationPlugin = new Elysia({ prefix: '/settings/rotation' })
  .get('/', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return fetchRotationSettings();
  })
  .patch(
    '/',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as typeof RotationSchema.static;
      upsertRotationSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: RotationSchema }
  );
