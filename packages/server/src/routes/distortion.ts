import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

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
    sinOffset: row?.distortionSinOffset ?? 0,
    sinScale: row?.distortionSinScale ?? 1,
    cosOffset: row?.distortionCosOffset ?? 0,
    cosScale: row?.distortionCosScale ?? 1,
    tanOffset: row?.distortionTanOffset ?? 0,
    tanScale: row?.distortionTanScale ?? 1,
    offset: row?.distortionOffset ?? 0,
    scale: row?.distortionScale ?? 1,
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = v.safeParse(DistortionSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, sinOffset, sinScale, cosOffset, cosScale, tanOffset, tanScale, offset, scale } =
    parsed.output;

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
