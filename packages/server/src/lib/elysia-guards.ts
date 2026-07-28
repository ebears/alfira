import { and, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { type PermissionAction, type User } from '../shared';
import { db, tables } from '../shared/db';
import { getClient, getUserVoiceChannel } from './gatewayState';

// ---------------------------------------------------------------------------
// Auth context type — used by route-internal helpers that need typed access
// to the user/isAdmin derived by `deriveAuth`.
// ---------------------------------------------------------------------------

export interface AuthContext {
  user: User | null;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Auth guard — short-circuits with 401 if no authenticated user.
// Compose with `.use(authGuard)` on any plugin that calls `.derive(deriveAuth)`.
//
// The `user` property is added by deriveAuth on the _parent_ instance, so it
// is available at runtime in onBeforeHandle but not visible to TypeScript in
// this guard's own context type. The cast is a necessary consequence of
// Elysia's per-instance type encapsulation.
// ---------------------------------------------------------------------------

export const authGuard = new Elysia({ name: 'auth-guard' }).onBeforeHandle((ctx) => {
  const { user } = ctx as unknown as { user: User | null };
  if (!user) {
    return ctx.status(401, {
      error: 'Not authenticated. Please log in at /auth/login.',
    });
  }
});

// ---------------------------------------------------------------------------
// Admin guard — short-circuits with 403 if user is not a super-admin.
// Must be composed after authGuard.
//
// The `isAdmin` property is added by deriveAuth on the parent instance;
// the `as unknown` cast is needed because Elysia's per-instance type
// encapsulation doesn't propagate derived properties to child guards.
// ---------------------------------------------------------------------------

export const adminGuard = new Elysia({ name: 'admin-guard' }).onBeforeHandle((ctx) => {
  const { isAdmin } = ctx as unknown as { isAdmin: boolean };
  if (!isAdmin) {
    return ctx.status(403, { error: 'Admin access required.' });
  }
});

// ---------------------------------------------------------------------------
// Permission guard factory — returns a plugin that short-circuits with 403
// if the user lacks the given granular permission. Super-admins bypass.
// Must be composed after authGuard.
//
// The `as unknown as Elysia` return cast is required because onBeforeHandle
// narrows the instance type, which would break `.use()` composition with
// other plugins. The inner `as unknown as { user, isAdmin }` cast follows
// the same pattern as authGuard: derived properties aren't visible in
// child instances due to Elysia's type encapsulation.
// ---------------------------------------------------------------------------

export function createPermissionGuard(permission: PermissionAction): Elysia {
  return new Elysia({ name: `perm-guard:${permission}` }).onBeforeHandle((ctx) => {
    const { user, isAdmin } = ctx as unknown as {
      user: User | null;
      isAdmin: boolean;
    };

    if (isAdmin) {
      return; // super-admin bypass
    }

    if (!user) {
      return ctx.status(401, { error: 'Not authenticated.' });
    }

    const roles = user.roles ?? [];
    if (roles.length === 0) {
      return ctx.status(403, {
        error: 'You do not have permission to perform this action.',
      });
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
      return ctx.status(403, {
        error: 'You do not have permission to perform this action.',
      });
    }
  }) as unknown as Elysia;
}

// ---------------------------------------------------------------------------
// Admin-or-permission guard factory — combines auth, admin, and optional
// granular permission checks into a single composable plugin.
//
// Usage:
//   .use(createAdminOrPermissionGuard())              → auth + admin
//   .use(createAdminOrPermissionGuard('queue.manage')) → auth + (admin OR permission)
//
// The `as unknown as Elysia` casts are required because composing guards
// via `.use()` narrows the instance type, which would prevent further
// `.use()` composition at call sites.
// ---------------------------------------------------------------------------

export function createAdminOrPermissionGuard(permission?: PermissionAction): Elysia {
  if (permission) {
    return new Elysia({ name: `admin-or-perm:${permission}` })
      .use(authGuard)
      .use(createPermissionGuard(permission)) as unknown as Elysia;
  }
  return new Elysia({ name: 'admin-or-perm:admin' })
    .use(authGuard)
    .use(adminGuard) as unknown as Elysia;
}

// ---------------------------------------------------------------------------
// Voice guard — short-circuits with 503 if the Discord bot is not ready,
// or 409 if the user is not in a voice channel.
//
// Must be composed after authGuard so `user` is guaranteed non-null.
// The `as unknown` cast on `ctx` follows the same pattern as authGuard:
// derived properties aren't visible in child instances.
// ---------------------------------------------------------------------------

export const voiceGuard = new Elysia({ name: 'voice-guard' }).onBeforeHandle(
  { as: 'scoped' },
  (ctx) => {
    const gateway = getClient();
    if (!gateway || !gateway.isReady()) {
      return ctx.status(503, {
        error: 'Discord bot is not ready yet.',
        code: 'BOT_NOT_READY',
      });
    }

    const { user } = ctx as unknown as { user: User | null };
    const discordId = user?.discordId;
    const voiceChannelId = getUserVoiceChannel(discordId ?? '');
    if (!voiceChannelId) {
      return ctx.status(409, {
        error: 'You must be in a voice channel to control playback.',
        code: 'NOT_IN_VOICE',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Setup mode guard — short-circuits with 401 if not authenticated,
// or 403 if the user lacks the isSetupAdmin flag.
// The `as unknown` cast on `ctx` follows the same pattern as authGuard.
// ---------------------------------------------------------------------------

export const setupModeGuard = new Elysia({ name: 'setup-mode-guard' })
  .use(authGuard)
  .onBeforeHandle((ctx) => {
    const { user } = ctx as unknown as { user: User | null };
    if (!user?.isSetupAdmin) {
      return ctx.status(403, { error: 'Setup has already been completed.' });
    }
  });
