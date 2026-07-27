import { and, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { type PermissionAction } from '../shared';
import { db, tables } from '../shared/db';
import { getClient, getUserVoiceChannel } from './gatewayState';

// ---------------------------------------------------------------------------
// Auth context type — used by route-internal helpers that need typed access
// to the user/isAdmin derived by `deriveAuth`.
// ---------------------------------------------------------------------------

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
// Auth guard — short-circuits with 401 if no authenticated user.
// Compose with `.use(authGuard)` on any plugin that calls `.derive(deriveAuth)`.
// ---------------------------------------------------------------------------

export const authGuard = new Elysia().onBeforeHandle((ctx) => {
  const { user } = ctx as unknown as { user: AuthContext['user'] };
  if (!user) {
    return Response.json(
      { error: 'Not authenticated. Please log in at /auth/login.' },
      { status: 401 }
    );
  }
});

// ---------------------------------------------------------------------------
// Admin guard — short-circuits with 403 if user is not a super-admin.
// Must be composed after authGuard.
// ---------------------------------------------------------------------------

export const adminGuard = new Elysia().onBeforeHandle((ctx) => {
  const { isAdmin } = ctx as unknown as { isAdmin: boolean };
  if (!isAdmin) {
    return Response.json({ error: 'Admin access required.' }, { status: 403 });
  }
});

// ---------------------------------------------------------------------------
// Permission guard factory — returns a plugin that short-circuits with 403
// if the user lacks the given granular permission. Super-admins bypass.
// Must be composed after authGuard.
// ---------------------------------------------------------------------------

export function createPermissionGuard(permission: PermissionAction): Elysia {
  return new Elysia().onBeforeHandle((ctx) => {
    const { user, isAdmin } = ctx as unknown as {
      user: AuthContext['user'];
      isAdmin: boolean;
    };

    if (isAdmin) {
      return; // super-admin bypass
    }

    if (!user) {
      return Response.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const roles = user.roles ?? [];
    if (roles.length === 0) {
      return Response.json(
        { error: 'You do not have permission to perform this action.' },
        { status: 403 }
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
      return Response.json(
        { error: 'You do not have permission to perform this action.' },
        { status: 403 }
      );
    }
  }) as unknown as Elysia;
}

// ---------------------------------------------------------------------------
// Admin-or-permission guard factory — combines auth, admin, and optional
// granular permission checks into a single composable plugin.
//
// Usage:
//   .use(createAdminOrPermissionGuard())          → auth + admin
//   .use(createAdminOrPermissionGuard('queue.manage')) → auth + (admin OR permission)
// ---------------------------------------------------------------------------

export function createAdminOrPermissionGuard(permission?: PermissionAction): Elysia {
  if (permission) {
    return new Elysia().use(authGuard).use(createPermissionGuard(permission)) as unknown as Elysia;
  }
  return new Elysia().use(authGuard).use(adminGuard) as unknown as Elysia;
}

// ---------------------------------------------------------------------------
// Voice guard — short-circuits with 503 if the Discord bot is not ready,
// or 409 if the user is not in a voice channel.
//
// Must be composed after authGuard so `user` is guaranteed non-null.
// ---------------------------------------------------------------------------

export const voiceGuard = new Elysia().onBeforeHandle((ctx) => {
  const gateway = getClient();
  if (!gateway || !gateway.isReady()) {
    return Response.json(
      { error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' },
      { status: 503 }
    );
  }

  const { user } = ctx as unknown as { user: AuthContext['user'] };
  const discordId = user?.discordId;
  const voiceChannelId = getUserVoiceChannel(discordId ?? '');
  if (!voiceChannelId) {
    return Response.json(
      { error: 'You must be in a voice channel to control playback.', code: 'NOT_IN_VOICE' },
      { status: 409 }
    );
  }
});

// ---------------------------------------------------------------------------
// Setup mode guard — short-circuits with 401 if not authenticated,
// or 403 if the user lacks the isSetupAdmin flag.
// ---------------------------------------------------------------------------

export const setupModeGuard = new Elysia().use(authGuard).onBeforeHandle((ctx) => {
  const { user } = ctx as unknown as { user: AuthContext['user'] };
  if (!user?.isSetupAdmin) {
    return Response.json({ error: 'Setup has already been completed.' }, { status: 403 });
  }
});
