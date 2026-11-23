export const SDK_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type SdkErrorCode = (typeof SDK_ERROR_CODES)[number];

export interface SdkValidationDetail {
  readonly path: string;
  readonly message: string;
}

export interface SkeletonErrorOptions {
  readonly code: SdkErrorCode;
  readonly status: number;
  readonly message: string;
  readonly requestId: string;
  readonly details?: readonly SdkValidationDetail[];
}

export class SkeletonError extends Error {
  readonly code: SdkErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly details?: readonly SdkValidationDetail[];

  constructor(options: SkeletonErrorOptions) {
    super(options.message);
    this.name = 'SkeletonError';
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    if (options.details !== undefined) this.details = options.details;
  }
}

export class ValidationError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'ConflictError';
  }
}

export class IdempotencyError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'IdempotencyError';
  }
}

export class RateLimitError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'RateLimitError';
  }
}

export class InternalError extends SkeletonError {
  constructor(options: SkeletonErrorOptions) {
    super(options);
    this.name = 'InternalError';
  }
}

const SAFE_MESSAGES: Readonly<Record<SdkErrorCode, string>> = {
  VALIDATION_ERROR: 'Request validation failed.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'Permission denied.',
  NOT_FOUND: 'Resource not found.',
  CONFLICT: 'The request conflicts with current state.',
  IDEMPOTENCY_CONFLICT: 'The idempotency key was reused with a different payload.',
  RATE_LIMITED: 'Too many requests.',
  INTERNAL: 'An unexpected error occurred.',
};

const STATUS_CODES: Readonly<Record<number, SdkErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

export const UNKNOWN_REQUEST_ID = 'unknown';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSdkErrorCode(value: unknown): value is SdkErrorCode {
  return typeof value === 'string' && (SDK_ERROR_CODES as readonly string[]).includes(value);
}

function sanitizeText(value: unknown, fallback: string, maxLength = 200): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, maxLength) : fallback;
}

function sanitizeDetails(value: unknown): readonly SdkValidationDetail[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const details: SdkValidationDetail[] = [];
  for (const item of value.slice(0, 20)) {
    if (!isRecord(item)) continue;
    const path = sanitizeText(item.path, '', 100);
    const message = sanitizeText(item.message, '', 200);
    if (path.length > 0 && message.length > 0) details.push({ path, message });
  }
  return details.length > 0 ? details : undefined;
}

function createError(options: SkeletonErrorOptions): SkeletonError {
  switch (options.code) {
    case 'VALIDATION_ERROR':
      return new ValidationError(options);
    case 'UNAUTHENTICATED':
      return new AuthenticationError(options);
    case 'FORBIDDEN':
      return new AuthorizationError(options);
    case 'NOT_FOUND':
      return new NotFoundError(options);
    case 'CONFLICT':
      return new ConflictError(options);
    case 'IDEMPOTENCY_CONFLICT':
      return new IdempotencyError(options);
    case 'RATE_LIMITED':
      return new RateLimitError(options);
    case 'INTERNAL':
      return new InternalError(options);
  }
}

export function errorFromResponse(
  status: number,
  payload: unknown,
  headerRequestId: unknown,
): SkeletonError {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const code = isSdkErrorCode(error.code) ? error.code : (STATUS_CODES[status] ?? 'INTERNAL');
  const requestId = sanitizeText(
    error.requestId,
    sanitizeText(headerRequestId, UNKNOWN_REQUEST_ID, 100),
    100,
  );
  const details = sanitizeDetails(error.details);
  return createError({
    code,
    status,
    message: SAFE_MESSAGES[code],
    requestId,
    ...(details === undefined ? {} : { details }),
  });
}

export function malformedResponseError(status: number, headerRequestId: unknown): SkeletonError {
  return createError({
    code: 'INTERNAL',
    status,
    message: 'Malformed API response.',
    requestId: sanitizeText(headerRequestId, UNKNOWN_REQUEST_ID, 100),
  });
}

export function networkError(): SkeletonError {
  return createError({
    code: 'INTERNAL',
    status: 0,
    message: 'Network request failed.',
    requestId: UNKNOWN_REQUEST_ID,
  });
}
