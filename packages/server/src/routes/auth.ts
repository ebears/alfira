import crypto from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import type { RouteContext } from '../index';
import { logger, WEB_UI_ORIGIN } from '../lib/config';
import { json } from '../lib/json';
import { db, tables } from '../shared/db';

const { refreshToken: refreshTokenTable } = tables;

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_BOT_TOKEN,
  GUILD_ID,
  JWT_SECRET,
  ADMIN_ROLE_IDS,
} = process.env;

if (
  !DISCORD_CLIENT_ID ||
  !DISCORD_CLIENT_SECRET ||
  !DISCORD_REDIRECT_URI ||
  !DISCORD_BOT_TOKEN ||
  !GUILD_ID ||
  !JWT_SECRET
) {
  throw new Error('Missing required environment variables for auth');
}

const ADMIN_ROLE_ID_SET = new Set(
  (ADMIN_ROLE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

const isProduction = process.env.NODE_ENV === 'production';

function isAdminUser(memberRoles: string[]): boolean {
  return memberRoles.some((roleId) => ADMIN_ROLE_ID_SET.has(roleId));
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
}): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
}

function generateRefreshToken(discordId: string): string {
  return jwt.sign({ discordId, type: 'refresh' }, JWT_SECRET!, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
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
  try {
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID!}/members/${discordId}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN!}` } }
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

/** Returns null if the user is not in the guild or Discord is unreachable. */
async function fetchUserAdminStatus(
  discordId: string
): Promise<{ isAdmin: boolean; username: string; avatar: string | null } | null> {
  try {
    const userRes = await fetch(`https://discord.com/api/users/${discordId}`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN!}` },
    });
    if (!userRes.ok) {
      throw new Error(`Discord API error: ${userRes.status}`);
    }
    const userData = (await userRes.json()) as { username: string; avatar: string | null };
    const { username, avatar } = userData;

    const roles = await fetchGuildMemberRoles(discordId);
    if (roles === null || roles === 'not-in-guild') return null;

    return {
      isAdmin: isAdminUser(roles),
      username,
      avatar: avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : null,
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
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI!,
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
  isAdmin: boolean
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = {
    discordId: discordUser.id,
    username: discordUser.username,
    avatar: discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null,
    isAdmin,
  };
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

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function handleAuth(ctx: RouteContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === 'GET' && pathname === '/auth/login') {
    return handleLogin(request);
  }
  if (request.method === 'GET' && pathname === '/auth/callback') {
    return await handleCallback(request, url);
  }
  if (request.method === 'POST' && pathname === '/auth/refresh') {
    return await handleRefresh(ctx);
  }
  if (request.method === 'GET' && pathname === '/auth/me') {
    return handleMe(ctx);
  }
  if (request.method === 'POST' && pathname === '/auth/logout') {
    return await handleLogout(ctx);
  }

  return json({ error: 'Not Found' }, 404);
}

function handleLogin(request: Request): Response {
  const ip = getClientIp(request);
  if (!authRateLimit(ip)) {
    return json(
      { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
      429
    );
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID!,
    redirect_uri: DISCORD_REDIRECT_URI!,
    response_type: 'code',
    scope: 'identify',
  });
  return Response.redirect(`https://discord.com/oauth2/authorize?${params}`, 302);
}

async function handleCallback(request: Request, url: URL): Promise<Response> {
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

  // 3. Verify guild membership and get member roles.
  const rolesResult = await fetchGuildMemberRoles(discordUser.id);
  if (rolesResult === null || rolesResult === 'not-in-guild') {
    return json({ error: 'You must be a member of the server to use this app.' }, 403);
  }
  const memberRoles = rolesResult;

  // 4. Determine admin status.
  const isAdmin = isAdminUser(memberRoles);

  // 5. Generate and store tokens.
  const { accessToken, refreshToken } = await generateAndStoreTokens(discordUser, isAdmin);

  // 6. Set cookies and redirect.
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    buildCookieHeader(ACCESS_COOKIE_NAME, accessToken, { maxAge: 60 * 60 * 1000 })
  );
  headers.append(
    'Set-Cookie',
    buildCookieHeader(REFRESH_COOKIE_NAME, refreshToken, { maxAge: REFRESH_TOKEN_MAX_AGE })
  );
  headers.append('Location', WEB_UI_ORIGIN);
  return new Response(null, { status: 302, headers });
}

async function handleRefresh(ctx: RouteContext): Promise<Response> {
  const refreshToken = ctx.cookies[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    return json({ error: 'No refresh token provided.' }, 401);
  }

  // 1. Verify the refresh token signature and expiration.
  let decoded: { discordId: string; type: string };
  try {
    decoded = jwt.verify(refreshToken, JWT_SECRET!) as { discordId: string; type: string };
    if (decoded.type !== 'refresh') {
      return json({ error: 'Invalid token type.' }, 401);
    }
  } catch {
    return json({ error: 'Invalid or expired refresh token.' }, 401);
  }

  // 2. Check if the refresh token exists in the database (not revoked).
  const tokenHash = hashToken(refreshToken);
  const [storedToken] = await db
    .select()
    .from(refreshTokenTable)
    .where(eq(refreshTokenTable.tokenHash, tokenHash))
    .limit(1);
  if (!storedToken) {
    return json({ error: 'Refresh token has been revoked.' }, 401);
  }

  // 3. Check if the refresh token has expired.
  if (storedToken.expiresAt < new Date()) {
    await db.delete(refreshTokenTable).where(eq(refreshTokenTable.id, storedToken.id));
    return json({ error: 'Refresh token has expired.' }, 401);
  }

  // 4. Delete the used refresh token (single-use for security).
  await db.delete(refreshTokenTable).where(eq(refreshTokenTable.id, storedToken.id));

  // 5. Clean up expired tokens for this user (lazy cleanup).
  await db
    .delete(refreshTokenTable)
    .where(
      and(
        eq(refreshTokenTable.discordId, decoded.discordId),
        lt(refreshTokenTable.expiresAt, new Date())
      )
    );

  // 6. Re-fetch user info from Discord (including admin status).
  const userInfo = await fetchUserAdminStatus(decoded.discordId);
  if (!userInfo) {
    await db.delete(refreshTokenTable).where(eq(refreshTokenTable.discordId, decoded.discordId));
    return json({ error: 'Unable to verify user membership. Please log in again.' }, 401);
  }

  // 7. Generate new tokens.
  const payload = {
    discordId: decoded.discordId,
    username: userInfo.username,
    avatar: userInfo.avatar,
    isAdmin: userInfo.isAdmin,
  };
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

function handleMe(ctx: RouteContext): Response {
  if (!ctx.user) {
    return json({ error: 'Not authenticated. Please log in at /auth/login.' }, 401);
  }
  return json({ user: ctx.user });
}

async function handleLogout(ctx: RouteContext): Promise<Response> {
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
