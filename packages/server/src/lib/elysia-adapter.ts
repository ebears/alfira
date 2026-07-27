import { type RouteContext } from './context';
import { SECURITY_HEADERS } from './securityHeaders';

export function wrapLegacy(
  handler: (ctx: RouteContext, request: Request) => Response | Promise<Response>
) {
  return (ctx: Record<string, unknown>): Response | Promise<Response> => {
    const routeCtx: RouteContext = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      user: ctx.user as RouteContext['user'],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      isAdmin: ctx.isAdmin as boolean,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      cookies: ctx.cookies as Record<string, string>,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return handler(routeCtx, ctx.request as Request);
  };
}

export const API_SECURITY_HEADERS: Record<string, string> = {};
for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
  if (key !== 'Set-Cookie') {
    API_SECURITY_HEADERS[key] = value;
  }
}
