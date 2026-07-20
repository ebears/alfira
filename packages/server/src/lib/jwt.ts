/**
 * Minimal JWT implementation using Bun.CryptoHasher for HMAC-SHA256 (HS256).
 * Replaces the `jsonwebtoken` npm package.
 *
 * Only supports HS256 — the only algorithm this project uses.
 */

import { timingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();

// Standard JWT header for HS256
const JWT_HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; // base64url({"alg":"HS256","typ":"JWT"})

/** Encode a string as base64url (RFC 7515). */
function base64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a base64url string. */
function base64urlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/** Parse an expiresIn string like "1h", "30d", "15m" to seconds. */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid expiresIn format: ${expiresIn}`);
  }
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return num * (multipliers[unit] ?? 1);
}

/** Compute HMAC-SHA256 and return the result as a base64url string. */
function hmacSha256Base64url(key: string, data: string): string {
  const hasher = new Bun.CryptoHasher('sha256', key);
  hasher.update(data);
  // digest('base64') returns standard base64; convert to base64url
  return hasher.digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign a payload and return a JWT string.
 *
 * The payload must be a plain object (no functions, no circular refs).
 * iat and exp are added automatically.
 */
export function sign(
  payload: Record<string, unknown>,
  secret: string,
  options: { expiresIn: string }
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiresIn(options.expiresIn);

  const payloadWithClaims = {
    ...payload,
    iat: now,
    exp,
  };

  const data = `${JWT_HEADER}.${base64url(JSON.stringify(payloadWithClaims))}`;
  const signature = hmacSha256Base64url(secret, data);

  return `${data}.${signature}`;
}

/**
 * Verify a JWT token and return the decoded payload.
 * Returns null if the token is invalid, expired, or has a bad signature.
 */
export function verify<T = Record<string, unknown>>(token: string, secret: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const headerB64 = parts[0];
  const payloadB64 = parts[1];
  const signatureB64 = parts[2];

  // Verify the signature using constant-time comparison
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = hmacSha256Base64url(secret, data);
  const sigBytes = encoder.encode(signatureB64);
  const expectedBytes = encoder.encode(expectedSig);
  if (sigBytes.length !== expectedBytes.length || !timingSafeEqual(sigBytes, expectedBytes)) {
    return null;
  }

  // Decode and parse the payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64)) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Check expiration
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload as T;
}
