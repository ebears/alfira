import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_TREMOLO } from '../shared/filterDefaults';

const TremoloSchema = v.object({
  enabled: v.boolean(),
  frequency: v.pipe(v.number(), v.minValue(0.1), v.maxValue(14)),
  depth: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

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
    enabled: row?.tremoloEnabled ?? DEFAULT_TREMOLO.enabled,
    frequency: row?.tremoloFrequency ?? DEFAULT_TREMOLO.frequency,
    depth: row?.tremoloDepth ?? DEFAULT_TREMOLO.depth,
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = v.safeParse(TremoloSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, frequency, depth } = parsed.output;

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
