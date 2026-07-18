import crypto from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { sign, verify } from '../lib/jwt';
import type { RouteContext } from '../index';
import { getGuildId, refreshGuildId } from '../lib/config';
import { json } from '../lib/json';
import { getClientIp } from '../lib/rateLimit';
import { routeTable } from '../lib/routeTable';
import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';

const { refreshToken: refreshTokenTable, guildSettings: guildSettingsTable } = tables;

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_BOT_TOKEN,
  JWT_SECRET,
} = process.env;

if (
  !DISCORD_CLIENT_ID ||
  !DISCORD_CLIENT_SECRET ||
  !DISCORD_REDIRECT_URI ||
  !DISCORD_BOT_TOKEN ||
  !JWT_SECRET
) {
  throw new Error('Missing required environment variables for auth');
}

// Type narrowing: after validation, these are guaranteed to be strings
const DISCORD_CLIENT_ID_: string = DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET_: string = DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI_: string = DISCORD_REDIRECT_URI;
const DISCORD_BOT_TOKEN_: string = DISCORD_BOT_TOKEN;
const JWT_SECRET_: string = JWT_SECRET;

const isProduction = process.env.NODE_ENV === 'production';

/** Read admin role IDs from the database (set via setup wizard or admin settings). */
async function getAdminRoleIdSet(): Promise<Set<string>> {
  try {
    const row = await db
      .select({ adminRoleIds: guildSettingsTable.adminRoleIds })
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.id, 1))
      .get();

    if (row?.adminRoleIds) {
      return new Set(
        row.adminRoleIds
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean)
      );
    }
  } catch {
    // DB not ready yet.
  }

  return new Set();
}

/** Check whether the setup wizard has been completed. */
async function isSetupCompleted(): Promise<boolean> {
  try {
    const row = await db
      .select({ setupCompleted: guildSettingsTable.setupCompleted })
      .from(guildSettingsTable)
      .where(eq(guildSettingsTable.id, 1))
      .get();
    return row?.setupCompleted ?? false;
  } catch {
    return false;
  }
}

async function isAdminUser(memberRoles: string[]): Promise<boolean> {
  const adminSet = await getAdminRoleIdSet();
  return memberRoles.some((roleId) => adminSet.has(roleId));
}

// Access tokens are short-lived (1h). Refresh tokens are long-lived (30d default),
// stored as SHA-256 hashes, and single-use.
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN ?? '30d';
const ACCESS_COOKIE_NAME = 'session';
const REFRESH_COOKIE_NAME = 'refresh_token';

const REFRESH_TOKEN_MAX_AGE = (() => {
  const match = REFRESH_TOKEN_EXPIRES_IN.match(/^(\d+)([dhms])$/);
  if (!match) {
    logger.warn(`Invalid JWT_EXPIRES_IN format "${REFRESH_TOKEN_EXPIRES_IN}", defaulting to 30d`);
    return 30 * 24 * 60 * 60 * 1000;
  }
  const multipliers: Record<string, number> = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  const unit = match[2] ?? 'd';
  const num = match[1] ? parseInt(match[1], 10) : 30;
  return num * (multipliers[unit] ?? 86400000);
})();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateAccessToken(payload: {
  discordId: string;
  username: string;
  avatar: string | null;
  isAdmin: boolean;
  isSetupAdmin?: boolean;
  roles?: string[];
}): string {
  return sign(payload, JWT_SECRET_, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function generateRefreshToken(discordId: string): string {
  return sign({ discordId, type: 'refresh' }, JWT_SECRET_, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

function buildCookieHeader(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    secure?: boolean;
  }
): string {
  const parts = [`${name}=${value}`];
  parts.push(`Path=/`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite ?? 'lax'}`);
  if (options.secure ?? isProduction) parts.push('Secure');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  return parts.join('; ');
}

function buildClearCookieHeader(name: string): string {
  return buildCookieHeader(name, '', { maxAge: 0, httpOnly: true, secure: isProduction });
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const authLimiterStore = new Map<string, { count: number; resetAt: number }>();

function authRateLimit(ip: string): boolean {
  const key = `auth:${ip}`;
  const now = Date.now();
  const entry = authLimiterStore.get(key);
  if (!entry || now > entry.resetAt) {
    authLimiterStore.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Fetches guild member roles. Returns 'not-in-guild' on 404, null on other errors. */
async function fetchGuildMemberRoles(discordId: string): Promise<string[] | null | 'not-in-guild'> {
  const guildId = getGuildId();
  if (!guildId) return null; // guild not configured yet

  try {
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${guildId}/members/${discordId}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_}` } }
    );
    if (memberRes.status === 404) {
      return 'not-in-guild';
    }
    if (!memberRes.ok) {
      throw new Error(`Discord API error: ${memberRes.status}`);
    }
    const data = (await memberRes.json()) as { roles?: string[] };
    return data.roles ?? [];
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to fetch guild member roles'
    );
    return null;
  }
}

