import { describe, expect, mock, test } from 'bun:test';

// api.ts imports ApiError from ../api/eden, which imports updateRateLimit
// from ../hooks/useRateLimit. Mock the hook to avoid pulling in React.
void mock.module('../hooks/useRateLimit', () => ({
  updateRateLimit: mock(() => {}),
}));

const { apiErrorFromTreatyError, apiErrorMessage, isRateLimitError, notifyUnlessRateLimit } =
  await import('./api');
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

describe('apiErrorFromTreatyError', () => {
  test('maps a network failure to a friendly message', () => {
    const err = apiErrorFromTreatyError({ status: 503, value: new Error('fetch failed') });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Couldn't reach the server.");
    expect(err.status).toBe(503);
  });

  test('maps an aborted request to a timeout message', () => {
    const err = apiErrorFromTreatyError({
      status: 503,
      value: new DOMException('This operation was aborted.', 'AbortError'),
    });
    expect(err.message).toBe('Request timed out.');
    expect(err.status).toBe(503);
  });

  test('preserves an ApiError thrown by the fetcher', () => {
    const original = new ApiError('Authentication temporarily unavailable. Please try again.', 503);
    const err = apiErrorFromTreatyError({ status: 503, value: original });
    expect(err).toBe(original);
  });

  test('extracts the server error message and code from the response body', () => {
    const err = apiErrorFromTreatyError({
      status: 409,
      value: { error: 'This song is already in the playlist.', code: 'DUPLICATE' },
    });
    expect(err.message).toBe('This song is already in the playlist.');
    expect(err.status).toBe(409);
    expect(err.code).toBe('DUPLICATE');
  });

  test('falls back to a status-based message for non-JSON bodies', () => {
    const err = apiErrorFromTreatyError({ status: 502, value: '<html>Bad Gateway</html>' });
    expect(err.message).toBe('API error: 502');
    expect(err.status).toBe(502);
  });

  test('falls back to a status-based message when value is null', () => {
    const err = apiErrorFromTreatyError({ status: 404, value: null });
    expect(err.message).toBe('API error: 404');
    expect(err.status).toBe(404);
  });

  test('coerces a missing status to 0', () => {
    const err = apiErrorFromTreatyError({ status: undefined, value: { error: 'Nope' } });
    expect(err.message).toBe('Nope');
    expect(err.status).toBe(0);
  });
});
