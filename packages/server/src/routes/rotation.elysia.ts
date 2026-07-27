import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_ROTATION } from '../shared/filterDefaults';

const RotationSchema = v.object({
  enabled: v.boolean(),
  rotationHz: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
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
    return json(fetchRotationSettings());
  })
  .patch(
    '/',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as v.InferOutput<typeof RotationSchema>;
      upsertRotationSettings(body);
      await syncAllFilters();

      return json(body);
    },
    { body: RotationSchema }
  );
