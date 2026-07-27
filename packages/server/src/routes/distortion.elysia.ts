import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_DISTORTION } from '../shared/filterDefaults';

const DistortionSchema = v.object({
  enabled: v.boolean(),
  sinOffset: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
  sinScale: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
  cosOffset: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
  cosScale: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
  tanOffset: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
  tanScale: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
  offset: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
  scale: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
});

type DistortionSettings = v.InferOutput<typeof DistortionSchema>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchDistortionSettings(): DistortionSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.distortionEnabled ?? DEFAULT_DISTORTION.enabled,
    sinOffset: row?.distortionSinOffset ?? DEFAULT_DISTORTION.sinOffset,
    sinScale: row?.distortionSinScale ?? DEFAULT_DISTORTION.sinScale,
    cosOffset: row?.distortionCosOffset ?? DEFAULT_DISTORTION.cosOffset,
    cosScale: row?.distortionCosScale ?? DEFAULT_DISTORTION.cosScale,
    tanOffset: row?.distortionTanOffset ?? DEFAULT_DISTORTION.tanOffset,
    tanScale: row?.distortionTanScale ?? DEFAULT_DISTORTION.tanScale,
    offset: row?.distortionOffset ?? DEFAULT_DISTORTION.offset,
    scale: row?.distortionScale ?? DEFAULT_DISTORTION.scale,
  };
}

function upsertDistortionSettings(data: DistortionSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      distortionEnabled: data.enabled,
      distortionSinOffset: data.sinOffset,
      distortionSinScale: data.sinScale,
      distortionCosOffset: data.cosOffset,
      distortionCosScale: data.cosScale,
      distortionTanOffset: data.tanOffset,
      distortionTanScale: data.tanScale,
      distortionOffset: data.offset,
      distortionScale: data.scale,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        distortionEnabled: data.enabled,
        distortionSinOffset: data.sinOffset,
        distortionSinScale: data.sinScale,
        distortionCosOffset: data.cosOffset,
        distortionCosScale: data.cosScale,
        distortionTanOffset: data.tanOffset,
        distortionTanScale: data.tanScale,
        distortionOffset: data.offset,
        distortionScale: data.scale,
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

  return json(fetchDistortionSettings());
}

async function handlePatch(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as DistortionSettings;
  upsertDistortionSettings(body);
  await syncAllFilters();

  return json(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function distortionPlugin(app: Elysia): Elysia {
  return app
    .get('/settings/distortion', handleGet as never)
    .patch('/settings/distortion', handlePatch as never, {
      body: DistortionSchema,
    }) as unknown as Elysia;
}
