import type { RouteContext } from '../index';
import { json } from './json';

export function requireAuth(ctx: RouteContext): NonNullable<RouteContext['user']> | Response {
  if (!ctx.user) return json({ error: 'Not authenticated. Please log in at /auth/login.' }, 401);
  return ctx.user;
}

export function requireAdmin(ctx: RouteContext): Response | null {
  if (!ctx.isAdmin) return json({ error: 'Admin access required.' }, 403);
  return null;
}
