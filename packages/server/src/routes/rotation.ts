import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

const RotationSchema = v.object({
  enabled: v.boolean(),
  rotationHz: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = v.safeParse(RotationSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, rotationHz } = parsed.output;

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
