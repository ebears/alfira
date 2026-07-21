import { eq } from 'drizzle-orm';

import { getGuildId } from '../lib/config';
import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { emitPlayerUpdate } from '../lib/socket';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { getPlayer } from '../startDiscord';

interface TimescalePayload {
  enabled: boolean;
  speed: number;
  pitch: number;
  rate: number;
}

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
    enabled: row?.timescaleEnabled ?? false,
    speed: row?.timescaleSpeed ?? 1.0,
    pitch: row?.timescalePitch ?? 1.0,
    rate: row?.timescaleRate ?? 1.0,
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

  let body: TimescalePayload;
  try {
    body = (await request.json()) as TimescalePayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, speed, pitch, rate } = body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof speed !== 'number' || speed < 0.5 || speed > 2.0) {
    return json({ error: 'speed must be number 0.5 to 2.0' }, 400);
  }
  if (typeof pitch !== 'number' || pitch < 0.5 || pitch > 2.0) {
    return json({ error: 'pitch must be number 0.5 to 2.0' }, 400);
  }
  if (typeof rate !== 'number' || rate < 0.5 || rate > 2.0) {
    return json({ error: 'rate must be number 0.5 to 2.0' }, 400);
  }

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
