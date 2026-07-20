import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface LowPassPayload {
  enabled: boolean;
  smoothing: number;
}

function handleLowPassGet(
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
    enabled: row?.lowPassEnabled ?? false,
    smoothing: row?.lowPassSmoothing ?? 20.0,
  });
}

async function handleLowPassPatch(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  let body: LowPassPayload;
  try {
    body = (await request.json()) as LowPassPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, smoothing } = body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof smoothing !== 'number' || smoothing < 0 || smoothing > 60) {
    return json({ error: 'smoothing must be number 0.0 to 60.0' }, 400);
  }

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      lowPassEnabled: enabled,
      lowPassSmoothing: smoothing,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        lowPassEnabled: enabled,
        lowPassSmoothing: smoothing,
      },
    })
    .run();

  await syncAllFilters();

  return json({ enabled, smoothing });
}

export const handleLowPass = routeTable('/api/settings/lowpass', {
  routes: [
    ['GET', '/', handleLowPassGet],
    ['PATCH', '/', handleLowPassPatch],
  ],
});
