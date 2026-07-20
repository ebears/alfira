import { type RouteContext } from './context';
import { json } from './json';
import {
  attachRateLimitHeaders,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  type RateLimitInfo,
} from './rateLimit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A route handler receives ctx, request, and extracted path params. */
export type RouteHandler = (
  ctx: RouteContext,
  request: Request,
  params: Record<string, string>
) => Response | Promise<Response>;

/** A route entry: [HTTP method, path pattern, handler]. */
export type RouteEntry = [method: string, pattern: string, handler: RouteHandler];

export interface RouteTableConfig {
  /** Optional rate limit applied to all non-GET requests on this route group. */
  rateLimit?: { windowMs: number; maxRequests: number; bucket: string };
  routes: RouteEntry[];
}

// ---------------------------------------------------------------------------
// matchPath — template-based path matching with :param extraction
// ---------------------------------------------------------------------------

/**
 * Match a path against a template with `:param` placeholders.
 * Returns named parameters on match, null otherwise.
 *
 * Leading/trailing slashes are ignored — `/queue` and `/queue/` are equivalent.
 *
 * Example: matchPath('/abc/songs/123', '/:id/songs/:songId')
 *   => { id: 'abc', songId: '123' }
 */
export function matchPath(path: string, template: string): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean);
  const tplParts = template.split('/').filter(Boolean);
  if (pathParts.length !== tplParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < tplParts.length; i++) {
    const tpl = tplParts[i];
    const seg = pathParts[i];
    if (!tpl || !seg) {
      return null;
    }
    if (tpl.startsWith(':')) {
      params[tpl.slice(1)] = seg;
    } else if (tpl !== seg) {
      return null;
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// routeTable — produces a dispatcher function from a route table
// ---------------------------------------------------------------------------

/**
 * Build a route dispatcher function for the given URL prefix.
 *
 * The returned function has the standard `(ctx, request) => Promise<Response>`
 * signature used by all Alfira route modules.
 *
 * Routes are matched in registration order. The first matching method+pattern
 * wins. Unmatched requests receive `{"error":"Not Found"}` (404).
 *
 * When `rateLimit` is configured, non-GET requests are rate-limited per IP
 * before any route handler runs.
 */
export function routeTable(
  prefix: string,
  config: RouteTableConfig
): (ctx: RouteContext, request: Request) => Promise<Response> {
  const { rateLimit, routes } = config;

  return async function dispatch(ctx: RouteContext, request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(prefix.length) || '/';

    // Rate-limit non-GET requests.
    let rateLimitInfo: RateLimitInfo | null = null;
    if (rateLimit && request.method !== 'GET') {
      const ip = getClientIp(request);
      const result = checkRateLimit(rateLimit.bucket, ip, {
        windowMs: rateLimit.windowMs,
        maxRequests: rateLimit.maxRequests,
      });
      rateLimitInfo = result;
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    }

    for (const [method, pattern, handler] of routes) {
      if (request.method !== method) {
        continue;
      }

      const params = matchPath(path, pattern);
      if (params === null) {
        continue;
      }

      let response = await handler(ctx, request, params);

      // Attach rate limit headers to the response so the client can track
      // remaining budget and show approaching / cooldown UI.
      if (rateLimitInfo) {
        response = attachRateLimitHeaders(response, rateLimitInfo);
      }

      return response;
    }

    return json({ error: 'Not Found' }, 404);
  };
}
