import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface DistortionPayload {
  enabled: boolean;
  sinOffset: number;
  sinScale: number;
  cosOffset: number;
  cosScale: number;
  tanOffset: number;
  tanScale: number;
  offset: number;
  scale: number;
}

function handleDistortionGet(
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
    enabled: row?.distortionEnabled ?? false,
    sinOffset: row?.distortionSinOffset ?? 0.0,
    sinScale: row?.distortionSinScale ?? 1.0,
    cosOffset: row?.distortionCosOffset ?? 0.0,
    cosScale: row?.distortionCosScale ?? 1.0,
    tanOffset: row?.distortionTanOffset ?? 0.0,
    tanScale: row?.distortionTanScale ?? 1.0,
    offset: row?.distortionOffset ?? 0.0,
    scale: row?.distortionScale ?? 1.0,
  });
}

async function handleDistortionPatch(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  let body: DistortionPayload;
  try {
    body = (await request.json()) as DistortionPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, sinOffset, sinScale, cosOffset, cosScale, tanOffset, tanScale, offset, scale } =
    body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof sinOffset !== 'number' || sinOffset < -1 || sinOffset > 1) {
    return json({ error: 'sinOffset must be number -1.0 to 1.0' }, 400);
  }
  if (typeof sinScale !== 'number' || sinScale < 0 || sinScale > 5) {
    return json({ error: 'sinScale must be number 0.0 to 5.0' }, 400);
  }
  if (typeof cosOffset !== 'number' || cosOffset < -1 || cosOffset > 1) {
    return json({ error: 'cosOffset must be number -1.0 to 1.0' }, 400);
  }
  if (typeof cosScale !== 'number' || cosScale < 0 || cosScale > 5) {
    return json({ error: 'cosScale must be number 0.0 to 5.0' }, 400);
  }
  if (typeof tanOffset !== 'number' || tanOffset < -1 || tanOffset > 1) {
    return json({ error: 'tanOffset must be number -1.0 to 1.0' }, 400);
  }
  if (typeof tanScale !== 'number' || tanScale < 0 || tanScale > 5) {
    return json({ error: 'tanScale must be number 0.0 to 5.0' }, 400);
  }
  if (typeof offset !== 'number' || offset < -1 || offset > 1) {
    return json({ error: 'offset must be number -1.0 to 1.0' }, 400);
  }
  if (typeof scale !== 'number' || scale < 0 || scale > 5) {
    return json({ error: 'scale must be number 0.0 to 5.0' }, 400);
  }

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      distortionEnabled: enabled,
      distortionSinOffset: sinOffset,
      distortionSinScale: sinScale,
      distortionCosOffset: cosOffset,
      distortionCosScale: cosScale,
      distortionTanOffset: tanOffset,
      distortionTanScale: tanScale,
      distortionOffset: offset,
      distortionScale: scale,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        distortionEnabled: enabled,
        distortionSinOffset: sinOffset,
        distortionSinScale: sinScale,
        distortionCosOffset: cosOffset,
        distortionCosScale: cosScale,
        distortionTanOffset: tanOffset,
        distortionTanScale: tanScale,
        distortionOffset: offset,
        distortionScale: scale,
      },
    })
    .run();

  await syncAllFilters();

  return json({
    enabled,
    sinOffset,
    sinScale,
    cosOffset,
    cosScale,
    tanOffset,
    tanScale,
    offset,
    scale,
  });
}

export const handleDistortion = routeTable('/api/settings/distortion', {
  routes: [
    ['GET', '/', handleDistortionGet],
    ['PATCH', '/', handleDistortionPatch],
  ],
});
