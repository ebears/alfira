// ---------------------------------------------------------------------------
// In-memory IP-based rate limiter
//
// Lightweight sliding-window implementation with no external dependencies.
// Each route group gets its own bucket with configurable window and max reqs.
// Entries are cleaned up lazily on each check — stale entries from inactive
// IPs are removed when they're encountered.
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

const stores = new Map<string, Map<string, RateLimitBucket>>();

/**
 * Extract a client IP from a Request, respecting proxy headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Check whether a request is within the rate limit for a given route group.
 * Returns true if the request is allowed, false if rate-limited.
 *
 * Each call that succeeds increments the counter. Stale entries are pruned
 * automatically when they're found to be outside the current window.
 *
 * @param group  Identifier for the route group (e.g., 'player-mutations')
 * @param ip     Client IP address
 * @param config Optional override for window and max requests
 */
export function checkRateLimit(
  group: string,
  ip: string,
  config: Partial<RateLimitConfig> = {}
): boolean {
  const { windowMs, maxRequests } = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let store = stores.get(group);
  if (!store) {
    store = new Map();
    stores.set(group, store);
  }

  const entry = store.get(ip);

  // First request from this IP, or outside the current window.
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(ip, { count: 1, windowStart: now });
    return true;
  }

  // Within the current window but over the limit.
  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Build a 429 Response for rate-limited requests.
 * Includes Retry-After header.
 */
export function rateLimitResponse(retryAfterSeconds = 60): Response {
  return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
    },
  });
}

/**
 * Periodically clean up stale entries from all stores.
 * Call on an interval (e.g., every 5 minutes) to prevent unbounded memory growth.
 */
export function pruneRateLimitStores(): void {
  const now = Date.now();
  const maxAge = 5 * 60_000; // keep entries for 5 minutes past their window
  for (const store of stores.values()) {
    for (const [ip, entry] of store) {
      if (now - entry.windowStart >= maxAge) {
        store.delete(ip);
      }
    }
  }
}
