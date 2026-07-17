import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import type { GeneralSettings } from '../shared';
import { db, tables } from '../shared/db';
import { SOURCE_DEFINITIONS } from '../startDiscord';

const AVAILABLE_SOURCES = Object.entries(SOURCE_DEFINITIONS).map(([key, def]) => ({
  key,
  displayName: def.displayName,
  requiresCredentials: def.requiresCredentials ?? false,
  helpText: def.helpText ?? null,
}));

function attachAvailableSources(row: Omit<GeneralSettings, 'availableSources'>): GeneralSettings {
  return { ...row, availableSources: AVAILABLE_SOURCES };
}

const SETTINGS_COLUMNS = {
  guildId: tables.guildSettings.guildId,
  setupCompleted: tables.guildSettings.setupCompleted,
  adminRoleIds: tables.guildSettings.adminRoleIds,
  voiceIdleTimeoutMinutes: tables.guildSettings.voiceIdleTimeoutMinutes,
  afkNotificationChannelId: tables.guildSettings.afkNotificationChannelId,
  requestNotificationChannelId: tables.guildSettings.requestNotificationChannelId,
  notifyOnApproved: tables.guildSettings.notifyOnApproved,
  notifyOnDenied: tables.guildSettings.notifyOnDenied,
  publicUrl: tables.guildSettings.publicUrl,
  enabledSources: tables.guildSettings.enabledSources,
};

// ---------------------------------------------------------------------------
// GET /api/settings/general
// ---------------------------------------------------------------------------
async function handleGetGeneral(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  const row = await db
    .select(SETTINGS_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  if (!row) {
    return json(
      attachAvailableSources({
        guildId: null,
        setupCompleted: false,
        adminRoleIds: '',
        voiceIdleTimeoutMinutes: 5,
        afkNotificationChannelId: null,
        requestNotificationChannelId: null,
        notifyOnApproved: true,
        notifyOnDenied: true,
        publicUrl: null,
        enabledSources: 'youtube,soundcloud',
      })
    );
  }

  return json(attachAvailableSources(row as Omit<GeneralSettings, 'availableSources'>));
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/general
// ---------------------------------------------------------------------------
interface GeneralSettingsPatch {
  adminRoleIds?: string;
  voiceIdleTimeoutMinutes?: number;
  afkNotificationChannelId?: string | null;
  requestNotificationChannelId?: string | null;
  notifyOnApproved?: boolean;
  notifyOnDenied?: boolean;
  publicUrl?: string | null;
  enabledSources?: string;
}

async function handlePatchGeneral(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
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
    if (body.adminRoleIds.trim().length === 0) {
      return json({ error: 'adminRoleIds must not be empty' }, 400);
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

  if (body.afkNotificationChannelId !== undefined) {
    if (
      body.afkNotificationChannelId !== null &&
      typeof body.afkNotificationChannelId !== 'string'
    ) {
      return json({ error: 'afkNotificationChannelId must be a string or null' }, 400);
    }
    updates.afkNotificationChannelId = body.afkNotificationChannelId;
  }

  if (body.requestNotificationChannelId !== undefined) {
    if (
      body.requestNotificationChannelId !== null &&
      typeof body.requestNotificationChannelId !== 'string'
    ) {
      return json({ error: 'requestNotificationChannelId must be a string or null' }, 400);
    }
    updates.requestNotificationChannelId = body.requestNotificationChannelId;
  }

  if (body.notifyOnApproved !== undefined) {
    if (typeof body.notifyOnApproved !== 'boolean') {
      return json({ error: 'notifyOnApproved must be a boolean' }, 400);
    }
    updates.notifyOnApproved = body.notifyOnApproved;
  }

  if (body.notifyOnDenied !== undefined) {
    if (typeof body.notifyOnDenied !== 'boolean') {
      return json({ error: 'notifyOnDenied must be a boolean' }, 400);
    }
    updates.notifyOnDenied = body.notifyOnDenied;
  }

  if (body.publicUrl !== undefined) {
    if (body.publicUrl !== null && typeof body.publicUrl !== 'string') {
      return json({ error: 'publicUrl must be a string or null' }, 400);
    }
    updates.publicUrl = body.publicUrl;
  }

  if (body.enabledSources !== undefined) {
    if (typeof body.enabledSources !== 'string' || body.enabledSources.trim().length === 0) {
      return json({ error: 'enabledSources must be a non-empty comma-separated string' }, 400);
    }
    updates.enabledSources = body.enabledSources.trim();
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

  // Refresh the enabled sources cache if sources were updated.
  if (updates.enabledSources) {
    const { refreshEnabledSources } = await import('../startDiscord');
    refreshEnabledSources(updates.enabledSources as string);
  }

  // Return the full updated row.
  const row = await db
    .select(SETTINGS_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  return json(attachAvailableSources(row as Omit<GeneralSettings, 'availableSources'>));
}

export const handleGeneralSettings = routeTable('/api/settings/general', {
  routes: [
    ['GET', '/', handleGetGeneral],
    ['PATCH', '/', handlePatchGeneral],
  ],
});
