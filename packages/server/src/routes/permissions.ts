import { eq, inArray } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { getGuildId } from '../lib/config';
import { fetchGuildRoles } from '../lib/discordRoles';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { routeTable } from '../lib/routeTable';
import { PERMISSION_CATEGORIES, PERMISSION_LABELS, type PermissionAction } from '../shared';
import { db, tables } from '../shared/db';

// ---------------------------------------------------------------------------
// GET /api/permissions
// ---------------------------------------------------------------------------
async function handleGetPermissions(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  const guildId = getGuildId();

  const allRows = db.select().from(tables.rolePermission).all();
  const settingsRow = db
    .select({ adminRoleIds: tables.guildSettings.adminRoleIds })
    .from(tables.guildSettings)
    .where(eq(tables.guildSettings.id, 1))
    .get();
  const roles = guildId ? await fetchGuildRoles(guildId) : [];

  // Filter out roles that are already super-admins (implied full access).
  const adminRoleIdSet = new Set(
    (settingsRow?.adminRoleIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
  const filteredRoles = roles.filter((r) => !adminRoleIdSet.has(r.id));

  // Build mapping: action → roleIds
  const mapping: Record<string, string[]> = {};
  for (const row of allRows) {
    if (!mapping[row.action]) mapping[row.action] = [];
    mapping[row.action].push(row.roleId);
  }

  return json({
    mapping,
    roles: filteredRoles,
    categories: PERMISSION_CATEGORIES,
    labels: PERMISSION_LABELS,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/permissions
// Body: { action: PermissionAction; roleIds: string[] }
// ---------------------------------------------------------------------------
async function handlePatchPermissions(
  ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const guards = checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  let body: { action?: unknown; roleIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (typeof body.action !== 'string') {
    return json({ error: 'action (string) is required.' }, 400);
  }

  if (!Array.isArray(body.roleIds) || body.roleIds.some((id) => typeof id !== 'string')) {
    return json({ error: 'roleIds must be an array of strings.' }, 400);
  }

  const action = body.action;
  const roleIds = body.roleIds as string[];

  // Validate the action is a known permission.
  if (!PERMISSION_LABELS[action as PermissionAction]) {
    return json({ error: `Unknown permission action: ${action}` }, 400);
  }

  // Replace the role set for this action in a transaction.
  await db.transaction(async (tx) => {
    // Delete existing entries for this action.
    await tx.delete(tables.rolePermission).where(eq(tables.rolePermission.action, action));

    // Insert new entries.
    if (roleIds.length > 0) {
      await tx.insert(tables.rolePermission).values(roleIds.map((roleId) => ({ action, roleId })));
    }
  });

  return json({ action, roleIds });
}

// ---------------------------------------------------------------------------
// GET /api/permissions/me — returns permissions for the current user
// ---------------------------------------------------------------------------
async function handleGetMyPermissions(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const user = ctx.user;
  if (!user) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  const userRoles = user.roles ?? [];
  if (userRoles.length === 0) {
    return json({ permissions: [] });
  }

  const rows = await db
    .select({ action: tables.rolePermission.action })
    .from(tables.rolePermission)
    .where(inArray(tables.rolePermission.roleId, userRoles));

  const permissions = [...new Set(rows.map((r) => r.action))];
  return json({ permissions });
}

export const handlePermissions = routeTable('/api/permissions', {
  routes: [
    ['GET', '/me', handleGetMyPermissions],
    ['GET', '/', handleGetPermissions],
    ['PATCH', '/', handlePatchPermissions],
  ],
});
