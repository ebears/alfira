import { ApiError } from '../api/eden';

/** The `{ status, value }` error shape returned by Eden's Treaty client. */
export interface TreatyError {
  status: unknown;
  value: unknown;
}

/**
 * Convert a Treaty error into an `ApiError`.
 *
 * HTTP error responses carry the server's `{ error, code }` body in `value`.
 * When the fetcher throws (network failure, timeout, or our own `ApiError`
 * from the 401-refresh flow), Eden wraps the thrown error with a synthetic
 * 503 — detect that and surface a human-readable message instead of
 * "API error: 503".
 */
export function apiErrorFromTreatyError(error: TreatyError): ApiError {
  const { status, value } = error;

  // Thrown by our own fetcher (401-refresh paths) — keep its message and status.
  if (value instanceof ApiError) {
    return value;
  }

  // Network failure or timeout: the fetcher threw and Eden wrapped it.
  if (value instanceof Error) {
    return new ApiError(
      value.name === 'AbortError' ? 'Request timed out.' : "Couldn't reach the server.",
      Number(status) || 503
    );
  }

  const body = (typeof value === 'object' && value !== null ? value : {}) as {
    error?: string;
    code?: string;
  };
  return new ApiError(body.error ?? `API error: ${String(status)}`, Number(status) || 0, body.code);
}

/** Extract error message from a Fetch-based API error, with a fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

/** True when the error is a 429 rate limit response — the cooldown UI handles these. */
export function isRateLimitError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429;
}

type NotifyFn = (message: string, type: 'success' | 'error', duration?: number) => void;

/**
 * Show an error notification for an API error, unless it's a 429 rate limit.
 * Rate limit errors are handled visually by the cooldown UI, so we suppress
 * duplicate toast messages for them.
 */
export function notifyUnlessRateLimit(
  err: unknown,
  fallback: string,
  notify: NotifyFn,
  duration = 5000
): void {
  if (!isRateLimitError(err)) {
    notify(apiErrorMessage(err, fallback), 'error', duration);
  }
}
