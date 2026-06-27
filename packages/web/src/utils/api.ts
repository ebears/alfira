import { ApiError } from '../api/client';

/** Extract error message from a Fetch-based API error, with a fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}

/** Extract error code from API error response, if available. */
export function apiErrorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    return err.code;
  }
  return undefined;
}

/** Extract HTTP status from API error response, if available. */
export function apiErrorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) {
    return err.status;
  }
  return undefined;
}
