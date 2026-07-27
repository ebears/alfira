import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
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

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const tremoloPlugin = new Elysia({ prefix: '/settings/tremolo' })
  .get('/', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return fetchTremoloSettings();
  })
  .patch(
    '/',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as typeof TremoloSchema.static;
      upsertTremoloSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: TremoloSchema }
  );
