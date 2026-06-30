import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
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
    .select({
      eqBand0: tables.guildSettings.eqBand0,
      eqBand1: tables.guildSettings.eqBand1,
      eqBand2: tables.guildSettings.eqBand2,
      eqBand3: tables.guildSettings.eqBand3,
      eqBand4: tables.guildSettings.eqBand4,
      eqBand5: tables.guildSettings.eqBand5,
      eqBand6: tables.guildSettings.eqBand6,
      eqBand7: tables.guildSettings.eqBand7,
      eqBand8: tables.guildSettings.eqBand8,
      eqBand9: tables.guildSettings.eqBand9,
      eqBand10: tables.guildSettings.eqBand10,
      eqBand11: tables.guildSettings.eqBand11,
      eqBand12: tables.guildSettings.eqBand12,
      eqBand13: tables.guildSettings.eqBand13,
      eqBand14: tables.guildSettings.eqBand14,
    })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  const bands = row
    ? [
        row.eqBand0,
        row.eqBand1,
        row.eqBand2,
        row.eqBand3,
        row.eqBand4,
        row.eqBand5,
        row.eqBand6,
        row.eqBand7,
        row.eqBand8,
        row.eqBand9,
        row.eqBand10,
        row.eqBand11,
        row.eqBand12,
        row.eqBand13,
        row.eqBand14,
      ]
    : Array(15).fill(50);

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
    .values({
      id: 1,
      eqBand0: bands[0],
      eqBand1: bands[1],
      eqBand2: bands[2],
      eqBand3: bands[3],
      eqBand4: bands[4],
      eqBand5: bands[5],
      eqBand6: bands[6],
      eqBand7: bands[7],
      eqBand8: bands[8],
      eqBand9: bands[9],
      eqBand10: bands[10],
      eqBand11: bands[11],
      eqBand12: bands[12],
      eqBand13: bands[13],
      eqBand14: bands[14],
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        eqBand0: bands[0],
        eqBand1: bands[1],
        eqBand2: bands[2],
        eqBand3: bands[3],
        eqBand4: bands[4],
        eqBand5: bands[5],
        eqBand6: bands[6],
        eqBand7: bands[7],
        eqBand8: bands[8],
        eqBand9: bands[9],
        eqBand10: bands[10],
        eqBand11: bands[11],
        eqBand12: bands[12],
        eqBand13: bands[13],
        eqBand14: bands[14],
      },
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
