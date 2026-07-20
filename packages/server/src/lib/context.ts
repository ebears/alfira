import type { verifySessionToken } from '../middleware/requireAuth';

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------
export type RouteContext = {
  user: ReturnType<typeof verifySessionToken>;
  isAdmin: boolean;
  cookies: Record<string, string>;
};
