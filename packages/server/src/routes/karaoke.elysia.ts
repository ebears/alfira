import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_KARAOKE } from '../shared/filterDefaults';

const KaraokeSchema = v.object({
  enabled: v.boolean(),
  level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  monoLevel: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  filterBand: v.pipe(v.number(), v.minValue(50), v.maxValue(10000)),
  filterWidth: v.pipe(v.number(), v.minValue(10), v.maxValue(10000)),
});

type KaraokeSettings = v.InferOutput<typeof KaraokeSchema>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchKaraokeSettings(): KaraokeSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.karaokeEnabled ?? DEFAULT_KARAOKE.enabled,
    level: row?.karaokeLevel ?? DEFAULT_KARAOKE.level,
    monoLevel: row?.karaokeMonoLevel ?? DEFAULT_KARAOKE.monoLevel,
    filterBand: row?.karaokeFilterBand ?? DEFAULT_KARAOKE.filterBand,
    filterWidth: row?.karaokeFilterWidth ?? DEFAULT_KARAOKE.filterWidth,
  };
}

function upsertKaraokeSettings(data: KaraokeSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      karaokeEnabled: data.enabled,
      karaokeLevel: data.level,
      karaokeMonoLevel: data.monoLevel,
      karaokeFilterBand: data.filterBand,
      karaokeFilterWidth: data.filterWidth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        karaokeEnabled: data.enabled,
        karaokeLevel: data.level,
        karaokeMonoLevel: data.monoLevel,
        karaokeFilterBand: data.filterBand,
        karaokeFilterWidth: data.filterWidth,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleGet(ctx: Record<string, unknown>): Response {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  return json(fetchKaraokeSettings());
}

async function handlePatch(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as KaraokeSettings;
  upsertKaraokeSettings(body);
  await syncAllFilters();

  return json(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function karaokePlugin(app: Elysia): Elysia {
  return app
    .get('/settings/karaoke', handleGet as never)
    .patch('/settings/karaoke', handlePatch as never, { body: KaraokeSchema }) as unknown as Elysia;
}
