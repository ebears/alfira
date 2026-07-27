import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
import { EQ_BAND_COLUMNS, eqBandsFromRow, eqBandValues } from '../lib/eqBands';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_EQUALIZER } from '../shared/filterDefaults';

const eqBandValue = t.Integer({ minimum: 0, maximum: 100 });

const EqualizerSchema = t.Object({
  bands: t.Array(eqBandValue, { minLength: 15, maxLength: 15 }),
  enabled: t.Boolean(),
});

type EqualizerSettings = typeof EqualizerSchema.static;

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
  .get('/', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return fetchEqualizerSettings();
  })
  .patch(
    '/',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as EqualizerSettings;
      upsertEqualizerSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: EqualizerSchema }
  );
