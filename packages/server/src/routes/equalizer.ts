import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { EQ_BAND_COLUMNS, eqBandsFromRow, eqBandValues } from '../lib/eqBands';
import { requireAdmin } from '../lib/guards';
import { json } from '../lib/json';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import { getHoshimi } from '../startDiscord';

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

export async function handleEqualizerGet(ctx: RouteContext): Promise<Response> {
  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

  const row = await db
    .select(EQ_BAND_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  const bands = eqBandsFromRow(row);

  return json({ bands });
}

export async function handleEqualizerPatch(ctx: RouteContext, request: Request): Promise<Response> {
  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

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
  const guildId = process.env.GUILD_ID ?? '';
  if (!guildId) {
    logger.warn('GUILD_ID not set, skipping NodeLink equalizer filter update');
  } else {
    const hoshimi = getHoshimi();
    if (hoshimi) {
      const player = hoshimi.players.get(guildId);
      if (player?.connected) {
        try {
          await player.node.rest.updatePlayer({
            guildId,
            playerOptions: { filters: { equalizer: buildEqualizerFilter(bands) } },
          });
        } catch (err) {
          logger.error({ err }, 'Failed to update NodeLink equalizer filter');
        }
      }
    }
  }

  return json({ bands });
}
