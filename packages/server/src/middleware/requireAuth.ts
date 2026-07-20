import { verify } from '../lib/jwt';
import { type User } from '../shared';

/**
 * Verifies a JWT session token and returns the decoded payload.
 * Returns null if JWT_SECRET is not set or the token is invalid.
 */
export function verifySessionToken(token: string): User | null {
  const { JWT_SECRET } = process.env;
  if (!JWT_SECRET) {
    return null;
  }

  return verify<User>(token, JWT_SECRET);
}
