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
  CatalogItemsByIdDeleteResponse,
  CatalogItemsByIdGetResponse,
  CatalogItemsByIdPatchBody,
  CatalogItemsByIdPatchResponse,
  CatalogItemsByIdProductGetResponse,
  CatalogItemsByIdProductPatchBody,
  CatalogItemsByIdProductPatchResponse,
  CatalogItemsGetResponse,
  CatalogItemsPostBody,
  CatalogItemsPostResponse,
  ConfigPublicGetResponse,
  InventoryItemsByItemIdGetResponse,
  InventoryItemsByItemIdPatchBody,
  InventoryItemsByItemIdPatchResponse,
  OrdersByIdGetResponse,
  OrdersGetResponse,
  OrdersPostBody,
  OrdersPostResponse,
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

export interface CatalogListOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly status?: 'active' | 'archived';
  readonly expand?: string;
}

export interface CatalogClient {
  getAll(options?: CatalogListOptions): Promise<CatalogItemsGetResponse>;
  getById(
    itemId: string,
    options?: Pick<CatalogListOptions, 'expand'>,
  ): Promise<CatalogItemsByIdGetResponse>;
  create(input: CatalogItemsPostBody): Promise<CatalogItemsPostResponse>;
  update(itemId: string, input: CatalogItemsByIdPatchBody): Promise<CatalogItemsByIdPatchResponse>;
  delete(itemId: string): Promise<CatalogItemsByIdDeleteResponse>;
}

export interface ProductExpansionDetails {
  readonly sku: string;
  readonly priceAmount: number;
  readonly currency: string;
  readonly weightGrams?: number;
  readonly shippingClass?: string;
}

type BaseCatalogItem = CatalogItemsGetResponse['data']['items'][number];
type WithProductDetails<T extends { readonly details?: Record<string, unknown> }> = Omit<
  T,
  'details'
> & {
  readonly details: { readonly product: ProductExpansionDetails };
};

export interface ProductsListResponse extends Omit<CatalogItemsGetResponse, 'data'> {
  readonly data: { readonly items: readonly WithProductDetails<BaseCatalogItem>[] };
}

export interface ProductsGetResponse extends Omit<CatalogItemsByIdGetResponse, 'data'> {
  readonly data: WithProductDetails<BaseCatalogItem>;
}

export interface ProductsClient {
  getAll(options?: Omit<CatalogListOptions, 'expand'>): Promise<ProductsListResponse>;
  getById(
    itemId: string,
    options?: Omit<CatalogListOptions, 'expand'>,
  ): Promise<ProductsGetResponse>;
  getByItemId(itemId: string): Promise<CatalogItemsByIdProductGetResponse>;
  update(
    itemId: string,
    input: CatalogItemsByIdProductPatchBody,
  ): Promise<CatalogItemsByIdProductPatchResponse>;
}

export interface InventoryClient {
  get(itemId: string): Promise<InventoryItemsByItemIdGetResponse>;
  set(
    itemId: string,
    input: InventoryItemsByItemIdPatchBody,
  ): Promise<InventoryItemsByItemIdPatchResponse>;
}

export interface OrdersListOptions {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CreateOrderOptions {
  /** Sent as the `Idempotency-Key` header. Keep true in production configuration. */
  readonly idempotencyKey?: string;
}

export interface OrdersClient {
  create(input: OrdersPostBody, options?: CreateOrderOptions): Promise<OrdersPostResponse>;
  getById(orderId: string): Promise<OrdersByIdGetResponse>;
  list(options?: OrdersListOptions): Promise<OrdersGetResponse>;
}

export interface SkeletonClient {
  readonly config: ConfigClient;
  readonly auth: AuthClient;
  readonly users: UsersClient;
  readonly catalog: CatalogClient;
  readonly products: ProductsClient;
  readonly inventory: InventoryClient;
  readonly orders: OrdersClient;
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

function withQuery(
  path: string,
  query: Readonly<Record<string, string | number | undefined>> | undefined,
): string {
  if (query === undefined) return path;
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    parameters.set(key, String(value));
  }
  const serialized = parameters.toString();
  return serialized.length === 0 ? path : `${path}?${serialized}`;
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

interface RequestOptions {
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly query?: Readonly<Record<string, string | number | undefined>> | undefined;
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
    requestOptions: RequestOptions = {},
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
      for (const [name, value] of Object.entries(requestOptions.headers ?? {})) {
        headers[name] = value;
      }

      const init: RequestInit = { method, headers, credentials };
      if (body !== undefined) init.body = JSON.stringify(body);

      const response = await fetchImpl(
        joinUrl(baseUrl, withQuery(path, requestOptions.query)),
        init,
      );
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
    catalog: {
      getAll: async (input) =>
        (await request('GET', '/catalog/items', undefined, {
          query: { ...(input ?? {}) },
        })) as CatalogItemsGetResponse,
      getById: async (itemId, input) =>
        (await request('GET', `/catalog/items/${encodeURIComponent(itemId)}`, undefined, {
          query: { ...(input ?? {}) },
        })) as CatalogItemsByIdGetResponse,
      create: async (input) =>
        (await request('POST', '/catalog/items', { ...input })) as CatalogItemsPostResponse,
      update: async (itemId, input) =>
        (await request('PATCH', `/catalog/items/${encodeURIComponent(itemId)}`, {
          ...input,
        })) as CatalogItemsByIdPatchResponse,
      delete: async (itemId) =>
        (await request(
          'DELETE',
          `/catalog/items/${encodeURIComponent(itemId)}`,
        )) as CatalogItemsByIdDeleteResponse,
    },
    products: {
      getAll: async (input) =>
        (await request('GET', '/catalog/items', undefined, {
          query: { ...input, expand: 'product' },
        })) as ProductsListResponse,
      getById: async (itemId, input) =>
        (await request('GET', `/catalog/items/${encodeURIComponent(itemId)}`, undefined, {
          query: { ...input, expand: 'product' },
        })) as ProductsGetResponse,
      getByItemId: async (itemId) =>
        (await request(
          'GET',
          `/catalog/items/${encodeURIComponent(itemId)}/product`,
        )) as CatalogItemsByIdProductGetResponse,
      update: async (itemId, input) =>
        (await request('PATCH', `/catalog/items/${encodeURIComponent(itemId)}/product`, {
          ...input,
        })) as CatalogItemsByIdProductPatchResponse,
    },
    inventory: {
      get: async (itemId) =>
        (await request(
          'GET',
          `/inventory/items/${encodeURIComponent(itemId)}`,
        )) as InventoryItemsByItemIdGetResponse,
      set: async (itemId, input) =>
        (await request('PATCH', `/inventory/items/${encodeURIComponent(itemId)}`, {
          ...input,
        })) as InventoryItemsByItemIdPatchResponse,
    },
    orders: {
      create: async (input, createOptions) =>
        (await request(
          'POST',
          '/orders',
          { ...input },
          {
            ...(createOptions?.idempotencyKey === undefined
              ? {}
              : { headers: { 'idempotency-key': createOptions.idempotencyKey } }),
          },
        )) as OrdersPostResponse,
      getById: async (orderId) =>
        (await request('GET', `/orders/${encodeURIComponent(orderId)}`)) as OrdersByIdGetResponse,
      list: async (input) =>
        (await request('GET', '/orders', undefined, {
          query: { ...(input ?? {}) },
        })) as OrdersGetResponse,
    },
  };
}
