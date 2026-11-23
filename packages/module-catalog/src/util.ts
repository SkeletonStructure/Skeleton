import { randomUUID } from 'node:crypto';

import { validationError } from '@skeletonstructure/core/api';

export function newPrefixedId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

interface CursorPosition {
  readonly createdAt: string;
  readonly id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  const position: CursorPosition = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): CursorPosition | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { createdAt?: unknown }).createdAt === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      const createdAt = (parsed as { createdAt: string }).createdAt;
      if (Number.isNaN(Date.parse(createdAt))) throw new Error('invalid date');
      return { createdAt, id: (parsed as { id: string }).id };
    }
  } catch {
    // Reported as a client validation error below.
  }
  throw validationError([{ path: 'query.cursor', message: 'Invalid pagination cursor.' }]);
}

export function parseLimit(value: unknown, fallback = 20, maximum = 100): number {
  if (value === undefined) return fallback;
  const raw = typeof value === 'string' ? value : '';
  if (!/^\d+$/.test(raw)) {
    throw validationError([{ path: 'query.limit', message: 'Limit must be a positive integer.' }]);
  }
  const limit = Number(raw);
  if (limit < 1 || limit > maximum) {
    throw validationError([
      { path: 'query.limit', message: `Limit must be between 1 and ${maximum}.` },
    ]);
  }
  return limit;
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const record = current as { code?: unknown; cause?: unknown };
    if (record.code === '23505') return true;
    current = record.cause;
  }
  return false;
}
