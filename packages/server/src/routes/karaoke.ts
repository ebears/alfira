import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

const KaraokeSchema = v.object({
  enabled: v.boolean(),
  level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  monoLevel: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  filterBand: v.pipe(v.number(), v.minValue(50), v.maxValue(10000)),
  filterWidth: v.pipe(v.number(), v.minValue(10), v.maxValue(10000)),
});

function handleKaraokeGet(
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
    enabled: row?.karaokeEnabled ?? false,
    level: row?.karaokeLevel ?? 1.0,
    monoLevel: row?.karaokeMonoLevel ?? 1.0,
    filterBand: row?.karaokeFilterBand ?? 220.0,
    filterWidth: row?.karaokeFilterWidth ?? 100.0,
  });
}

async function handleKaraokePatch(
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

  const parsed = v.safeParse(KaraokeSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, level, monoLevel, filterBand, filterWidth } = parsed.output;

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      karaokeEnabled: enabled,
      karaokeLevel: level,
      karaokeMonoLevel: monoLevel,
      karaokeFilterBand: filterBand,
      karaokeFilterWidth: filterWidth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        karaokeEnabled: enabled,
        karaokeLevel: level,
        karaokeMonoLevel: monoLevel,
        karaokeFilterBand: filterBand,
        karaokeFilterWidth: filterWidth,
      },
    })
    .run();

  await syncAllFilters();

  return json({ enabled, level, monoLevel, filterBand, filterWidth });
}

export const handleKaraoke = routeTable('/api/settings/karaoke', {
  routes: [
    ['GET', '/', handleKaraokeGet],
    ['PATCH', '/', handleKaraokePatch],
  ],
});
