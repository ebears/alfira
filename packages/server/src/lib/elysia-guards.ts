import { and, eq, inArray } from 'drizzle-orm';

import { type PermissionAction } from '../shared';
import { db, tables } from '../shared/db';
import { getClient, getUserVoiceChannel } from './gatewayState';

/**
 * Elysia context shape after the global auth derive.
 */
export interface AuthContext {
  user: {
    discordId: string;
    username: string;
    avatar: string | null;
    isAdmin: boolean;
    isSetupAdmin?: boolean;
    roles?: string[];
  } | null;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Guard helpers
// ---------------------------------------------------------------------------

/** Returns 401 if no authenticated user. */
export function requireAuth(ctx: AuthContext): Response | null {
  if (!ctx.user) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated. Please log in at /auth/login.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  return null;
}

/** Returns 403 if user is not a super-admin. */
export function requireAdmin(ctx: AuthContext): Response | null {
  if (!ctx.isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

/**
 * Returns 403 if the user is neither a super-admin nor has the given
 * granular permission via role assignments.
 */
export function requirePermission(ctx: AuthContext, permission: PermissionAction): Response | null {
  // Super-admin bypass
  if (ctx.isAdmin) {
    return null;
  }

  if (!ctx.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const roles = ctx.user.roles ?? [];
  if (roles.length === 0) {
    return new Response(
      JSON.stringify({ error: 'You do not have permission to perform this action.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const rows = db
    .select({ roleId: tables.rolePermission.roleId })
    .from(tables.rolePermission)
    .where(
      and(
        eq(tables.rolePermission.action, permission),
        inArray(tables.rolePermission.roleId, roles)
      )
    )
    .all();

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'You do not have permission to perform this action.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

/** Combines auth + admin + optional granular permission. Returns null on success, Response on failure. */
export function requireAdminOrPermission(
  ctx: AuthContext,
  permission?: PermissionAction
): Response | null {
  const authErr = requireAuth(ctx);
  if (authErr) {
    return authErr;
  }

  if (permission) {
    return requirePermission(ctx, permission);
  }

  return requireAdmin(ctx);
}

/** Returns 409 if the user is not in a voice channel, 503 if bot not ready. */
export function requireUserInVoice(ctx: AuthContext): Response | null {
  const gateway = getClient();
  if (!gateway || !gateway.isReady()) {
    return new Response(
      JSON.stringify({ error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const discordId = (ctx.user as { discordId: string } | null)?.discordId;
  const voiceChannelId = getUserVoiceChannel(discordId ?? '');
  if (!voiceChannelId) {
    return new Response(
      JSON.stringify({
        error: 'You must be in a voice channel to control playback.',
        code: 'NOT_IN_VOICE',
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

/** Returns 401 if not authenticated, 403 if user lacks isSetupAdmin flag. */
export function requireSetupMode(ctx: AuthContext): Response | null {
  const authErr = requireAuth(ctx);
  if (authErr) {
    return authErr;
  }

  if (!(ctx.user as { isSetupAdmin?: boolean } | null)?.isSetupAdmin) {
    return new Response(JSON.stringify({ error: 'Setup has already been completed.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}
