import { ApiError } from '../api/client';

/** Extract error message from a Fetch-based API error, with a fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}
