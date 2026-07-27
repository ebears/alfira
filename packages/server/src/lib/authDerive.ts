import { verifySessionToken } from '../middleware/requireAuth';
import { parseCookies } from './cookies';

/**
 * Elysia derive function that adds user / isAdmin / cookies to the context.
 *
 * Route plugins should call `.derive(deriveAuth)` directly so their handlers
 * receive typed `{ user, isAdmin, cookies }` destructuring.
 *
 * This must be called directly on the plugin's Elysia instance — NOT wrapped
 * in `.use()` — because Elysia's derive types do not propagate through
 * `.use()` boundaries (TypeScript resolves plugin handler types at definition
 * time, before the plugin is composed into a parent).
 *
 * The parameter is typed `any` because an explicit `{ cookie, request }`
 * annotation conflicts with Elysia's internal derive generic — tsgo reports
 * TS2345. Removing the explicit return type lets tsgo infer the derived
 * property types via Elysia's own inference. The `no-unsafe-*` rules for this
 * file are suppressed in oxlint.config.ts.
 */
export function deriveAuth({ cookie, request }: any) {
  const raw = cookie.session?.value;
  const token = typeof raw === 'string' ? raw : undefined;
  const user = token ? verifySessionToken(token) : null;
  const cookies = parseCookies(request.headers.get('cookie') ?? '');
  return { user, isAdmin: user?.isAdmin ?? false, cookies };
}
