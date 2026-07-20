import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface KaraokePayload {
  enabled: boolean;
  level: number;
  monoLevel: number;
  filterBand: number;
  filterWidth: number;
}

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

  let body: KaraokePayload;
  try {
    body = (await request.json()) as KaraokePayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, level, monoLevel, filterBand, filterWidth } = body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof level !== 'number' || level < 0 || level > 1) {
    return json({ error: 'level must be number 0.0 to 1.0' }, 400);
  }
  if (typeof monoLevel !== 'number' || monoLevel < 0 || monoLevel > 1) {
    return json({ error: 'monoLevel must be number 0.0 to 1.0' }, 400);
  }
  if (typeof filterBand !== 'number' || filterBand < 50 || filterBand > 10000) {
    return json({ error: 'filterBand must be number 50 to 10000' }, 400);
  }
  if (typeof filterWidth !== 'number' || filterWidth < 10 || filterWidth > 10000) {
    return json({ error: 'filterWidth must be number 10 to 10000' }, 400);
  }

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
