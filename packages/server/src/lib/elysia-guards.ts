import { and, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';

import { verifySessionToken } from '../middleware/requireAuth';
import { type PermissionAction, type User } from '../shared';
import { db, tables } from '../shared/db';
import { getClient, getUserVoiceChannel } from './gatewayState';

// ---------------------------------------------------------------------------
// Auth context type — kept for backward compatibility with route helpers
// that still reference it.
// ---------------------------------------------------------------------------

export interface AuthContext {
  user: User | null;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Helper — verify the session cookie and return the user (or null).
// Shared by requireAuth and all macro resolve functions.
// ---------------------------------------------------------------------------

function resolveUser(cookie: Record<string, { value?: unknown }>): User | null {
  const raw = cookie.session?.value;
  const token = typeof raw === 'string' ? raw : undefined;
  return token ? verifySessionToken(token) : null;
}

// ---------------------------------------------------------------------------
// Auth plugin — macro-based authentication, authorization, and voice checks.
//
// Each "guard" macro is defined as a **named single macro** (the string +
// definition form) to work around Elysia's TypeScript limitation where
// macros that extend other macros cannot infer resolved properties.
//
// Usage:
//   import { authPlugin } from '../lib/elysia-guards';
//
//   new Elysia()
//     .use(authPlugin)
//     .get('/public', handler)                                          // public
//     .get('/profile', handler, { isAuth: true })                       // auth
//     .get('/admin', handler, { isAdmin: true })                        // auth + admin
//     .patch('/manage', handler, { hasPermission: 'queue.manage' })      // auth + perm
//     .post('/control', handler, { isVoiceChannel: true })              // auth + voice
//     .get('/setup', handler, { isSetupAdmin: true })                   // auth + setup
//
// Macros can be combined: { isVoiceChannel: true, hasPermission: 'queue.manage' }
// Super-admins automatically bypass the hasPermission check.
// ---------------------------------------------------------------------------

export const authPlugin = new Elysia({ name: 'auth' })
  // ── Base: authenticate and add `user` to context ──
  .macro('isAuth', {
    resolve({ cookie, status }) {
      const user = resolveUser(cookie);
      if (!user) {
        return status(401, { error: 'Not authenticated. Please log in at /auth/login.' });
      }
      return { user };
    },
  })

  // ── Admin: extends isAuth, checks user.isAdmin ──
  .macro('isAdmin', {
    isAuth: true,
    resolve({ cookie, status }) {
      const user = resolveUser(cookie);
      // If isAuth ran, user is guaranteed non-null; this is a defense-in-depth check
      if (!user || !user.isAdmin) {
        return status(403, { error: 'Admin access required.' });
      }
    },
  })

  // ── Permission: extends isAuth, checks granular role permission ──
  .macro('hasPermission', (permission: PermissionAction) => ({
    isAuth: true,
    resolve({ cookie, status }) {
      const user = resolveUser(cookie);
      if (!user) {
        return status(401, { error: 'Not authenticated.' });
      }
      if (user.isAdmin) {
        return; // super-admin bypass
      }
      const roles = user.roles ?? [];
      if (roles.length === 0) {
        return status(403, { error: 'You do not have permission to perform this action.' });
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
        return status(403, { error: 'You do not have permission to perform this action.' });
      }
    },
  }))

  // ── Voice channel: extends isAuth, checks bot + user voice state ──
  .macro('isVoiceChannel', {
    isAuth: true,
    resolve({ cookie, status }) {
      const user = resolveUser(cookie);
      if (!user) {
        return status(401, { error: 'Not authenticated.' });
      }
      const gateway = getClient();
      if (!gateway || !gateway.isReady()) {
        return status(503, { error: 'Discord bot is not ready yet.', code: 'BOT_NOT_READY' });
      }
      const voiceChannelId = getUserVoiceChannel(user.discordId);
      if (!voiceChannelId) {
        return status(409, {
          error: 'You must be in a voice channel to control playback.',
          code: 'NOT_IN_VOICE',
        });
      }
    },
  })

  // ── Setup admin: extends isAuth, checks user.isSetupAdmin ──
  .macro('isSetupAdmin', {
    isAuth: true,
    resolve({ cookie, status }) {
      const user = resolveUser(cookie);
      if (!user?.isSetupAdmin) {
        return status(403, { error: 'Setup has already been completed.' });
      }
    },
  });

// ---------------------------------------------------------------------------
// requireAuth — applies authentication to ALL routes below in a plugin.
//
// Use this when every route in a plugin needs auth (e.g., playlists).
// For plugins with mixed auth/public routes, use the `isAuth` macro per-route.
//
// The named macros (isAdmin, hasPermission, isVoiceChannel, isSetupAdmin) still
// work alongside requireAuth. They re-verify the token internally which is
// redundant but harmless for correctness.
//
// Usage:
//   new Elysia()
//     .use(authPlugin)
//     .use(requireAuth)
//     .get('/profile', handler, { hasPermission: 'audio.manage' })
// ---------------------------------------------------------------------------

export const requireAuth = new Elysia({ name: 'require-auth' }).resolve(
  { as: 'scoped' },
  ({ cookie, status }) => {
    const user = resolveUser(cookie);
    if (!user) {
      return status(401, { error: 'Not authenticated. Please log in at /auth/login.' });
    }
    return { user };
  }
);
