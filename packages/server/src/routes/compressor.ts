import type { RouteContext } from '../index';
import { applyNodeLinkFilter, buildCompressorFilter } from '../lib/applyNodeLinkFilter';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { db, tables } from '../shared/db';

interface CompressorPayload {
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

async function handleCompressorRequest(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) return guards;

  let body: CompressorPayload;
  try {
    body = (await request.json()) as CompressorPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, threshold, ratio, attack, release, gain } = body;

  // Validate ranges
  if (typeof enabled !== 'boolean') return json({ error: 'enabled must be boolean' }, 400);
  if (!Number.isInteger(threshold) || threshold < -60 || threshold > 0)
    return json({ error: 'threshold must be integer -60 to 0' }, 400);
  if (typeof ratio !== 'number' || ratio < 1 || ratio > 20)
    return json({ error: 'ratio must be number 1 to 20' }, 400);
  if (!Number.isInteger(attack) || attack < 0 || attack > 100)
    return json({ error: 'attack must be integer 0 to 100' }, 400);
  if (!Number.isInteger(release) || release < 10 || release > 1000)
    return json({ error: 'release must be integer 10 to 1000' }, 400);
  if (!Number.isInteger(gain) || gain < 0 || gain > 24)
    return json({ error: 'gain must be integer 0 to 24' }, 400);

  // Upsert into DB
  await db
    .insert(tables.guildSettings)
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

  // Apply to live NodeLink player if connected
  await applyNodeLinkFilter(enabled ? buildCompressorFilter(body) : {}, 'compressor');

  return json({ enabled, threshold, ratio, attack, release, gain });
}

export const handleCompressor = routeTable('/api/settings/compressor', {
  routes: [
    ['GET', '/', handleCompressorRequest],
    ['PATCH', '/', handleCompressorRequest],
  ],
});