/**
 * Fetch a Discord user's basic profile (username, avatar).
 * Does NOT check guild membership. Used during setup mode.
 */
async function fetchDiscordUserProfile(
  discordId: string
): Promise<{ username: string; avatar: string | null } | null> {
  try {
    const res = await fetch(`https://discord.com/api/users/${discordId}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { username: string; avatar: string | null };
    return {
      username: data.username,
      avatar: data.avatar
        ? `https://cdn.discordapp.com/avatars/${discordId}/${data.avatar}.png`
        : null,
    };
  } catch {
    return null;
  }
}

/** Returns null if the user is not in the guild or Discord is unreachable. */
async function fetchUserAdminStatus(
  discordId: string
): Promise<{ isAdmin: boolean; username: string; avatar: string | null; roles: string[] } | null> {
  try {
    const userRes = await fetch(`https://discord.com/api/users/${discordId}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN_}` },
    });
    if (!userRes.ok) {
      throw new Error(`Discord API error: ${userRes.status}`);
    }
    const userData = (await userRes.json()) as { username: string; avatar: string | null };
    const { username, avatar } = userData;

    const roles = await fetchGuildMemberRoles(discordId);
    if (roles === null || roles === 'not-in-guild') return null;

    return {
      isAdmin: await isAdminUser(roles),
      username,
      avatar: avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : null,
      roles,
    };
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to fetch user info from Discord'
    );
    return null;
  }
}

/**
 * Exchange authorization code for Discord access token.
 * Returns null and sends error response on failure.
 */
