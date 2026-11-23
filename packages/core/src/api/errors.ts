export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ValidationDetail {
  readonly path: string;
  readonly message: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly details?: readonly ValidationDetail[];
    readonly requestId: string;
  };
}

export interface MappedError {
  readonly statusCode: number;
  readonly body: ApiErrorBody;
}

const STATUS_TO_CODE: Readonly<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

const SAFE_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  VALIDATION_ERROR: 'Request validation failed.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'Permission denied.',
  NOT_FOUND: 'Resource not found.',
  CONFLICT: 'The request conflicts with current state.',
  IDEMPOTENCY_CONFLICT: 'The idempotency key was reused with a different payload.',
  RATE_LIMITED: 'Too many requests.',
  INTERNAL: 'An unexpected error occurred.',
};

export interface ApiErrorOptions {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Safe, caller-facing message. Defaults to the stable message for the code. */
  readonly message?: string;
  readonly details?: readonly ValidationDetail[];
  readonly cause?: unknown;
}

/** Base application error whose fields are safe to map into an HTTP response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly publicMessage?: string;
  readonly details?: readonly ValidationDetail[];

  constructor(options: ApiErrorOptions) {
    const message = options.message ?? SAFE_MESSAGES[options.code];
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    if (options.message !== undefined) this.publicMessage = message;
    if (options.details !== undefined) this.details = options.details;
  }
}

/** Explicit HTTP-facing application error. */
export class HttpError extends ApiError {
  constructor(options: ApiErrorOptions) {
    super(options);
    this.name = 'HttpError';
  }
}

export function validationError(details: readonly ValidationDetail[]): HttpError {
  return new HttpError({ status: 400, code: 'VALIDATION_ERROR', details });
}

interface ValidationIssueLike {
  readonly instancePath?: unknown;
  readonly dataPath?: unknown;
  readonly message?: unknown;
  readonly params?: { readonly missingProperty?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function detailPath(issue: ValidationIssueLike): string {
  const raw = firstString(issue.instancePath, issue.dataPath) ?? '';
  const segments = raw
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('.')
    .replace(/^body\./, '')
    .replace(/^params\./, '')
    .replace(/^querystring\./, 'query.');
  if (segments.length > 0) return segments;

  const missing = firstString(issue.params?.missingProperty);
  return missing ?? 'request';
}

function validationDetails(
  error: Record<string, unknown>,
): readonly ValidationDetail[] | undefined {
  const issues = error.validation;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;

  return issues.slice(0, 20).map((issue) => {
    const record: ValidationIssueLike = isRecord(issue) ? issue : {};
    const message = (firstString(record.message) ?? 'Invalid value.').slice(0, 200);
    return { path: detailPath(record), message };
  });
}

function errorBody(
  code: ApiErrorCode,
  requestId: string,
  details?: readonly ValidationDetail[],
  message?: string,
): ApiErrorBody {
  return {
    error: {
      code,
      message: message ?? SAFE_MESSAGES[code],
      ...(details === undefined ? {} : { details }),
      requestId,
    },
  };
}

/** Stable, secret-free mapping from any thrown value to the public error envelope. */
export function mapRequestError(error: unknown, requestId: string): MappedError {
  if (error instanceof ApiError) {
    return {
      statusCode: error.status,
      body: errorBody(error.code, requestId, error.details, error.publicMessage),
    };
  }

  if (!isRecord(error)) {
    return { statusCode: 500, body: errorBody('INTERNAL', requestId) };
  }

  const statusValue = error.statusCode ?? error.status;
  const status = typeof statusValue === 'number' ? statusValue : 500;
  const details = validationDetails(error);

  if (details !== undefined) {
    return { statusCode: 400, body: errorBody('VALIDATION_ERROR', requestId, details) };
  }

  const code = STATUS_TO_CODE[status];
  if (code !== undefined) {
    return { statusCode: status, body: errorBody(code, requestId) };
  }

  return { statusCode: 500, body: errorBody('INTERNAL', requestId) };
}
