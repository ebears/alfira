import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_VIBRATO } from '../shared/filterDefaults';

const VibratoSchema = v.object({
  enabled: v.boolean(),
  frequency: v.pipe(v.number(), v.minValue(0.1), v.maxValue(14)),
  depth: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
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

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const vibratoPlugin = new Elysia({ prefix: '/settings/vibrato' })
  .get('/', ((ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return json(fetchVibratoSettings());
  }) as never)
  .patch(
    '/',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as v.InferOutput<typeof VibratoSchema>;
      upsertVibratoSettings(body);
      await syncAllFilters();

      return json(body);
    }) as never,
    { body: VibratoSchema }
  ) as unknown as Elysia;
