import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

const CompressorSchema = v.object({
  enabled: v.boolean(),
  threshold: v.pipe(v.number(), v.integer(), v.minValue(-60), v.maxValue(0)),
  ratio: v.pipe(v.number(), v.minValue(1), v.maxValue(20)),
  attack: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  release: v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(1000)),
  gain: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(24)),
});

function handleCompressorGet(
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
    enabled: row?.compressorEnabled ?? false,
    threshold: row?.compressorThreshold ?? -6,
    ratio: row?.compressorRatio ?? 4.0,
    attack: row?.compressorAttack ?? 5,
    release: row?.compressorRelease ?? 50,
    gain: row?.compressorGain ?? 3,
  });
}

async function handleCompressorPatch(
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

  const parsed = v.safeParse(CompressorSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, threshold, ratio, attack, release, gain } = parsed.output;

  // Upsert into DB
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      compressorEnabled: enabled,
      compressorThreshold: threshold,
      compressorRatio: ratio,
      compressorAttack: attack,
      compressorRelease: release,
      compressorGain: gain,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        compressorEnabled: enabled,
        compressorThreshold: threshold,
        compressorRatio: ratio,
        compressorAttack: attack,
        compressorRelease: release,
        compressorGain: gain,
      },
    })
    .run();

  // Apply all enabled filters to live NodeLink player
  await syncAllFilters();

  return json({ enabled, threshold, ratio, attack, release, gain });
}

export const handleCompressor = routeTable('/api/settings/compressor', {
  routes: [
    ['GET', '/', handleCompressorGet],
    ['PATCH', '/', handleCompressorPatch],
  ],
});
