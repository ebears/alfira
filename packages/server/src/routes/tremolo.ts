import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface TremoloPayload {
  enabled: boolean;
  frequency: number;
  depth: number;
}

function handleTremoloGet(
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
    enabled: row?.tremoloEnabled ?? false,
    frequency: row?.tremoloFrequency ?? 2.0,
    depth: row?.tremoloDepth ?? 0.5,
  });
}

async function handleTremoloPatch(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  let body: TremoloPayload;
  try {
    body = (await request.json()) as TremoloPayload;
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
      tremoloEnabled: enabled,
      tremoloFrequency: frequency,
      tremoloDepth: depth,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        tremoloEnabled: enabled,
        tremoloFrequency: frequency,
        tremoloDepth: depth,
      },
    })
    .run();

  await syncAllFilters();

  return json({ enabled, frequency, depth });
}

export const handleTremolo = routeTable('/api/settings/tremolo', {
  routes: [
    ['GET', '/', handleTremoloGet],
    ['PATCH', '/', handleTremoloPatch],
  ],
});
