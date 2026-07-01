import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { applyNodeLinkFilter } from '../lib/applyNodeLinkFilter';
import { EQ_BAND_COLUMNS, eqBandsFromRow, eqBandValues } from '../lib/eqBands';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { db, tables } from '../shared/db';

interface EqualizerPayload {
  bands: number[]; // length 15, each 0-100
}

// Build NodeLink equalizer filter array from band values (0-100)
// Maps: 0→-0.5, 50→0.0 (neutral/flat), 100→0.5
function buildEqualizerFilter(bands: number[]) {
  return bands.map((value, index) => ({
    band: index,
    gain: (value - 50) / 100,
  }));
}

async function handleEqualizerGet(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  const row = await db
    .select(EQ_BAND_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  const bands = eqBandsFromRow(row);

  return json({ bands });
}

async function handleEqualizerPatch(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  let body: EqualizerPayload;
  try {
    body = (await request.json()) as EqualizerPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { bands } = body;

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
  await db
    .insert(tables.guildSettings)
    .values({ id: 1, ...eqBandValues(bands) })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: eqBandValues(bands),
    })
    .run();

  // Apply to live NodeLink player if connected
  await applyNodeLinkFilter({ equalizer: buildEqualizerFilter(bands) }, 'equalizer');

  return json({ bands });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handleEqualizer(ctx: RouteContext, request: Request): Promise<Response> {
  if (request.method === 'GET') return await handleEqualizerGet(ctx);
  if (request.method === 'PATCH') return await handleEqualizerPatch(ctx, request);
  return json({ error: 'Not Found' }, 404);
}
