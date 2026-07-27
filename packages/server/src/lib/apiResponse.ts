import { SECURITY_HEADERS } from './securityHeaders';

export const API_SECURITY_HEADERS: Record<string, string> = {};
for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
  if (key !== 'Set-Cookie') {
    API_SECURITY_HEADERS[key] = value;
  }
}

/**
 * JSON response helper for native Elysia route handlers.
 * Includes API security headers (CSP, X-Content-Type-Options, etc.).
 */
export function elysiaJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...API_SECURITY_HEADERS },
  });
}
