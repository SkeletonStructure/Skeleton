import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PASSWORD_HASH_POLICY,
  hashPassword,
  hashToken,
  needsPasswordRehash,
  newCsrfToken,
  newSessionToken,
  timingSafeTokenEqual,
  verifyPassword,
} from '../../src/security/index.js';

describe('security utilities (unit)', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
    expect(needsPasswordRehash(hash)).toBe(false);
  });

  it('detects hashes created under different Argon2id parameters', async () => {
    const hash = await hashPassword('correct horse battery staple', {
      ...DEFAULT_PASSWORD_HASH_POLICY,
      memoryCost: 8192,
    });

    expect(needsPasswordRehash(hash)).toBe(true);
  });

  it('returns false for malformed password hashes', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(needsPasswordRehash('not-a-hash')).toBe(true);
  });

  it('creates independent 32-byte opaque tokens and stores only hashes', () => {
    const first = newSessionToken();
    const second = newSessionToken();
    const csrf = newCsrfToken();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64url').byteLength).toBe(32);
    expect(Buffer.from(csrf, 'base64url').byteLength).toBe(32);
    expect(hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(first)).not.toBe(first);
  });

  it('compares tokens in constant time without length leaks', () => {
    expect(timingSafeTokenEqual('abc', 'abc')).toBe(true);
    expect(timingSafeTokenEqual('abc', 'abd')).toBe(false);
    expect(timingSafeTokenEqual('abc', 'a-much-longer-token')).toBe(false);
  });
});
