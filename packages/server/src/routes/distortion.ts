import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
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
    enabled: row?.distortionEnabled ?? DEFAULT_DISTORTION.enabled,
    sinOffset: row?.distortionSinOffset ?? DEFAULT_DISTORTION.sinOffset,
    sinScale: row?.distortionSinScale ?? DEFAULT_DISTORTION.sinScale,
    cosOffset: row?.distortionCosOffset ?? DEFAULT_DISTORTION.cosOffset,
    cosScale: row?.distortionCosScale ?? DEFAULT_DISTORTION.cosScale,
    tanOffset: row?.distortionTanOffset ?? DEFAULT_DISTORTION.tanOffset,
    tanScale: row?.distortionTanScale ?? DEFAULT_DISTORTION.tanScale,
    offset: row?.distortionOffset ?? DEFAULT_DISTORTION.offset,
    scale: row?.distortionScale ?? DEFAULT_DISTORTION.scale,
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
