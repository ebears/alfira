import { eq } from 'drizzle-orm';
import * as v from 'valibot';

import { type RouteContext } from '../lib/context';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { type GeneralSettings } from '../shared';
import { db, tables } from '../shared/db';
import { refreshEnabledSources, SOURCE_DEFINITIONS } from '../startDiscord';

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
function handleGetGeneral(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Response {
  const guards = checkGuards(ctx, { admin: true });
  if (guards instanceof Response) {
    return guards;
  }

  const row = db
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

  return json(attachAvailableSources(row));
}

const GeneralSettingsPatchSchema = v.partial(
  v.object({
    adminRoleIds: v.pipe(v.string(), v.minLength(1)),
    voiceIdleTimeoutMinutes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
    afkNotificationChannelId: v.nullable(v.string()),
    requestNotificationChannelId: v.nullable(v.string()),
    notifyOnApproved: v.boolean(),
    notifyOnDenied: v.boolean(),
    publicUrl: v.nullable(v.string()),
    enabledSources: v.pipe(v.string(), v.minLength(1)),
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/settings/general
// ---------------------------------------------------------------------------
async function handlePatchGeneral(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true });
  if (guards instanceof Response) {
    return guards;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = v.safeParse(GeneralSettingsPatchSchema, raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body.', details: v.flatten(parsed.issues) }, 400);
  }

  const body = parsed.output;

  const updates: Record<string, unknown> = {};

  if (body.adminRoleIds !== undefined) {
    updates.adminRoleIds = body.adminRoleIds;
  }

  if (body.voiceIdleTimeoutMinutes !== undefined) {
    updates.voiceIdleTimeoutMinutes = body.voiceIdleTimeoutMinutes;
  }

  if (body.afkNotificationChannelId !== undefined) {
    updates.afkNotificationChannelId = body.afkNotificationChannelId;
  }

  if (body.requestNotificationChannelId !== undefined) {
    updates.requestNotificationChannelId = body.requestNotificationChannelId;
  }

  if (body.notifyOnApproved !== undefined) {
    updates.notifyOnApproved = body.notifyOnApproved;
  }

  if (body.notifyOnDenied !== undefined) {
    updates.notifyOnDenied = body.notifyOnDenied;
  }

  if (body.publicUrl !== undefined) {
    updates.publicUrl = body.publicUrl;
  }

  if (body.enabledSources !== undefined) {
    updates.enabledSources = body.enabledSources.trim();
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  db.insert(tables.guildSettings)
    .values({ id: 1, ...updates })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: updates,
    })
    .run();

  // Refresh the enabled sources cache if sources were updated.
  if (body.enabledSources) {
    refreshEnabledSources(body.enabledSources.trim());
  }

  // Return the full updated row.
  const row = db
    .select(SETTINGS_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  if (!row) {
    return json({ error: 'Settings not found after update.' }, 500);
  }

  return json(attachAvailableSources(row));
}

export const handleGeneralSettings = routeTable('/api/settings/general', {
  routes: [
    ['GET', '/', handleGetGeneral],
    ['PATCH', '/', handlePatchGeneral],
  ],
});
