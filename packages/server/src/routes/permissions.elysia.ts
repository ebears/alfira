import { eq, inArray } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { getGuildId } from '../lib/config';
import { fetchGuildRoles } from '../lib/discordRoles';
import { adminGuard, authGuard } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { MyPermissionsResponse } from '../lib/responseSchemas';
import { PERMISSION_CATEGORIES, PERMISSION_LABELS, type PermissionAction } from '../shared';
import { db, tables } from '../shared/db';

const PermissionsPatchSchema = t.Object({
  action: t.String(),
  roleIds: t.Array(t.String()),
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
// Plugin
// ---------------------------------------------------------------------------

export const permissionsPlugin = new Elysia({ prefix: '/permissions', name: 'permissions' })
  .derive(deriveAuth)

  .use(authGuard)
  .get(
    '/me',
    ({ user }) => {
      const userRoles = (user as { roles?: string[] } | null)?.roles ?? [];
      const permissions = fetchUserPermissions(userRoles);
      return { permissions };
    },
    { response: { 200: MyPermissionsResponse } }
  )
  .use(adminGuard)
  .get('/', async () => {
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

    return {
      mapping,
      roles: filteredRoles,
      categories: PERMISSION_CATEGORIES,
      labels: PERMISSION_LABELS,
    };
  })
  .patch(
    '/',
    ({ body }) => {
      const { action, roleIds } = body;

      if (!isPermissionAction(action)) {
        throw new ApiError(400, `Unknown permission action: ${action}`);
      }

      replacePermissionRoles(action, roleIds);

      return { action, roleIds };
    },
    {
      body: PermissionsPatchSchema,
      response: { 200: t.Object({ action: t.String(), roleIds: t.Array(t.String()) }) },
    }
  );
