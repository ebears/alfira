import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

const LowPassSchema = v.object({
  enabled: v.boolean(),
  smoothing: v.pipe(v.number(), v.minValue(0), v.maxValue(60)),
});

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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = v.safeParse(LowPassSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, smoothing } = parsed.output;

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
