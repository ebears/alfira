import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface RotationPayload {
  enabled: boolean;
  rotationHz: number;
}

function handleRotationGet(
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
    enabled: row?.rotationEnabled ?? false,
    rotationHz: row?.rotationHz ?? 0.0,
  });
}

async function handleRotationPatch(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true, permission: 'audio.manage' });
  if (guards instanceof Response) {
    return guards;
  }

  let body: RotationPayload;
  try {
    body = (await request.json()) as RotationPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, rotationHz } = body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof rotationHz !== 'number' || rotationHz < 0 || rotationHz > 1) {
    return json({ error: 'rotationHz must be number 0.0 to 1.0' }, 400);
  }

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      rotationEnabled: enabled,
      rotationHz,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        rotationEnabled: enabled,
        rotationHz,
      },
    })
    .run();

  await syncAllFilters();

  return json({ enabled, rotationHz });
}

export const handleRotation = routeTable('/api/settings/rotation', {
  routes: [
    ['GET', '/', handleRotationGet],
    ['PATCH', '/', handleRotationPatch],
  ],
});
