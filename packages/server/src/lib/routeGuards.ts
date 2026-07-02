import type { RouteContext } from '../index';
import type { User } from '../shared';
import { requireAdmin, requireAuth } from './guards';
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
export async function checkGuards(
  ctx: RouteContext,
  options: GuardOptions = {}
): Promise<GuardResult | Response> {
  const { admin = false, setupMode = false, voice = false } = options;

  const authResult = requireAuth(ctx);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Setup mode: grant access to the first user who logs in during setup.
  // This bypasses the normal admin check since admin roles aren't configured yet.
  if (setupMode && user.isSetupAdmin) {
    if (voice) {
      const inVoice = await requireUserInVoice(user.discordId);
      if (inVoice instanceof Response) return inVoice;
    }
    return { user };
  }

  if (admin) {
    const adminErr = requireAdmin(ctx);
    if (adminErr) return adminErr;
  }

  if (voice) {
    const inVoice = await requireUserInVoice(user.discordId);
    if (inVoice instanceof Response) return inVoice;
  }

  return { user };
}
