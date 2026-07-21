import { type verifySessionToken } from '../middleware/requireAuth';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------
export interface RouteContext {
  user: ReturnType<typeof verifySessionToken>;
  isAdmin: boolean;
  cookies: Record<string, string>;
}
