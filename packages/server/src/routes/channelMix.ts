import { eq } from 'drizzle-orm';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';

interface ChannelMixPayload {
  enabled: boolean;
  leftToLeft: number;
  leftToRight: number;
  rightToLeft: number;
  rightToRight: number;
}

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
    enabled: row?.channelMixEnabled ?? false,
    leftToLeft: row?.channelMixLeftToLeft ?? 1.0,
    leftToRight: row?.channelMixLeftToRight ?? 0.0,
    rightToLeft: row?.channelMixRightToLeft ?? 0.0,
    rightToRight: row?.channelMixRightToRight ?? 1.0,
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

  let body: ChannelMixPayload;
  try {
    body = (await request.json()) as ChannelMixPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { enabled, leftToLeft, leftToRight, rightToLeft, rightToRight } = body;

  if (typeof enabled !== 'boolean') {
    return json({ error: 'enabled must be boolean' }, 400);
  }
  if (typeof leftToLeft !== 'number' || leftToLeft < 0 || leftToLeft > 1) {
    return json({ error: 'leftToLeft must be number 0.0 to 1.0' }, 400);
  }
  if (typeof leftToRight !== 'number' || leftToRight < 0 || leftToRight > 1) {
    return json({ error: 'leftToRight must be number 0.0 to 1.0' }, 400);
  }
  if (typeof rightToLeft !== 'number' || rightToLeft < 0 || rightToLeft > 1) {
    return json({ error: 'rightToLeft must be number 0.0 to 1.0' }, 400);
  }
  if (typeof rightToRight !== 'number' || rightToRight < 0 || rightToRight > 1) {
    return json({ error: 'rightToRight must be number 0.0 to 1.0' }, 400);
  }

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
