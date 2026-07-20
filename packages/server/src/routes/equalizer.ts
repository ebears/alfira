import { eq } from 'drizzle-orm';
import { type RouteContext } from '../lib/context';
import { applyNodeLinkFilter } from '../lib/applyNodeLinkFilter';
import {
  buildEqualizerFilter,
  EQ_BAND_COLUMNS,
  eqBandsFromRow,
  eqBandValues,
} from '../lib/eqBands';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { db, tables } from '../shared/db';

interface EqualizerPayload {
  bands: number[]; // length 15, each 0-100
  enabled: boolean;
}

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

  let body: EqualizerPayload;
  try {
    body = (await request.json()) as EqualizerPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { bands, enabled } = body;

  // Validate: enabled must be boolean
  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }

  // Validate: must be array of 15 integers, each 0-100
  if (!Array.isArray(bands) || bands.length !== 15) {
    return json({ error: 'bands must be array of 15 integers' }, 400);
  }
  for (let i = 0; i < 15; i++) {
    const v = bands[i];
    if (v === undefined || !Number.isInteger(v) || v < 0 || v > 100) {
      return json({ error: `band[${i}] must be integer 0-100` }, 400);
    }
  }

  // Upsert into DB
  db.insert(tables.guildSettings)
    .values({ id: 1, eqEnabled: enabled, ...eqBandValues(bands) })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { eqEnabled: enabled, ...eqBandValues(bands) },
    })
    .run();

  // Apply to live NodeLink player if connected
  await applyNodeLinkFilter({ equalizer: buildEqualizerFilter(bands) }, 'equalizer');

  return json({ bands, enabled });
}

export const handleEqualizer = routeTable('/api/settings/equalizer', {
  routes: [
    ['GET', '/', handleEqualizerGet],
    ['PATCH', '/', handleEqualizerPatch],
  ],
});
