import { eq } from 'drizzle-orm';
import type { RouteContext } from '../index';
import { getGuildId } from '../lib/config';
import { json } from '../lib/json';
import { checkGuards } from '../lib/routeGuards';
import { PERMISSION_CATEGORIES, PERMISSION_LABELS, type PermissionAction } from '../shared';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import type { SetupRole } from '../shared/types';

const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders(): Record<string, string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');
  return { Authorization: `Bot ${token}` };
}

async function fetchGuildRoles(): Promise<SetupRole[]> {
  const guildId = getGuildId();
  if (!guildId) return [];

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: botHeaders(),
    });

    if (!res.ok) {
      logger.error({ guildId, status: res.status }, 'Failed to fetch guild roles for permissions');
      return [];
    }

    const roles = (await res.json()) as Array<{
      id: string;
      name: string;
      color: number;
      managed: boolean;
    }>;

    return roles
      .filter((r) => r.id !== guildId && !r.managed)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
      }));
  } catch (err) {
    logger.error({ err }, 'Error fetching guild roles for permissions');
    return [];
  }
}

// ---------------------------------------------------------------------------
// GET /api/permissions
// ---------------------------------------------------------------------------
async function handleGetPermissions(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
  if (guards instanceof Response) return guards;

  const [allRows, roles, settingsRow] = await Promise.all([
    db.select().from(tables.rolePermission),
    fetchGuildRoles(),
    db
      .select({ adminRoleIds: tables.guildSettings.adminRoleIds })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get(),
  ]);

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
async function handlePatchPermissions(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true });
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
// Dispatcher
// ---------------------------------------------------------------------------
export async function handlePermissions(ctx: RouteContext, request: Request): Promise<Response> {
  if (request.method === 'GET') return await handleGetPermissions(ctx);
  if (request.method === 'PATCH') return await handlePatchPermissions(ctx, request);
  return json({ error: 'Not Found' }, 404);
}
