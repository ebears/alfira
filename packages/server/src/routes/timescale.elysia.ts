import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { getGuildId } from '../lib/config';
import { elysiaJson as json } from '../lib/elysia-adapter';
import { requireAdminOrPermission } from '../lib/elysia-guards';
import { emitPlayerUpdate } from '../lib/socket';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_TIMESCALE } from '../shared/filterDefaults';
import { getPlayer } from '../startDiscord';

const TimescaleSchema = v.object({
  enabled: v.boolean(),
  speed: v.pipe(v.number(), v.minValue(0.5), v.maxValue(2)),
  pitch: v.pipe(v.number(), v.minValue(0.5), v.maxValue(2)),
  rate: v.pipe(v.number(), v.minValue(0.5), v.maxValue(2)),
});

type TimescaleSettings = v.InferOutput<typeof TimescaleSchema>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchTimescaleSettings(): TimescaleSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.timescaleEnabled ?? DEFAULT_TIMESCALE.enabled,
    speed: row?.timescaleSpeed ?? DEFAULT_TIMESCALE.speed,
    pitch: row?.timescalePitch ?? DEFAULT_TIMESCALE.pitch,
    rate: row?.timescaleRate ?? DEFAULT_TIMESCALE.rate,
  };
}

function upsertTimescaleSettings(data: TimescaleSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      timescaleEnabled: data.enabled,
      timescaleSpeed: data.speed,
      timescalePitch: data.pitch,
      timescaleRate: data.rate,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        timescaleEnabled: data.enabled,
        timescaleSpeed: data.speed,
        timescalePitch: data.pitch,
        timescaleRate: data.rate,
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

  return json(fetchTimescaleSettings());
}

async function handlePatch(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as TimescaleSettings;
  upsertTimescaleSettings(body);
  await syncAllFilters();

  // Broadcast updated timescaleSpeed so the client's progress bar
  // immediately reflects the new playback rate.
  const player = getPlayer(getGuildId());
  if (player) {
    emitPlayerUpdate(player.getQueueState());
  }

  return json(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function timescalePlugin(app: Elysia): Elysia {
  return app
    .get('/settings/timescale', handleGet as never)
    .patch('/settings/timescale', handlePatch as never, {
      body: TimescaleSchema,
    }) as unknown as Elysia;
}
