import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
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

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const lowPassPlugin = new Elysia({ prefix: '/settings/lowpass' })
  .get('/', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return fetchLowPassSettings();
  })
  .patch(
    '/',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as typeof LowPassSchema.static;
      upsertLowPassSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: LowPassSchema }
  );
