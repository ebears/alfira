// ---------------------------------------------------------------------------
// Fetch client for API calls
//
// Uses relative URLs. In development, Bun's dev server proxies /api and /auth
// to the API server on :3001. In production, configure a reverse proxy
// (Caddy, etc.) to do the same thing.
//
// credentials: 'include' is set globally so the HttpOnly session cookie is
// sent on every request automatically.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Token refresh state
//
// We need to prevent multiple concurrent refresh attempts. If multiple
// requests fail with 401 at the same time, we want them to all wait for
// the same refresh promise rather than triggering multiple refresh calls.
// ---------------------------------------------------------------------------
let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];

// Separate flag so trySilentRefresh doesn't interfere with wrappedFetch's refresh
let isSilentRefreshing = false;

function processQueue(error: Error | null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
}

function redirectToLogin(reason: string): void {
  if (window.location.pathname !== '/login') {
    console.warn(`[auth] redirectToLogin: ${reason}`, new Error().stack);
    window.location.href = '/login';
  }
}

type RefreshResult = { ok: true } | { ok: false; retryable: boolean };

async function refreshToken(): Promise<RefreshResult> {
  try {
    const res = await fetchWithTimeout('/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) return { ok: true };
    // 503 = Discord temporarily unreachable, old token still valid → retryable.
    // 401 = token permanently invalid (expired / revoked).
    return { ok: false, retryable: res.status === 503 };
  } catch {
    // Network errors are retryable.
    return { ok: false, retryable: true };
  }
}

export async function trySilentRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // wrappedFetch is already doing a refresh — queue and wait for it
    console.warn('[auth] trySilentRefresh: already refreshing, queuing');
    return new Promise<boolean>((resolve, _reject) => {
      failedQueue.push({
        resolve: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }

  if (isSilentRefreshing) {
    console.warn('[auth] trySilentRefresh: already silent-refreshing, skipping');
    return false;
  }

  console.warn('[auth] trySilentRefresh: starting refresh attempt');
  isSilentRefreshing = true;
  // Set isRefreshing so wrappedFetch queues instead of starting concurrent refresh
  isRefreshing = true;

  // Retry up to 3 times total for transient failures (Discord 429/503, network).
  let result = await refreshToken();
  for (let attempt = 0; attempt < 2 && !result.ok && result.retryable; attempt++) {
    console.warn(
      `[auth] trySilentRefresh: retry ${attempt + 1}/2 after ${result.ok ? 'success' : 'retryable failure'}`
    );
    await new Promise((r) => setTimeout(r, 1500));
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

// Custom error class to carry API error details
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

async function wrappedFetch(
  url: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<unknown> {
  const makeRequest = (): Promise<Response> =>
    fetchWithTimeout(url, { ...options, credentials: 'include' });

  let response = await makeRequest();

  // Handle 401 with token refresh retry
  if (response.status === 401) {
    // Don't retry if this is already a refresh request
    if (url === '/auth/refresh') {
      redirectToLogin('/auth/refresh itself returned 401 — refresh token dead');
      throw new ApiError('Unauthorized', 401);
    }

    // Prevent infinite refresh loops — only retry once per call chain
    if (retryCount >= 1) {
      throw new ApiError('Unauthorized', 401);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve: resolve as () => void, reject });
      }).then(() => wrappedFetch(url, options, retryCount + 1));
    }

    // Start refreshing
    isRefreshing = true;
    console.warn(`[auth] wrappedFetch: starting refresh after 401 on ${url}`);

    const result = await refreshToken();

    if (result.ok) {
      // Refresh succeeded, process queue and retry
      processQueue(null);
      isRefreshing = false;
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

  if (!response.ok) {
    // Try to parse error body for code
    let errorMessage = `API error: ${response.status}`;
    let errorCode: string | undefined;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) {
        errorMessage = errorBody.error;
      }
      if (errorBody?.code) {
        errorCode = errorBody.code;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new ApiError(errorMessage, response.status, errorCode);
  }

  // 204 No Content has no body to parse
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// API client matching @alfira/server/shared/api interface
// ---------------------------------------------------------------------------
export const client = {
  async get<T>(url: string): Promise<{ data: T }> {
    const data = await wrappedFetch(url);
    return { data: data as T };
  },
  async post<T>(url: string, data?: unknown): Promise<{ data: T }> {
    const body = data !== undefined ? JSON.stringify(data) : undefined;
    const result = await wrappedFetch(url, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
    });
    return { data: result as T };
  },
  async patch<T>(url: string, data: unknown): Promise<{ data: T }> {
    const result = await wrappedFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { data: result as T };
  },
  async delete<T>(url: string): Promise<{ data: T }> {
    const response = await wrappedFetch(url, { method: 'DELETE' });
    // 204 No Content has no body to parse
    if (response === null) {
      return { data: undefined as T };
    }
    return { data: response as T };
  },
};
