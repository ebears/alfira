import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_CHANNEL_MIX } from '../shared/filterDefaults';

const ChannelMixSchema = v.object({
  enabled: v.boolean(),
  leftToLeft: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  leftToRight: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  rightToLeft: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  rightToRight: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

function handleChannelMixGet(
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
    enabled: row?.channelMixEnabled ?? DEFAULT_CHANNEL_MIX.enabled,
    leftToLeft: row?.channelMixLeftToLeft ?? DEFAULT_CHANNEL_MIX.leftToLeft,
    leftToRight: row?.channelMixLeftToRight ?? DEFAULT_CHANNEL_MIX.leftToRight,
    rightToLeft: row?.channelMixRightToLeft ?? DEFAULT_CHANNEL_MIX.rightToLeft,
    rightToRight: row?.channelMixRightToRight ?? DEFAULT_CHANNEL_MIX.rightToRight,
  });
}

async function handleChannelMixPatch(
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

  const parsed = v.safeParse(ChannelMixSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const { enabled, leftToLeft, leftToRight, rightToLeft, rightToRight } = parsed.output;

  db.insert(tables.guildSettings)
    .values({
      id: 1,
      channelMixEnabled: enabled,
      channelMixLeftToLeft: leftToLeft,
      channelMixLeftToRight: leftToRight,
      channelMixRightToLeft: rightToLeft,
      channelMixRightToRight: rightToRight,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        channelMixEnabled: enabled,
        channelMixLeftToLeft: leftToLeft,
        channelMixLeftToRight: leftToRight,
        channelMixRightToLeft: rightToLeft,
        channelMixRightToRight: rightToRight,
      },
    })
    .run();

  await syncAllFilters();

  return json({ enabled, leftToLeft, leftToRight, rightToLeft, rightToRight });
}

export const handleChannelMix = routeTable('/api/settings/channelmix', {
  routes: [
    ['GET', '/', handleChannelMixGet],
    ['PATCH', '/', handleChannelMixPatch],
  ],
});
