import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_TREMOLO } from '../shared/filterDefaults';

const TremoloSchema = v.object({
  enabled: v.boolean(),
  frequency: v.pipe(v.number(), v.minValue(0.1), v.maxValue(14)),
  depth: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
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
  .get('/', ((ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return json(fetchTremoloSettings());
  }) as never)
  .patch(
    '/',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as v.InferOutput<typeof TremoloSchema>;
      upsertTremoloSettings(body);
      await syncAllFilters();

      return json(body);
    }) as never,
    { body: TremoloSchema }
  ) as unknown as Elysia;
