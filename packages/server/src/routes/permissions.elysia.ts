import { eq, inArray } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { elysiaJson as json } from '../lib/apiResponse';
import { getGuildId } from '../lib/config';
import { fetchGuildRoles } from '../lib/discordRoles';
import { requireAdmin, requireAuth } from '../lib/elysia-guards';
import { PERMISSION_CATEGORIES, PERMISSION_LABELS, type PermissionAction } from '../shared';
import { db, tables } from '../shared/db';

const PermissionsPatchSchema = v.object({
  action: v.string(),
  roleIds: v.array(v.string()),
});

function isPermissionAction(value: string): value is PermissionAction {
  return value in PERMISSION_LABELS;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchAllRolePermissions() {
  return db.select().from(tables.rolePermission).all();
}

function fetchAdminRoleIds(): string {
  const row = db
    .select({ adminRoleIds: tables.guildSettings.adminRoleIds })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();
  return row?.adminRoleIds ?? '';
}

function replacePermissionRoles(action: string, roleIds: string[], tx = db): void {
  tx.delete(tables.rolePermission).where(eq(tables.rolePermission.action, action)).run();
  if (roleIds.length > 0) {
    const rows = roleIds.map((roleId) => ({ action, roleId }));
    tx.insert(tables.rolePermission).values(rows).run();
  }
}

function fetchUserPermissions(userRoles: string[]): string[] {
  if (userRoles.length === 0) {
    return [];
  }
  const rows = db
    .select({ action: tables.rolePermission.action })
    .from(tables.rolePermission)
    .where(inArray(tables.rolePermission.roleId, userRoles))
    .all();
  return [...new Set(rows.map((r) => r.action))];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleGetPermissions(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdmin({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (guardErr) {
    return guardErr;
  }

  const guildId = getGuildId();
  const allRows = fetchAllRolePermissions();
  const adminRoleIds = fetchAdminRoleIds();
  const roles = guildId ? await fetchGuildRoles(guildId) : [];

  // Filter out roles that are already super-admins (implied full access).
  const adminRoleIdSet = new Set(
    adminRoleIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
  const filteredRoles = roles.filter((r) => !adminRoleIdSet.has(r.id));

  // Build mapping: action → roleIds
  const mapping: Record<string, string[]> = {};
  for (const row of allRows) {
    (mapping[row.action] ??= []).push(row.roleId);
  }

  return json({
    mapping,
    roles: filteredRoles,
    categories: PERMISSION_CATEGORIES,
    labels: PERMISSION_LABELS,
  });
}

function handlePatchPermissions(ctx: Record<string, unknown>): Response {
  const guardErr = requireAdmin({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (guardErr) {
    return guardErr;
  }

  const { action, roleIds } = ctx.body as v.InferOutput<typeof PermissionsPatchSchema>;

  if (!isPermissionAction(action)) {
    return json({ error: `Unknown permission action: ${action}` }, 400);
  }

  replacePermissionRoles(action, roleIds);

  return json({ action, roleIds });
}

function handleGetMyPermissions(ctx: Record<string, unknown>): Response {
  const authErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });
  if (authErr) {
    return authErr;
  }

  const userRoles = (ctx.user as { roles?: string[] } | null)?.roles ?? [];
  const permissions = fetchUserPermissions(userRoles);
  return json({ permissions });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function permissionsPlugin(app: Elysia): Elysia {
  return app
    .get('/permissions/me', handleGetMyPermissions as never)
    .get('/permissions', handleGetPermissions as never)
    .patch('/permissions', handlePatchPermissions as never, {
      body: PermissionsPatchSchema,
    }) as unknown as Elysia;
}
