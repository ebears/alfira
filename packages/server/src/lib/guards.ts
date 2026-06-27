import type { RouteContext } from '../index';
import { json } from './json';

export function requireAuth(ctx: RouteContext): Response | null {
  if (!ctx.user) return json({ error: 'Login required.' }, 401);
  return null;
}

export function requireAdmin(ctx: RouteContext): Response | null {
  if (!ctx.isAdmin) return json({ error: 'Admin access required.' }, 403);
  return null;
}
