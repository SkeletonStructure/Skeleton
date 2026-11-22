export const DATABASE_ERROR_CODES = [
  'DATABASE_NOT_INITIALIZED',
  'DATABASE_ALREADY_INITIALIZED',
  'DATABASE_INITIALIZATION_FAILED',
  'DATABASE_UNAVAILABLE',
  'DATABASE_MIGRATION_FAILED',
  'DATABASE_SHUTDOWN_FAILED',
] as const;

export type DatabaseErrorCode = (typeof DATABASE_ERROR_CODES)[number];

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseError';
    this.code = code;
  }
}
