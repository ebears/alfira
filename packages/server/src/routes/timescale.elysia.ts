import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { getGuildId } from '../lib/config';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
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
// Plugin
// ---------------------------------------------------------------------------

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const timescalePlugin = new Elysia({ prefix: '/settings/timescale' })
  .get('/', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return json(fetchTimescaleSettings());
  })
  .patch(
    '/',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
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
    },
    { body: TimescaleSchema }
  );
