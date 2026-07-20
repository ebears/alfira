import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface VibratoPayload {
  enabled: boolean;
  frequency: number;
  depth: number;
}

function handleVibratoGet(
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
    enabled: row?.vibratoEnabled ?? false,
    frequency: row?.vibratoFrequency ?? 2.0,
    depth: row?.vibratoDepth ?? 0.5,
  });
}

async function handleVibratoPatch(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  let body: VibratoPayload;
  try {
    body = (await request.json()) as VibratoPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, frequency, depth } = body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof frequency !== 'number' || frequency < 0.1 || frequency > 14.0) {
    return json({ error: 'frequency must be number 0.1 to 14.0' }, 400);
  }
  if (typeof depth !== 'number' || depth < 0 || depth > 1) {
    return json({ error: 'depth must be number 0.0 to 1.0' }, 400);
  }

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      vibratoEnabled: enabled,
      vibratoFrequency: frequency,
      vibratoDepth: depth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        vibratoEnabled: enabled,
        vibratoFrequency: frequency,
        vibratoDepth: depth,
      },
    })
    .run();

  await syncAllFilters();

  return json({ enabled, frequency, depth });
}

export const handleVibrato = routeTable('/api/settings/vibrato', {
  routes: [
    ['GET', '/', handleVibratoGet],
    ['PATCH', '/', handleVibratoPatch],
  ],
});
