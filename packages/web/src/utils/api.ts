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
