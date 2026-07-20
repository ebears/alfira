import { and, eq, inArray } from 'drizzle-orm';
import type { RouteContext } from '../index';
import type { PermissionAction, User } from '../shared';
import { db, tables } from '../shared/db';
import { requireAdmin, requireAuth } from './guards';
import { json } from './json';
import { requireUserInVoice } from './voice';

interface GuardOptions {
  /** Require authenticated user. Defaults to true. */
  auth?: boolean;
  /** Require admin role. Defaults to false. */
  admin?: boolean;
  /** Allow access during first-run setup (user must have isSetupAdmin flag).
   *  Overrides the normal admin check. Defaults to false. */
  setupMode?: boolean;
  /** Require user is in a voice channel. Defaults to false. Requires auth. */
  voice?: boolean;
  /** Granular permission action. When set with admin:true, super-admins bypass;
   *  non-admin users are checked against the rolePermission table. */
  permission?: PermissionAction;
}

interface GuardResult {
  user: User;
}

/**
 * Runs the requested guards in order and returns the authenticated user,
 * or an error Response if any guard fails.
 *
 * Always authenticates the user by default. Admin and voice checks are
 * additive and run after authentication.
 */
export function checkGuards(ctx: RouteContext, options: GuardOptions = {}): GuardResult | Response {
  const { admin = false, setupMode = false, voice = false } = options;

  const authResult = requireAuth(ctx);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Setup mode: grant access to the first user who logs in during setup.
  // This bypasses the normal admin check since admin roles aren't configured yet.
  if (setupMode && user.isSetupAdmin) {
    if (voice) {
      const inVoice = requireUserInVoice(user.discordId);
      if (inVoice instanceof Response) return inVoice;
    }
    return { user };
  }

  if (admin) {
    // Super-admin bypass: users in adminRoleIds always pass.
    if (ctx.isAdmin) {
      // Fall through to voice check below.
    } else if (options.permission) {
      // Granular permission check for non-admin users.
      const hasPermission = checkRolePermission(user.roles ?? [], options.permission);
      if (!hasPermission) {
        return json({ error: 'You do not have permission to perform this action.' }, 403);
      }
    } else {
      // No granular permission — super-admin only.
      const adminErr = requireAdmin(ctx);
      if (adminErr) return adminErr;
    }
  }

  if (voice) {
    const inVoice = requireUserInVoice(user.discordId);
    if (inVoice instanceof Response) return inVoice;
  }

  return { user };
}

/**
 * Check if any of the user's Discord roles have been granted a specific
 * granular permission via the rolePermission table.
 */
function checkRolePermission(userRoles: string[], action: PermissionAction): boolean {
  if (userRoles.length === 0) return false;

  const rows = db
    .select({ roleId: tables.rolePermission.roleId })
    .from(tables.rolePermission)
    .where(
      and(
        eq(tables.rolePermission.action, action),
        inArray(tables.rolePermission.roleId, userRoles)
      )
    )
    .all();

  return rows.length > 0;
}
