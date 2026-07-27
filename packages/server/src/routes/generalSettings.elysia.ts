import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
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

const GeneralSettingsPatchSchema = t.Partial(
  t.Object({
    adminRoleIds: t.String({ minLength: 1 }),
    voiceIdleTimeoutMinutes: t.Integer({ minimum: 1, maximum: 120 }),
    afkNotificationChannelId: t.Nullable(t.String()),
    requestNotificationChannelId: t.Nullable(t.String()),
    notifyOnApproved: t.Boolean(),
    notifyOnDenied: t.Boolean(),
    publicUrl: t.Nullable(t.String()),
    enabledSources: t.String({ minLength: 1 }),
  })
);

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchGeneralSettings(): GeneralSettings | null {
  const row = db
    .select(SETTINGS_COLUMNS)
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();

  if (!row) {
    return null;
  }

  return attachAvailableSources(row);
}

function defaultGeneralSettings(): GeneralSettings {
  return attachAvailableSources({
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
  });
}

function upsertGeneralSettings(updates: Record<string, unknown>): void {
  db.insert(tables.guildSettings)
    .values({ id: 1, ...updates })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: updates,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const generalSettingsPlugin = new Elysia({ prefix: '/settings/general' })
  .derive(deriveAuth)
  .use(createAdminOrPermissionGuard())
  .get('/', () => {
    const settings = fetchGeneralSettings();
    return settings ?? defaultGeneralSettings();
  })
  .patch(
    '/',
    ({ body }) => {
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
        return Response.json({ error: 'No fields to update' }, { status: 400 });
      }

      upsertGeneralSettings(updates);

      // Refresh the enabled sources cache if sources were updated.
      if (body.enabledSources) {
        refreshEnabledSources(body.enabledSources.trim());
      }

      const settings = fetchGeneralSettings();
      if (!settings) {
        return Response.json({ error: 'Settings not found after update.' }, { status: 500 });
      }

      return settings;
    },
    { body: GeneralSettingsPatchSchema }
  );
