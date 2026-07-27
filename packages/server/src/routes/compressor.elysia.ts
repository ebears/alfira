import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/elysia-adapter';
import { requireAdminOrPermission } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_COMPRESSOR } from '../shared/filterDefaults';

const CompressorSchema = v.object({
  enabled: v.boolean(),
  threshold: v.pipe(v.number(), v.integer(), v.minValue(-60), v.maxValue(0)),
  ratio: v.pipe(v.number(), v.minValue(1), v.maxValue(20)),
  attack: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  release: v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(1000)),
  gain: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(24)),
});

type CompressorSettings = v.InferOutput<typeof CompressorSchema>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchCompressorSettings(): CompressorSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.compressorEnabled ?? DEFAULT_COMPRESSOR.enabled,
    threshold: row?.compressorThreshold ?? DEFAULT_COMPRESSOR.threshold,
    ratio: row?.compressorRatio ?? DEFAULT_COMPRESSOR.ratio,
    attack: row?.compressorAttack ?? DEFAULT_COMPRESSOR.attack,
    release: row?.compressorRelease ?? DEFAULT_COMPRESSOR.release,
    gain: row?.compressorGain ?? DEFAULT_COMPRESSOR.gain,
  };
}

function upsertCompressorSettings(data: CompressorSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      compressorEnabled: data.enabled,
      compressorThreshold: data.threshold,
      compressorRatio: data.ratio,
      compressorAttack: data.attack,
      compressorRelease: data.release,
      compressorGain: data.gain,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        compressorEnabled: data.enabled,
        compressorThreshold: data.threshold,
        compressorRatio: data.ratio,
        compressorAttack: data.attack,
        compressorRelease: data.release,
        compressorGain: data.gain,
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

  return json(fetchCompressorSettings());
}

async function handlePatch(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as CompressorSettings;
  upsertCompressorSettings(body);
  await syncAllFilters();

  return json(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function compressorPlugin(app: Elysia): Elysia {
  return app
    .get('/settings/compressor', handleGet as never)
    .patch('/settings/compressor', handlePatch as never, {
      body: CompressorSchema,
    }) as unknown as Elysia;
}
