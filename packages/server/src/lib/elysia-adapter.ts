import { logger } from '../shared/logger';
import { type RouteContext } from './context';
import { SECURITY_HEADERS } from './securityHeaders';

export function wrapLegacy(
  handler: (ctx: RouteContext, request: Request) => Response | Promise<Response>
) {
  return async (ctx: Record<string, unknown>): Promise<Response> => {
    const routeCtx: RouteContext = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      user: ctx.user as RouteContext['user'],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      isAdmin: ctx.isAdmin as boolean,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      cookies: ctx.cookies as Record<string, string>,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const request = ctx.request as Request;
      const url = new URL(request.url);
      logger.debug({ method: request.method, path: url.pathname }, 'wrapLegacy');
      return await handler(routeCtx, request);
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          url: (ctx.request as Request).url,
        },
        'wrapLegacy: unhandled error in legacy handler'
      );
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

export const API_SECURITY_HEADERS: Record<string, string> = {};
for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
  if (key !== 'Set-Cookie') {
    API_SECURITY_HEADERS[key] = value;
  }
}

/**
 * JSON response helper for native Elysia route handlers.
 * Includes API security headers (CSP, X-Content-Type-Options, etc.).
 * Legacy handlers should continue using lib/json.ts which does the same.
 */
export function elysiaJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...API_SECURITY_HEADERS },
  });
}
