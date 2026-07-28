import { verifySessionToken } from '../middleware/requireAuth';

/**
 * Elysia derive function that adds `user` and `isAdmin` to context.
 *
 * Route plugins should call `.derive(deriveAuth)` so their handlers
 * and composed guards receive `{ user, isAdmin }` at runtime.
 *
 * The parameter is intentionally untyped (`any`) because an explicit Elysia
 * `Context` annotation conflicts with Elysia's internal derive generic —
 * tsgo reports TS2345. Removing the explicit type lets tsgo infer the
 * derived property types via Elysia's own inference.
 */
export function deriveAuth({ cookie }: any) {
  const raw = cookie.session?.value;
  const token = typeof raw === 'string' ? raw : undefined;
  const user = token ? verifySessionToken(token) : null;
  return { user, isAdmin: user?.isAdmin ?? false };
}
