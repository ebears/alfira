import { verifySessionToken } from '../middleware/requireAuth';
import { parseCookies } from './cookies';

/**
 * Elysia derive function that adds `user`, `isAdmin`, and `cookies` to context.
 *
 * Route plugins should call `.derive(deriveAuth)` directly so their handlers
 * and composed guards receive `{ user, isAdmin, cookies }` at runtime.
 *
 * The parameter is intentionally untyped (`any`) because an explicit Elysia
 * `Context` annotation conflicts with Elysia's internal derive generic —
 * tsgo reports TS2345. Removing the explicit type lets tsgo infer the
 * derived property types via Elysia's own inference. The `no-unsafe-*` rules
 * for this file are suppressed in oxlint.config.ts.
 *
 * Handlers that need typed access to user should cast ctx.user with the
 * `User` type from `../shared` (which is the return type of verifySessionToken).
 */
export function deriveAuth({ cookie, request }: any) {
  const raw = cookie.session?.value;
  const token = typeof raw === 'string' ? raw : undefined;
  const user = token ? verifySessionToken(token) : null;
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  return { user, isAdmin: user?.isAdmin ?? false, cookies };
}
