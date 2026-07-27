import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { requireAdminOrPermission } from '../lib/elysia-guards';
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
// Handlers
// ---------------------------------------------------------------------------

function handleGet(ctx: Record<string, unknown>): Response {
  const guardErr = requireAdminOrPermission({
    user: ctx.user as never,
    isAdmin: ctx.isAdmin as boolean,
  });
  if (guardErr) {
    return guardErr;
  }

  const settings = fetchGeneralSettings();
  return json(settings ?? defaultGeneralSettings());
}

function handlePatch(ctx: Record<string, unknown>): Response {
  const guardErr = requireAdminOrPermission({
    user: ctx.user as never,
    isAdmin: ctx.isAdmin as boolean,
  });
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as v.InferOutput<typeof GeneralSettingsPatchSchema>;

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

  upsertGeneralSettings(updates);

  // Refresh the enabled sources cache if sources were updated.
  if (body.enabledSources) {
    refreshEnabledSources(body.enabledSources.trim());
  }

  const settings = fetchGeneralSettings();
  if (!settings) {
    return json({ error: 'Settings not found after update.' }, 500);
  }

  return json(settings);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function generalSettingsPlugin(app: Elysia): Elysia {
  return app
    .get('/settings/general', handleGet as never)
    .patch('/settings/general', handlePatch as never, {
      body: GeneralSettingsPatchSchema,
    }) as unknown as Elysia;
}
