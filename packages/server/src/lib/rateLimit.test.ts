import { describe, expect, test } from 'bun:test';

import { checkRateLimit, getClientIp, pruneRateLimitStores } from './rateLimit';

// ---------------------------------------------------------------------------
// getClientIp
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  test('returns x-forwarded-for when present', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  test('returns x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('http://localhost/test', {
      headers: { 'x-real-ip': '10.0.0.3' },
    });
    expect(getClientIp(req)).toBe('10.0.0.3');
  });

  test('x-forwarded-for takes priority over x-real-ip', () => {
    const req = new Request('http://localhost/test', {
      headers: {
        'x-forwarded-for': '10.0.0.1',
        'x-real-ip': '10.0.0.3',
      },
    });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  test('returns "unknown" when no headers are present', () => {
    const req = new Request('http://localhost/test');
    expect(getClientIp(req)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  test('first request from an IP is always allowed', () => {
    const result = checkRateLimit('test-bucket', '10.0.0.1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  test('tracks remaining count correctly', () => {
    const ip = '10.0.0.2';
    const maxRequests = 3;

    // Request 1
    const r1 = checkRateLimit('test-count', ip, { maxRequests });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    // Request 2
    const r2 = checkRateLimit('test-count', ip, { maxRequests });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    // Request 3
    const r3 = checkRateLimit('test-count', ip, { maxRequests });
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // Request 4 — blocked
    const r4 = checkRateLimit('test-count', ip, { maxRequests });
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  test('different IPs get independent counters', () => {
    const maxRequests = 2;

    const ip1r1 = checkRateLimit('test-ips', '10.0.0.1', { maxRequests });
    const ip2r1 = checkRateLimit('test-ips', '10.0.0.2', { maxRequests });
    expect(ip1r1.allowed).toBe(true);
    expect(ip2r1.allowed).toBe(true);

    // Exhaust ip1
    checkRateLimit('test-ips', '10.0.0.1', { maxRequests });

    // ip2 should still have remaining
    const ip2r2 = checkRateLimit('test-ips', '10.0.0.2', { maxRequests });
    expect(ip2r2.allowed).toBe(true);
  });

  test('different buckets are independent', () => {
    const ip = '10.0.0.5';
    const maxRequests = 1;

    const bucketAR1 = checkRateLimit('bucket-a', ip, { maxRequests });
    const bucketBR1 = checkRateLimit('bucket-b', ip, { maxRequests });
    expect(bucketAR1.allowed).toBe(true);
    expect(bucketBR1.allowed).toBe(true);

    // Exhaust bucket A
    const bucketAR2 = checkRateLimit('bucket-a', ip, { maxRequests });
    expect(bucketAR2.allowed).toBe(false);

    // Bucket B should still be allowed
    const bucketBR2 = checkRateLimit('bucket-b', ip, { maxRequests });
    expect(bucketBR2.allowed).toBe(false); // because maxRequests=1, B is also exhausted
  });

  test('returns limit and resetAt in result', () => {
    const result = checkRateLimit('test-meta', '10.0.0.3', {
      windowMs: 30_000,
      maxRequests: 5,
    });
    expect(result.limit).toBe(5);
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  test('uses default config when no override provided', () => {
    const result = checkRateLimit('test-default', '10.0.0.4');
    expect(result.limit).toBe(60); // DEFAULT_CONFIG.maxRequests
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pruneRateLimitStores
// ---------------------------------------------------------------------------

describe('pruneRateLimitStores', () => {
  test('does not throw on empty stores', () => {
    expect(() => {
      pruneRateLimitStores();
    }).not.toThrow();
  });

  test('keeps recent entries', () => {
    const ip = '10.0.0.99';
    checkRateLimit('prune-test', ip, { maxRequests: 10 });
    pruneRateLimitStores();
    // The entry should still exist — a subsequent request should show remaining < max
    const r2 = checkRateLimit('prune-test', ip, { maxRequests: 10 });
    expect(r2.remaining).toBe(8); // 10 - 2 requests
  });
});
