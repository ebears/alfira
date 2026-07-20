import { ApiError } from '../api/client';

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
