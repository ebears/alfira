import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import type { GeneralSettings } from '../shared';
import { db, tables } from '../shared/db';

const SETTINGS_COLUMNS = {
  guildId: tables.guildSettings.guildId,
  setupCompleted: tables.guildSettings.setupCompleted,
  adminRoleIds: tables.guildSettings.adminRoleIds,
  voiceIdleTimeoutMinutes: tables.guildSettings.voiceIdleTimeoutMinutes,
  notificationChannelId: tables.guildSettings.notificationChannelId,
  publicUrl: tables.guildSettings.publicUrl,
};

// ---------------------------------------------------------------------------
// GET /api/settings/general
// ---------------------------------------------------------------------------
async function handleGetGeneral(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  const row = await db
    .select(SETTINGS_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  if (!row) {
    return json({
      guildId: null,
      setupCompleted: false,
      adminRoleIds: '',
      voiceIdleTimeoutMinutes: 5,
      notificationChannelId: null,
      publicUrl: null,
    });
  }

  return json(row as GeneralSettings);
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/general
// ---------------------------------------------------------------------------
interface GeneralSettingsPatch {
  adminRoleIds?: string;
  voiceIdleTimeoutMinutes?: number;
  notificationChannelId?: string | null;
  publicUrl?: string | null;
}

async function handlePatchGeneral(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  let body: GeneralSettingsPatch;
  try {
    body = (await request.json()) as GeneralSettingsPatch;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const updates: Record<string, unknown> = {};

  if (body.adminRoleIds !== undefined) {
    if (typeof body.adminRoleIds !== 'string') {
      return json({ error: 'adminRoleIds must be a string' }, 400);
    }
    updates.adminRoleIds = body.adminRoleIds;
  }

  if (body.voiceIdleTimeoutMinutes !== undefined) {
    const v = body.voiceIdleTimeoutMinutes;
    if (!Number.isInteger(v) || v < 1 || v > 120) {
      return json({ error: 'voiceIdleTimeoutMinutes must be an integer between 1 and 120' }, 400);
    }
    updates.voiceIdleTimeoutMinutes = v;
  }

  if (body.notificationChannelId !== undefined) {
    if (body.notificationChannelId !== null && typeof body.notificationChannelId !== 'string') {
      return json({ error: 'notificationChannelId must be a string or null' }, 400);
    }
    updates.notificationChannelId = body.notificationChannelId;
  }

  if (body.publicUrl !== undefined) {
    if (body.publicUrl !== null && typeof body.publicUrl !== 'string') {
      return json({ error: 'publicUrl must be a string or null' }, 400);
    }
    updates.publicUrl = body.publicUrl;
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  await db
    .insert(tables.guildSettings)
    .values({ id: 1, ...updates })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: updates,
    })
    .run();

  // Return the full updated row.
  const row = await db
    .select(SETTINGS_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  return json(row as GeneralSettings);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export async function handleGeneralSettings(
  ctx: RouteContext,
  request: Request
): Promise<Response> {
  if (request.method === 'GET') return await handleGetGeneral(ctx);
  if (request.method === 'PATCH') return await handlePatchGeneral(ctx, request);
  return json({ error: 'Not Found' }, 404);
}
