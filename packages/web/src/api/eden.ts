// ---------------------------------------------------------------------------
// Eden Treaty client with custom fetcher
//
// Uses relative URLs. In development, Bun's dev server proxies /api and /auth
// to the API server on :3001. In production, configure a reverse proxy
// (Caddy, etc.) to do the same thing.
//
// The custom fetcher handles:
// - credentials: 'include' (HttpOnly session cookie)
// - 10-second timeout
// - Token refresh on 401 with concurrent request queuing
// - Rate limit header extraction
// ---------------------------------------------------------------------------

import { type App } from '@alfira/server/shared';
import { treaty } from '@elysia/eden';

import { updateRateLimit } from '../hooks/useRateLimit';

const TIMEOUT_MS = 10_000;

// Map URL path prefixes to server-side rate limit bucket names.
const RATE_LIMIT_BUCKETS: [prefix: string, bucket: string][] = [
  ['/api/player', 'player-mutations'],
  ['/api/songs', 'songs-mutations'],
  ['/api/playlists', 'playlists-mutations'],
];

function extractRateLimit(url: string, headers: Headers): void {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  if (limit === null || remaining === null || reset === null) {
    return;
  }

  const bucket = RATE_LIMIT_BUCKETS.find(([prefix]) => url.startsWith(prefix))?.[1];
  if (!bucket) {
    return;
  }

  updateRateLimit(bucket, Number(limit), Number(remaining), Number(reset));
}

// ---------------------------------------------------------------------------
// Token refresh state
//
// We need to prevent multiple concurrent refresh attempts. If multiple
// requests fail with 401 at the same time, we want them to all wait for
// the same refresh promise rather than triggering multiple refresh calls.
// ---------------------------------------------------------------------------
let isRefreshing = false;
let failedQueue: {
  resolve: () => void;
  reject: (error: unknown) => void;
}[] = [];

// Separate flag so trySilentRefresh doesn't interfere with the fetcher's refresh
let isSilentRefreshing = false;

function processQueue(error: Error | null): void {
  for (const prom of failedQueue) {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  }
  failedQueue = [];
}

function redirectToLogin(reason: string): void {
  if (window.location.pathname !== '/login') {
    console.warn(`[auth] redirectToLogin: ${reason}`, new Error('redirect to login').stack);
    window.location.href = '/login';
  }
}

type RefreshResult = { ok: true } | { ok: false; retryable: boolean };

async function refreshToken(): Promise<RefreshResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    try {
      const res = await globalThis.fetch('/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        return { ok: true };
      }
      // 503 = Discord temporarily unreachable, old token still valid → retryable.
      // 401 = token permanently invalid (expired / revoked).
      return { ok: false, retryable: res.status === 503 };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Network errors are retryable.
    return { ok: false, retryable: true };
  }
}

export async function trySilentRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // fetcher is already doing a refresh — queue and wait for it
    console.warn('[auth] trySilentRefresh: already refreshing, queuing');
    return new Promise<boolean>((resolve, _reject) => {
      failedQueue.push({
        resolve: () => {
          resolve(true);
        },
        reject: () => {
          resolve(false);
        },
      });
    });
  }

  if (isSilentRefreshing) {
    console.warn('[auth] trySilentRefresh: already silent-refreshing, skipping');
    return false;
  }

  console.warn('[auth] trySilentRefresh: starting refresh attempt');
  isSilentRefreshing = true;
  // Set isRefreshing so the fetcher queues instead of starting concurrent refresh
  isRefreshing = true;

  // Retry up to 3 times total for transient failures (Discord 429/503, network).
  let result = await refreshToken();
  for (let attempt = 0; attempt < 2 && !result.ok && result.retryable; attempt++) {
    console.warn(`[auth] trySilentRefresh: retry ${attempt + 1}/2 after retryable failure`);
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    result = await refreshToken();
  }

  if (result.ok) {
    console.warn('[auth] trySilentRefresh: succeeded');
    processQueue(null);
  } else {
    console.warn(
      `[auth] trySilentRefresh: failed after retries (ok=${result.ok}, retryable=${result.retryable})`
    );
    processQueue(new Error('Token refresh failed'));
  }
  isRefreshing = false;
  isSilentRefreshing = false;
  return result.ok;
}

// ---------------------------------------------------------------------------
// Custom error class to carry API error details
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Custom fetcher for Eden
//
// Eden calls this for every request. We handle auth refresh, timeout,
// credentials, and rate limit extraction, then return the raw Response
// for Eden to parse.
// ---------------------------------------------------------------------------
async function fetcher(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  const makeRequest = (): Promise<Response> =>
    globalThis.fetch(url, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    });

  let retried = false;

  try {
    let response = await makeRequest();

    // Handle 401 with token refresh retry
    if (response.status === 401) {
      // Don't retry if this is already a refresh request
      if (url.endsWith('/auth/refresh')) {
        redirectToLogin('/auth/refresh itself returned 401 — refresh token dead');
        throw new ApiError('Unauthorized', 401);
      }

      // Prevent infinite refresh loops — only retry once per call
      if (retried) {
        throw new ApiError('Unauthorized', 401);
      }

      // If already refreshing, queue this request
      if (isRefreshing) {
        await new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        retried = true;
        response = await makeRequest();
      } else {
        // Start refreshing
        isRefreshing = true;
        console.warn(`[auth] fetcher: starting refresh after 401 on ${url}`);

        const result = await refreshToken();

        if (result.ok) {
          // Refresh succeeded, process queue and retry
          processQueue(null);
          isRefreshing = false;
          retried = true;
          response = await makeRequest();
        } else if (result.retryable) {
          // Discord temporarily unreachable — reject queue gently, don't redirect.
          // The next API request will trigger another refresh attempt.
          processQueue(new Error('Token refresh deferred'));
          isRefreshing = false;
          throw new ApiError('Authentication temporarily unavailable. Please try again.', 503);
        } else {
          // Refresh failed permanently, reject queue and redirect
          processQueue(new Error('Token refresh failed'));
          isRefreshing = false;
          redirectToLogin('refreshToken() returned non-retryable failure');
          throw new ApiError('Unauthorized', 401);
        }
      }
    }

    // Extract rate limit info from headers before returning.
    extractRateLimit(url, response.headers);

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Eden Treaty client
//
// Empty domain + keepDomain: true means Eden constructs relative URLs
// (api/player/queue, auth/me, etc.) and our custom fetcher resolves them
// against the current origin.
// ---------------------------------------------------------------------------
export const api = treaty<App>('', {
  keepDomain: true,
  fetcher: fetcher as typeof fetch,
});
