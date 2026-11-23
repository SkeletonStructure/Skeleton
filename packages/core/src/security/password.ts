import { type Algorithm, hash, parseOptions, verify } from '@node-rs/argon2';

/**
 * `@node-rs/argon2` declares `Algorithm` as an ambient const enum. With the
 * project's verbatim module syntax it cannot be imported as a value, so this
 * is the documented Argon2id discriminant from that library.
 */
const ARGON2ID_ALGORITHM = 2 as Algorithm;

export interface PasswordHashPolicy {
  readonly algorithm: 'argon2id';
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
  readonly outputLen: number;
}

/** OWASP-style Argon2id baseline, kept explicit so reviews can compare parameters. */
export const DEFAULT_PASSWORD_HASH_POLICY: PasswordHashPolicy = {
  algorithm: 'argon2id',
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(
  password: string,
  policy: PasswordHashPolicy = DEFAULT_PASSWORD_HASH_POLICY,
): Promise<string> {
  return hash(password, {
    algorithm: ARGON2ID_ALGORITHM,
    memoryCost: policy.memoryCost,
    timeCost: policy.timeCost,
    parallelism: policy.parallelism,
    outputLen: policy.outputLen,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(
  passwordHash: string,
  policy: PasswordHashPolicy = DEFAULT_PASSWORD_HASH_POLICY,
): boolean {
  try {
    const parsed = parseOptions(passwordHash);
    return (
      parsed.algorithm !== ARGON2ID_ALGORITHM ||
      parsed.memoryCost !== policy.memoryCost ||
      parsed.timeCost !== policy.timeCost ||
      parsed.parallelism !== policy.parallelism ||
      parsed.outputLen !== policy.outputLen
    );
  } catch {
    return true;
  }
}
