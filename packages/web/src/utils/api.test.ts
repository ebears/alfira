import { describe, expect, mock, test } from 'bun:test';

// api.ts imports ApiError from ../api/eden, which imports updateRateLimit
// from ../hooks/useRateLimit. Mock the hook to avoid pulling in React.
void mock.module('../hooks/useRateLimit', () => ({
  updateRateLimit: mock(() => {}),
}));

const { apiErrorMessage, isRateLimitError, notifyUnlessRateLimit } = await import('./api');
const { ApiError } = await import('../api/eden');

describe('apiErrorMessage', () => {
  test('returns the message from an ApiError', () => {
    const err = new ApiError('Something went wrong', 400);
    expect(apiErrorMessage(err, 'fallback')).toBe('Something went wrong');
  });

  test('returns the message from a regular Error', () => {
    const err = new Error('Standard error');
    expect(apiErrorMessage(err, 'fallback')).toBe('Standard error');
  });

  test('returns fallback for a string thrown', () => {
    expect(apiErrorMessage('string error', 'fallback')).toBe('fallback');
  });

  test('returns fallback for null', () => {
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback');
  });

  test('returns fallback for undefined', () => {
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  test('returns fallback for an object without message property', () => {
    expect(apiErrorMessage({ code: 500 }, 'fallback')).toBe('fallback');
  });

  test('returns the message from ApiError even when fallback differs', () => {
    const err = new ApiError('Real error', 500);
    expect(apiErrorMessage(err, 'different fallback')).toBe('Real error');
  });
});

describe('isRateLimitError', () => {
  test('returns true for ApiError with status 429', () => {
    const err = new ApiError('Too many requests', 429);
    expect(isRateLimitError(err)).toBe(true);
  });

  test('returns false for ApiError with status 400', () => {
    const err = new ApiError('Bad request', 400);
    expect(isRateLimitError(err)).toBe(false);
  });

  test('returns false for ApiError with status 500', () => {
    const err = new ApiError('Server error', 500);
    expect(isRateLimitError(err)).toBe(false);
  });

  test('returns false for regular Error', () => {
    expect(isRateLimitError(new Error('Something broke'))).toBe(false);
  });

  test('returns false for a plain object', () => {
    expect(isRateLimitError({ status: 429, message: 'Too many' })).toBe(false);
  });

  test('returns false for null', () => {
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe('notifyUnlessRateLimit', () => {
  test('calls notify for a non-rate-limit ApiError', () => {
    const notify = mock(() => {});
    const err = new ApiError('Bad request', 400);
    notifyUnlessRateLimit(err, 'fallback', notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Bad request', 'error', 5000);
  });

  test('calls notify for a regular Error with its message', () => {
    const notify = mock(() => {});
    const err = new Error('Standard error');
    notifyUnlessRateLimit(err, 'fallback', notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Standard error', 'error', 5000);
  });

  test('calls notify for a non-Error value with fallback message', () => {
    const notify = mock(() => {});
    notifyUnlessRateLimit('string error', 'Something went wrong', notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Something went wrong', 'error', 5000);
  });

  test('does NOT call notify for a rate limit error (429)', () => {
    const notify = mock(() => {});
    const err = new ApiError('Too many requests', 429);
    notifyUnlessRateLimit(err, 'fallback', notify);
    expect(notify).toHaveBeenCalledTimes(0);
  });

  test('passes custom duration through to notify', () => {
    const notify = mock(() => {});
    const err = new ApiError('Bad request', 400);
    notifyUnlessRateLimit(err, 'fallback', notify, 10_000);
    expect(notify).toHaveBeenCalledWith('Bad request', 'error', 10_000);
  });

  test('uses default duration of 5000 when not specified', () => {
    const notify = mock(() => {});
    const err = new ApiError('Bad request', 400);
    notifyUnlessRateLimit(err, 'fallback', notify);
    const callArgs = notify.mock.calls[0] as unknown as [string, string, number];
    expect(callArgs[2]).toBe(5000);
  });
});
