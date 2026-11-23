import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_TOKEN_BYTES = 32;
export const CSRF_TOKEN_BYTES = 32;

/** Returns a URL-safe opaque token. The plaintext is never persisted by auth. */
export function newOpaqueToken(bytes: number = SESSION_TOKEN_BYTES): string {
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new RangeError('Opaque tokens must use at least 16 random bytes.');
  }
  return randomBytes(bytes).toString('base64url');
}

export function newSessionToken(): string {
  return newOpaqueToken(SESSION_TOKEN_BYTES);
}

export function newCsrfToken(): string {
  return newOpaqueToken(CSRF_TOKEN_BYTES);
}

/** SHA-256 is required by the approved session design; tokens are hashed at rest. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Length-independent comparison via equalized hashes. */
export function timingSafeTokenEqual(expected: string, actual: string): boolean {
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  const actualHash = createHash('sha256').update(actual, 'utf8').digest();
  return timingSafeEqual(expectedHash, actualHash);
}
