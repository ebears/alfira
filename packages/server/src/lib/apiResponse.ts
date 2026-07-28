import { SECURITY_HEADERS } from './securityHeaders';

export const API_SECURITY_HEADERS: Record<string, string> = {};
for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
  if (key !== 'Set-Cookie') {
    API_SECURITY_HEADERS[key] = value;
  }
}
