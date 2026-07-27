import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission, type AuthContext } from '../lib/elysia-guards';
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

type ChannelMixSettings = v.InferOutput<typeof ChannelMixSchema>;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchChannelMixSettings(): ChannelMixSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.channelMixEnabled ?? DEFAULT_CHANNEL_MIX.enabled,
    leftToLeft: row?.channelMixLeftToLeft ?? DEFAULT_CHANNEL_MIX.leftToLeft,
    leftToRight: row?.channelMixLeftToRight ?? DEFAULT_CHANNEL_MIX.leftToRight,
    rightToLeft: row?.channelMixRightToLeft ?? DEFAULT_CHANNEL_MIX.rightToLeft,
    rightToRight: row?.channelMixRightToRight ?? DEFAULT_CHANNEL_MIX.rightToRight,
  };
}

function upsertChannelMixSettings(data: ChannelMixSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      channelMixEnabled: data.enabled,
      channelMixLeftToLeft: data.leftToLeft,
      channelMixLeftToRight: data.leftToRight,
      channelMixRightToLeft: data.rightToLeft,
      channelMixRightToRight: data.rightToRight,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        channelMixEnabled: data.enabled,
        channelMixLeftToLeft: data.leftToLeft,
        channelMixLeftToRight: data.leftToRight,
        channelMixRightToLeft: data.rightToLeft,
        channelMixRightToRight: data.rightToRight,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

export const channelMixPlugin = new Elysia({ prefix: '/settings/channelmix' })
  .get('/', ((ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
    if (guardErr) {
      return guardErr;
    }
    return json(fetchChannelMixSettings());
  }) as never)
  .patch(
    '/',
    (async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
      if (guardErr) {
        return guardErr;
      }

      const body = ctx.body as ChannelMixSettings;
      upsertChannelMixSettings(body);
      await syncAllFilters();

      return json(body);
    }) as never,
    { body: ChannelMixSchema }
  );
