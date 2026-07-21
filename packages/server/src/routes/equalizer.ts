import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { EQ_BAND_COLUMNS, eqBandsFromRow, eqBandValues } from '../lib/eqBands';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

const EqualizerSchema = v.object({
  bands: v.pipe(
    v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
    v.length(15)
  ),
  enabled: v.boolean(),
});

function handleEqualizerGet(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Response {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  const row = db
    .select({
      ...EQ_BAND_COLUMNS,
      eqEnabled: tables.guildSettings.eqEnabled,
    })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  const bands = eqBandsFromRow(row);
  const enabled = row?.eqEnabled ?? true;

  return json({ bands, enabled });
}

async function handleEqualizerPatch(
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

  const parsed = v.safeParse(EqualizerSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { bands, enabled } = parsed.output;

  // Upsert into DB
  db.insert(tables.guildSettings)
    .values({ id: 1, eqEnabled: enabled, ...eqBandValues(bands) })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { eqEnabled: enabled, ...eqBandValues(bands) },
    })
    .run();

  // Apply all enabled filters to live NodeLink player
  await syncAllFilters();

  return json({ bands, enabled });
}

export const handleEqualizer = routeTable('/api/settings/equalizer', {
  routes: [
    ['GET', '/', handleEqualizerGet],
    ['PATCH', '/', handleEqualizerPatch],
  ],
});
