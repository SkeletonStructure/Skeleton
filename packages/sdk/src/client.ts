import type {
  AuthLoginPostBody,
  AuthLoginPostResponse,
  AuthLogoutPostResponse,
  AuthMeGetResponse,
  AuthPasswordResetConfirmPostBody,
  AuthPasswordResetConfirmPostResponse,
  AuthPasswordResetRequestPostBody,
  AuthPasswordResetRequestPostResponse,
  AuthRegisterPostBody,
  AuthRegisterPostResponse,
  ConfigPublicGetResponse,
  UsersMeGetResponse,
  UsersMePatchBody,
  UsersMePatchResponse,
} from '../generated/api.js';
import {
  errorFromResponse,
  malformedResponseError,
  networkError,
  SkeletonError,
} from './errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SkeletonClientOptions {
  readonly baseUrl?: string;
  readonly credentials?: 'include' | 'omit';
  readonly bearerToken?: () => string | undefined | Promise<string | undefined>;
  readonly csrfTokenHeader?: string;
  readonly fetch?: typeof fetch;
  readonly onError?: (error: SkeletonError) => void;
}

export interface ConfigClient {
  getPublic(): Promise<ConfigPublicGetResponse>;
}

export interface AuthClient {
  register(input: AuthRegisterPostBody): Promise<AuthRegisterPostResponse>;
  login(input: AuthLoginPostBody): Promise<AuthLoginPostResponse>;
  logout(): Promise<AuthLogoutPostResponse>;
  getCurrentUser(): Promise<AuthMeGetResponse>;
  requestPasswordReset(
    input: AuthPasswordResetRequestPostBody,
  ): Promise<AuthPasswordResetRequestPostResponse>;
  confirmPasswordReset(
    input: AuthPasswordResetConfirmPostBody,
  ): Promise<AuthPasswordResetConfirmPostResponse>;
}

export interface UsersClient {
  getMe(): Promise<UsersMeGetResponse>;
  updateMe(input: UsersMePatchBody): Promise<UsersMePatchResponse>;
}

export interface SkeletonClient {
  readonly config: ConfigClient;
  readonly auth: AuthClient;
  readonly users: UsersClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed === '/' ? '' : trimmed;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isEnvelope(
  value: unknown,
): value is { readonly data: unknown; readonly meta: { readonly requestId: string } } {
  return (
    isRecord(value) &&
    'data' in value &&
    isRecord(value.meta) &&
    typeof value.meta.requestId === 'string' &&
    value.meta.requestId.length > 0
  );
}

/** Creates a framework-neutral HTTP client for the public SkeletonStructure API. */
export function createSkeletonClient(options: SkeletonClientOptions = {}): SkeletonClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? '/v1');
  const credentials = options.credentials ?? 'include';
  const csrfHeader = options.csrfTokenHeader ?? 'x-csrf-token';
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const onError = options.onError;
  let csrfToken: string | undefined;

  function captureCsrf(payload: { readonly data: unknown }): void {
    if (!isRecord(payload.data)) return;
    const token = payload.data.csrfToken;
    if (typeof token === 'string' && token.length > 0) csrfToken = token;
  }

  async function request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ readonly data: unknown; readonly meta: { readonly requestId: string } }> {
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';

      const bearer = await options.bearerToken?.();
      if (bearer !== undefined && bearer.length > 0) {
        headers.authorization = `Bearer ${bearer}`;
      } else if (
        UNSAFE_METHODS.has(method) &&
        credentials === 'include' &&
        csrfToken !== undefined
      ) {
        headers[csrfHeader] = csrfToken;
      }

      const init: RequestInit = { method, headers, credentials };
      if (body !== undefined) init.body = JSON.stringify(body);

      const response = await fetchImpl(joinUrl(baseUrl, path), init);
      const payload = await readJson(response);
      const headerRequestId = response.headers.get('x-request-id');

      if (!response.ok) throw errorFromResponse(response.status, payload, headerRequestId);
      if (!isEnvelope(payload)) throw malformedResponseError(response.status, headerRequestId);

      captureCsrf(payload);
      return payload;
    } catch (error) {
      const sdkError = error instanceof SkeletonError ? error : networkError();
      try {
        onError?.(sdkError);
      } catch {
        // A logging hook must never mask the sanitized SDK error.
      }
      throw sdkError;
    }
  }

  return {
    config: {
      getPublic: async () => (await request('GET', '/config/public')) as ConfigPublicGetResponse,
    },
    auth: {
      register: async (input) =>
        (await request('POST', '/auth/register', { ...input })) as AuthRegisterPostResponse,
      login: async (input) =>
        (await request('POST', '/auth/login', { ...input })) as AuthLoginPostResponse,
      logout: async () => (await request('POST', '/auth/logout')) as AuthLogoutPostResponse,
      getCurrentUser: async () => (await request('GET', '/auth/me')) as AuthMeGetResponse,
      requestPasswordReset: async (input) =>
        (await request('POST', '/auth/password-reset/request', {
          ...input,
        })) as AuthPasswordResetRequestPostResponse,
      confirmPasswordReset: async (input) =>
        (await request('POST', '/auth/password-reset/confirm', {
          ...input,
        })) as AuthPasswordResetConfirmPostResponse,
    },
    users: {
      getMe: async () => (await request('GET', '/users/me')) as UsersMeGetResponse,
      updateMe: async (input) =>
        (await request('PATCH', '/users/me', { ...input })) as UsersMePatchResponse,
    },
  };
}
