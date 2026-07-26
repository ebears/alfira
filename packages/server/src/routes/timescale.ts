import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { getGuildId } from '../lib/config';
import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
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

function handleTimescaleGet(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Response {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return json({
    enabled: row?.timescaleEnabled ?? DEFAULT_TIMESCALE.enabled,
    speed: row?.timescaleSpeed ?? DEFAULT_TIMESCALE.speed,
    pitch: row?.timescalePitch ?? DEFAULT_TIMESCALE.pitch,
    rate: row?.timescaleRate ?? DEFAULT_TIMESCALE.rate,
  });
}

async function handleTimescalePatch(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = v.safeParse(TimescaleSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, speed, pitch, rate } = parsed.output;

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      timescaleEnabled: enabled,
      timescaleSpeed: speed,
      timescalePitch: pitch,
      timescaleRate: rate,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        timescaleEnabled: enabled,
        timescaleSpeed: speed,
        timescalePitch: pitch,
        timescaleRate: rate,
      },
    })
    .run();

  await syncAllFilters();

  // Broadcast updated timescaleSpeed so the client's progress bar
  // immediately reflects the new playback rate.
  const player = getPlayer(getGuildId());
  if (player) {
    emitPlayerUpdate(player.getQueueState());
  }

  return json({ enabled, speed, pitch, rate });
}

export const handleTimescale = routeTable('/api/settings/timescale', {
  routes: [
    ['GET', '/', handleTimescaleGet],
    ['PATCH', '/', handleTimescalePatch],
  ],
});
