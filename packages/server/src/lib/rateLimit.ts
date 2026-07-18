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

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number; // Unix ms timestamp when the window resets
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
 * Result of a rate limit check.
 */
export interface RateLimitResult extends RateLimitInfo {
  allowed: boolean;
}

/**
 * Check whether a request is within the rate limit for a given route group.
 *
 * Each call that passes increments the counter. Stale entries are pruned
 * automatically when they're found to be outside the current window.
 *
 * Always returns detailed info (remaining, limit, resetAt) so the caller
 * can attach standard X-RateLimit-* headers to the response.
 *
 * @param group  Identifier for the route group (e.g., 'player-mutations')
 * @param ip     Client IP address
 * @param config Optional override for window and max requests
 */
export function checkRateLimit(
  group: string,
  ip: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
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
    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  const resetAt = entry.windowStart + windowMs;

  // Within the current window but over the limit.
  if (entry.count >= maxRequests) {
    return { allowed: false, limit: maxRequests, remaining: 0, resetAt };
  }

  entry.count++;
  return { allowed: true, limit: maxRequests, remaining: maxRequests - entry.count, resetAt };
}

/**
 * Build standard X-RateLimit-* headers from a RateLimitResult.
 */
export function rateLimitHeaders(info: RateLimitInfo): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(info.remaining),
    'X-RateLimit-Reset': String(Math.ceil(info.resetAt / 1000)),
  };
}

/**
 * Build a 429 Response for rate-limited requests.
 * Includes Retry-After header, rate limit headers, and a JSON body
 * with retryAfterSeconds so the client can show a countdown.
 */
export function rateLimitResponse(info: RateLimitInfo): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil((info.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please slow down.',
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        ...rateLimitHeaders(info),
      },
    }
  );
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
