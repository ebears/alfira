import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission } from '../lib/elysia-guards';
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
// Handlers
// ---------------------------------------------------------------------------

function handleGet(ctx: Record<string, unknown>): Response {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  return json(fetchChannelMixSettings());
}

async function handlePatch(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as ChannelMixSettings;
  upsertChannelMixSettings(body);
  await syncAllFilters();

  return json(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function channelMixPlugin(app: Elysia): Elysia {
  return app
    .get('/settings/channelmix', handleGet as never)
    .patch('/settings/channelmix', handlePatch as never, {
      body: ChannelMixSchema,
    }) as unknown as Elysia;
}
