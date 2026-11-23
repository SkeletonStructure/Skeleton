import type { FastifySchema } from 'fastify';

export interface SuccessEnvelope<T> {
  readonly data: T;
  readonly meta: { readonly requestId: string; readonly nextCursor?: string };
}

/** Generic cursor result that modules return when they need paginated metadata. */
export interface CursorPage<T> {
  readonly data: T;
  readonly nextCursor?: string;
}

export function pageResult<T>(data: T, nextCursor?: string): CursorPage<T> {
  return {
    data,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

export function isCursorPage(value: unknown): value is CursorPage<unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('data' in value)) {
    return false;
  }
  const nextCursor = (value as { nextCursor?: unknown }).nextCursor;
  return nextCursor === undefined || typeof nextCursor === 'string';
}

export function successEnvelope<T>(
  requestId: string,
  data: T,
  nextCursor?: string,
): SuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    },
  };
}

const metaSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId'],
  properties: {
    requestId: { type: 'string', minLength: 1 },
    nextCursor: { type: 'string', minLength: 1 },
  },
} as const;

export function successEnvelopeSchema(data: Record<string, unknown>): FastifySchema {
  return {
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: { data, meta: metaSchema },
      },
    },
  };
}

export const errorEnvelopeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string', minLength: 1 },
        details: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'message'],
            properties: {
              path: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

export const publicConfigDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['appName', 'apiBaseUrl', 'authMode', 'publicModules'],
  properties: {
    appName: { type: 'string', minLength: 1 },
    apiBaseUrl: { type: 'string', enum: ['/v1'] },
    authMode: { type: 'string', enum: ['session'] },
    publicModules: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const liveResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ok'] },
  },
} as const;

export const readyErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'reason', 'requestId'],
  properties: {
    status: { type: 'string', enum: ['error'] },
    reason: { type: 'string' },
    requestId: { type: 'string', minLength: 1 },
  },
} as const;
