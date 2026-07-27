import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { EQ_BAND_COLUMNS, eqBandsFromRow, eqBandValues } from '../lib/eqBands';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_EQUALIZER } from '../shared/filterDefaults';

const eqBandValue = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100));

const EqualizerSchema = v.object({
  bands: v.pipe(v.array(eqBandValue), v.length(15)),
  enabled: v.boolean(),
});

type EqualizerSettings = v.InferOutput<typeof EqualizerSchema>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchEqualizerSettings(): EqualizerSettings {
  const row = db
    .select({
      ...EQ_BAND_COLUMNS,
      eqEnabled: tables.guildSettings.eqEnabled,
    })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  return {
    bands: eqBandsFromRow(row),
    enabled: row?.eqEnabled ?? DEFAULT_EQUALIZER.enabled,
  };
}

function upsertEqualizerSettings(data: EqualizerSettings): void {
  db.insert(tables.guildSettings)
    .values({ id: 1, eqEnabled: data.enabled, ...eqBandValues(data.bands) })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { eqEnabled: data.enabled, ...eqBandValues(data.bands) },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const equalizerPlugin = new Elysia({ prefix: '/settings/equalizer' })
  .get('/', ((ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return json(fetchEqualizerSettings());
  }) as never)
  .patch(
    '/',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as EqualizerSettings;
      upsertEqualizerSettings(body);
      await syncAllFilters();

      return json(body);
    }) as never,
    { body: EqualizerSchema }
  );