async function exchangeAuthorizationCode(code: string): Promise<string | null> {
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID_,
        client_secret: DISCORD_CLIENT_SECRET_,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI_,
      }),
    });
    if (!tokenRes.ok) {
      return null;
    }
    const data = (await tokenRes.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch Discord user identity.
 * Returns null on failure.
 */
async function fetchDiscordIdentity(
  discordToken: string
): Promise<{ id: string; username: string; avatar: string | null } | null> {
  try {
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${discordToken}` },
    });
    if (!userRes.ok) {
      return null;
    }
    return (await userRes.json()) as { id: string; username: string; avatar: string | null };
  } catch {
    return null;
  }
}

/**
 * Generate and store authentication tokens.
 */
async function generateAndStoreTokens(
  discordUser: { id: string; username: string; avatar: string | null },
  isAdmin: boolean,
  opts: { isSetupAdmin?: boolean; roles?: string[] } = {}
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload: {
    discordId: string;
    username: string;
    avatar: string | null;
    isAdmin: boolean;
    isSetupAdmin?: boolean;
    roles?: string[];
  } = {
    discordId: discordUser.id,
    username: discordUser.username,
    avatar: discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null,
    isAdmin,
  };
  if (opts.isSetupAdmin) payload.isSetupAdmin = true;
  if (opts.roles) payload.roles = opts.roles;
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(discordUser.id);

  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE);
  await db.insert(refreshTokenTable).values({
    tokenHash: refreshTokenHash,
    discordId: discordUser.id,
    expiresAt: refreshTokenExpiry,
  });

  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export const handleAuth = routeTable('/auth', {
  routes: [
    ['GET', '/login', handleLogin],
    ['GET', '/callback', handleCallback],
    ['POST', '/refresh', handleRefresh],
    ['GET', '/me', handleMe],
    ['POST', '/logout', handleLogout],
  ],
});

function handleLogin(
  _ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Response {
  const ip = getClientIp(request);
  if (!authRateLimit(ip)) {
    return json(
      { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
      429
    );
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID_,
    redirect_uri: DISCORD_REDIRECT_URI_,
    response_type: 'code',
    scope: 'identify',
  });
  return Response.redirect(`https://discord.com/oauth2/authorize?${params}`, 302);
}

async function handleCallback(
  _ctx: RouteContext,
  request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const ip = getClientIp(request);
  if (!authRateLimit(ip)) {
    return json(
      { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
      429
    );
  }
  const code = url.searchParams.get('code');
  if (!code) {
    return json({ error: 'Missing authorization code.' }, 400);
  }

  // 1. Exchange code for Discord access token.
  const discordToken = await exchangeAuthorizationCode(code);
  if (!discordToken) {
    return json({ error: 'Failed to exchange authorization code with Discord.' }, 502);
  }

  // 2. Fetch Discord identity.
  const discordUser = await fetchDiscordIdentity(discordToken);
  if (!discordUser) {
    return json({ error: 'Failed to fetch Discord user info.' }, 502);
  }

  // 3. Check if setup has been completed.
  const setupDone = await isSetupCompleted();

  if (!setupDone) {
    // If GUILD_ID and ADMIN_ROLE_IDS are in env (existing deployment),
    // auto-complete setup. Otherwise, redirect to the setup wizard.
    const envGuildId = process.env.GUILD_ID;
    if (envGuildId) {
      // Seed env vars into DB and mark setup complete.
      await db
        .insert(guildSettingsTable)
        .values({
          id: 1,
          guildId: envGuildId,
          setupCompleted: true,
          adminRoleIds: process.env.ADMIN_ROLE_IDS ?? '',
        })
        .onConflictDoUpdate({
          target: guildSettingsTable.id,
          set: {
            guildId: envGuildId,
            setupCompleted: true,
            adminRoleIds: process.env.ADMIN_ROLE_IDS ?? '',
          },
        })
        .run();

      // Refresh the in-memory guild ID cache.
      refreshGuildId(envGuildId);

      // Fall through to normal auth flow below.
    } else {
      // Fresh install — redirect to setup wizard.
      const { accessToken, refreshToken } = await generateAndStoreTokens(discordUser, true, {
        isSetupAdmin: true,
      });

      const headers = new Headers();
      headers.append(
        'Set-Cookie',
        buildCookieHeader(ACCESS_COOKIE_NAME, accessToken, { maxAge: 60 * 60 * 1000 })
      );
      headers.append(
        'Set-Cookie',
        buildCookieHeader(REFRESH_COOKIE_NAME, refreshToken, { maxAge: REFRESH_TOKEN_MAX_AGE })
      );
      headers.append('Location', '/setup');
      return new Response(null, { status: 302, headers });
    }
  }

  // 4. Normal flow — verify guild membership and get member roles.
  const rolesResult = await fetchGuildMemberRoles(discordUser.id);
  if (rolesResult === null || rolesResult === 'not-in-guild') {
    return json({ error: 'You must be a member of the server to use this app.' }, 403);
  }
  const memberRoles = rolesResult;

  // 5. Determine admin status.
  const isAdmin = await isAdminUser(memberRoles);

  // 6. Generate and store tokens.
  const { accessToken, refreshToken } = await generateAndStoreTokens(discordUser, isAdmin, {
    roles: memberRoles,
  });

  // 7. Set cookies and redirect.
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    buildCookieHeader(ACCESS_COOKIE_NAME, accessToken, { maxAge: 60 * 60 * 1000 })
  );
  headers.append(
    'Set-Cookie',
    buildCookieHeader(REFRESH_COOKIE_NAME, refreshToken, { maxAge: REFRESH_TOKEN_MAX_AGE })
  );
  headers.append('Location', '/');
  return new Response(null, { status: 302, headers });
}

/** Retry an async operation up to `attempts` times with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastErr;
}

async function handleRefresh(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const refreshToken = ctx.cookies[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    logger.warn('Auth refresh failed: no refresh token cookie present');
    return json({ error: 'No refresh token provided.' }, 401);
  }

  // 1. Verify the refresh token signature and expiration.
  const decoded = verify<{ discordId: string; type: string }>(refreshToken, JWT_SECRET_);
  if (!decoded) {
    logger.warn('Auth refresh failed: JWT verification');
    return json({ error: 'Invalid or expired refresh token.' }, 401);
  }
  if (decoded.type !== 'refresh') {
    logger.warn({ decodedType: decoded.type }, 'Auth refresh failed: invalid token type');
    return json({ error: 'Invalid token type.' }, 401);
  }

  // 2. Check if the refresh token exists in the database (not revoked).
  const tokenHash = hashToken(refreshToken);
  const [storedToken] = await db
    .select()
    .from(refreshTokenTable)
    .where(eq(refreshTokenTable.tokenHash, tokenHash))
    .limit(1);
  if (!storedToken) {
    logger.warn(
      { discordId: decoded.discordId },
      'Auth refresh failed: token hash not found in DB (revoked or already burned)'
    );
    return json({ error: 'Refresh token has been revoked.' }, 401);
  }

  // 3. Check if the refresh token has expired.
  if (storedToken.expiresAt < new Date()) {
    logger.warn(
      { discordId: decoded.discordId, expiresAt: storedToken.expiresAt, now: new Date() },
      'Auth refresh failed: DB expiresAt has passed'
    );
    await db.delete(refreshTokenTable).where(eq(refreshTokenTable.id, storedToken.id));
    return json({ error: 'Refresh token has expired.' }, 401);
  }

  // 4. Clean up expired tokens for this user (lazy cleanup).
  await db
    .delete(refreshTokenTable)
    .where(
      and(
        eq(refreshTokenTable.discordId, decoded.discordId),
        lt(refreshTokenTable.expiresAt, new Date())
      )
    );

  // 5. Re-fetch user info from Discord (including admin status).
  //    This runs BEFORE we burn the old refresh token — if Discord is
  //    unreachable, the client can retry with the same token.
  //    During setup mode, skip guild membership check.
  const setupDone = await isSetupCompleted();
  let username: string;
  let avatar: string | null;
  let isAdmin: boolean;
  let isSetupAdmin = false;
  let roles: string[] | undefined;

  if (!setupDone) {
    // Setup not complete — fetch basic profile, grant admin.
    try {
      const profile = await withRetry(() => fetchDiscordUserProfile(decoded.discordId));
      if (!profile) {
        logger.warn(
          { discordId: decoded.discordId },
          'Auth refresh failed: fetchDiscordUserProfile returned null (setup mode)'
        );
        return json({ error: 'Unable to verify user identity. Please try again.' }, 503);
      }
      username = profile.username;
      avatar = profile.avatar;
      isAdmin = true;
      isSetupAdmin = true;
    } catch (err) {
      logger.warn(
        { discordId: decoded.discordId, err: (err as Error).message },
        'Auth refresh failed: Discord unreachable (setup mode)'
      );
      return json({ error: 'Discord is temporarily unreachable. Please try again.' }, 503);
    }
  } else {
    // Normal flow — verify guild membership and roles.
    try {
      const userInfo = await withRetry(() => fetchUserAdminStatus(decoded.discordId));
      if (!userInfo) {
        logger.warn(
          { discordId: decoded.discordId },
          'Auth refresh failed: fetchUserAdminStatus returned null (not in guild or Discord error)'
        );
        return json({ error: 'Unable to verify user membership. Please try again.' }, 503);
      }
      username = userInfo.username;
      avatar = userInfo.avatar;
      isAdmin = userInfo.isAdmin;
      roles = userInfo.roles;
    } catch (err) {
      logger.warn(
        { discordId: decoded.discordId, err: (err as Error).message },
        'Auth refresh failed: Discord unreachable'
      );
      return json({ error: 'Discord is temporarily unreachable. Please try again.' }, 503);
    }
  }

  // 6. Burn the old refresh token now that Discord verification succeeded.
  logger.info({ discordId: decoded.discordId }, 'Auth refresh succeeded — issuing new tokens');
  await db.delete(refreshTokenTable).where(eq(refreshTokenTable.id, storedToken.id));

  // 7. Generate new tokens.
  const payload: {
    discordId: string;
    username: string;
    avatar: string | null;
    isAdmin: boolean;
    isSetupAdmin?: boolean;
    roles?: string[];
  } = {
    discordId: decoded.discordId,
    username,
    avatar,
    isAdmin,
  };
  if (isSetupAdmin) payload.isSetupAdmin = true;
  if (roles) payload.roles = roles;
  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(decoded.discordId);

  // 8. Store new refresh token.
  const newTokenHash = hashToken(newRefreshToken);
  const newExpiry = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE);
  await db.insert(refreshTokenTable).values({
    tokenHash: newTokenHash,
    discordId: decoded.discordId,
    expiresAt: newExpiry,
  });

  // 9. Set cookies and return user info.
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    buildCookieHeader(ACCESS_COOKIE_NAME, newAccessToken, { maxAge: 60 * 60 * 1000 })
  );
  headers.append(
    'Set-Cookie',
    buildCookieHeader(REFRESH_COOKIE_NAME, newRefreshToken, { maxAge: REFRESH_TOKEN_MAX_AGE })
  );
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({ user: payload }), { status: 200, headers });
}

async function handleMe(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  if (!ctx.user) {
    return json({ error: 'Not authenticated. Please log in at /auth/login.' }, 401);
  }
  // If setup hasn't been completed (e.g., DB was wiped), flag the user as
  // a setup admin so the frontend redirects to the setup wizard instead of
  // showing a broken main UI with a valid-but-stale session cookie.
  const setupDone = await isSetupCompleted();
  if (!setupDone) {
    return json({ user: { ...ctx.user, isSetupAdmin: true } });
  }
  return json({ user: ctx.user });
}

async function handleLogout(
  ctx: RouteContext,
  _request: Request,
  _params: Record<string, string>
): Promise<Response> {
  const refreshToken = ctx.cookies[REFRESH_COOKIE_NAME];
  if (refreshToken) {
    try {
      const tokenHash = hashToken(refreshToken);
      await db.delete(refreshTokenTable).where(eq(refreshTokenTable.tokenHash, tokenHash));
    } catch {
      logger.warn('Failed to revoke refresh token on logout');
    }
  }
  const headers = new Headers();
  headers.append('Set-Cookie', buildClearCookieHeader(ACCESS_COOKIE_NAME));
  headers.append('Set-Cookie', buildClearCookieHeader(REFRESH_COOKIE_NAME));
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({ message: 'Logged out.' }), { status: 200, headers });
}
