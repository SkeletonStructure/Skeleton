import type { ActivationReport, RegisteredModuleRoute } from '../modules/index.js';
import type { ApiRouteDefinition, ApiServerOptions, ResolvedApiServerOptions } from './types.js';

export const API_CONFIGURATION_ERROR_CODES = [
  'INVALID_APP_CONFIG',
  'INVALID_CORS_ORIGINS',
  'CORS_WILDCARD_ORIGIN',
  'INVALID_RATE_LIMIT',
  'INVALID_RATE_LIMIT_STORE',
  'INVALID_ACTIVATION_REPORT',
  'UNKNOWN_ROUTE_PERMISSION',
  'DUPLICATE_ROUTE',
  'MISSING_ROUTE_HANDLER',
  'UNDECLARED_ROUTE_HANDLER',
  'DUPLICATE_READINESS_CHECK',
] as const;

export type ApiConfigurationErrorCode = (typeof API_CONFIGURATION_ERROR_CODES)[number];

export class ApiConfigurationError extends Error {
  readonly code: ApiConfigurationErrorCode;

  constructor(code: ApiConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
    this.code = code;
  }
}

export function emptyActivationReport(): ActivationReport {
  return { enabled: [], disabled: [], order: [], permissions: [], routes: [], ports: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function routeKey(route: Pick<RegisteredModuleRoute, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}

function validateCors(options: ApiServerOptions): void {
  const cors = options.appConfig?.security?.cors;
  if (!isObject(cors) || !Array.isArray(cors.origins)) {
    throw new ApiConfigurationError(
      'INVALID_APP_CONFIG',
      'Application CORS configuration is invalid.',
    );
  }

  for (const origin of cors.origins) {
    if (typeof origin !== 'string') {
      throw new ApiConfigurationError('INVALID_CORS_ORIGINS', 'CORS origins must be strings.');
    }
    if (origin === '*') {
      throw new ApiConfigurationError(
        'CORS_WILDCARD_ORIGIN',
        'CORS origins must be exact; wildcard origins are not supported.',
      );
    }
    try {
      const parsed = new URL(origin);
      const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      const isExactOrigin =
        parsed.pathname === '/' &&
        parsed.search === '' &&
        parsed.hash === '' &&
        parsed.username === '' &&
        parsed.password === '';
      if (!isHttp || !isExactOrigin) {
        throw new Error('invalid origin');
      }
    } catch {
      throw new ApiConfigurationError(
        'INVALID_CORS_ORIGINS',
        `CORS origin "${origin}" is not an exact http(s) origin.`,
      );
    }
  }
}

function validateRateLimit(options: ApiServerOptions): void {
  const rateLimit = options.appConfig?.security?.rateLimit;
  if (!isObject(rateLimit)) {
    throw new ApiConfigurationError(
      'INVALID_APP_CONFIG',
      'Application rate-limit configuration is invalid.',
    );
  }
  if (
    typeof rateLimit.max !== 'number' ||
    !Number.isInteger(rateLimit.max) ||
    rateLimit.max < 1 ||
    typeof rateLimit.windowMs !== 'number' ||
    !Number.isInteger(rateLimit.windowMs) ||
    rateLimit.windowMs < 1
  ) {
    throw new ApiConfigurationError(
      'INVALID_RATE_LIMIT',
      'Rate-limit max and windowMs must be positive integers.',
    );
  }
  if (rateLimit.store !== 'memory' && rateLimit.store !== 'redis') {
    throw new ApiConfigurationError('INVALID_RATE_LIMIT', 'Unknown rate-limit store.');
  }
  if (rateLimit.failurePolicy !== 'deny') {
    throw new ApiConfigurationError(
      'INVALID_RATE_LIMIT',
      'Rate-limit failure policy must be deny.',
    );
  }
  const provider = options.rateLimitStore;
  if (provider !== undefined && provider.id !== rateLimit.store) {
    throw new ApiConfigurationError(
      'INVALID_RATE_LIMIT_STORE',
      'Injected rate-limit store does not match the configured store.',
    );
  }
  if (rateLimit.store === 'redis' && provider === undefined) {
    throw new ApiConfigurationError(
      'INVALID_RATE_LIMIT_STORE',
      'Redis rate limiting requires an injected client provider.',
    );
  }
}

function validateRouteRateLimit(rateLimit: unknown): void {
  if (!isObject(rateLimit)) {
    throw new ApiConfigurationError('INVALID_RATE_LIMIT', 'Route rate limit must be an object.');
  }
  if (typeof rateLimit.max !== 'number' || !Number.isInteger(rateLimit.max) || rateLimit.max < 1) {
    throw new ApiConfigurationError(
      'INVALID_RATE_LIMIT',
      'Route rate-limit max must be a positive integer.',
    );
  }
  const window = rateLimit.timeWindow;
  const validWindow =
    (typeof window === 'number' && Number.isInteger(window) && window > 0) ||
    (typeof window === 'string' && window.trim().length > 0);
  if (!validWindow) {
    throw new ApiConfigurationError(
      'INVALID_RATE_LIMIT',
      'Route rate-limit timeWindow must be a positive number or duration string.',
    );
  }
}

function validateActivationReportShape(report: ActivationReport): void {
  if (
    !Array.isArray(report.enabled) ||
    !Array.isArray(report.disabled) ||
    !Array.isArray(report.order) ||
    !Array.isArray(report.permissions) ||
    !Array.isArray(report.routes) ||
    !Array.isArray(report.ports)
  ) {
    throw new ApiConfigurationError(
      'INVALID_ACTIVATION_REPORT',
      'Activation report must contain array fields.',
    );
  }
}

function validateRoutes(
  report: ActivationReport,
  routeHandlers: readonly ApiRouteDefinition[],
): void {
  const knownPermissions = new Set(report.permissions.map((permission) => permission.key));
  const declared = new Map<string, RegisteredModuleRoute>();
  const seen = new Set<string>();

  for (const route of report.routes) {
    if (route.method === 'GET' && route.path === '/config/public') {
      throw new ApiConfigurationError(
        'DUPLICATE_ROUTE',
        'Route GET /config/public is reserved by core.',
      );
    }
    if (route.path === '/v1' || route.path.startsWith('/v1/')) {
      throw new ApiConfigurationError(
        'INVALID_ACTIVATION_REPORT',
        `Route ${routeKey(route)} must not include the /v1 prefix.`,
      );
    }
    if (route.permission !== undefined && !knownPermissions.has(route.permission)) {
      throw new ApiConfigurationError(
        'UNKNOWN_ROUTE_PERMISSION',
        `Route ${routeKey(route)} declares unknown permission "${route.permission}".`,
      );
    }

    const key = routeKey(route);
    if (seen.has(key)) {
      throw new ApiConfigurationError(
        'DUPLICATE_ROUTE',
        `Route ${key} is declared more than once.`,
      );
    }
    seen.add(key);
    declared.set(key, route);
  }

  const handled = new Set<string>();
  for (const handler of routeHandlers) {
    const key = routeKey(handler);
    if (handled.has(key)) {
      throw new ApiConfigurationError('DUPLICATE_ROUTE', `Route ${key} has more than one handler.`);
    }
    handled.add(key);

    const declaration = declared.get(key);
    if (declaration === undefined) {
      throw new ApiConfigurationError(
        'UNDECLARED_ROUTE_HANDLER',
        `Handler for ${key} has no matching activation-report route.`,
      );
    }
    if (handler.permission !== declaration.permission) {
      throw new ApiConfigurationError(
        'UNKNOWN_ROUTE_PERMISSION',
        `Handler for ${key} does not match its declared permission.`,
      );
    }
    if (handler.moduleId !== undefined && handler.moduleId !== declaration.moduleId) {
      throw new ApiConfigurationError(
        'INVALID_ACTIVATION_REPORT',
        `Handler for ${key} does not match its declaring module.`,
      );
    }
    if (handler.rateLimit !== undefined) validateRouteRateLimit(handler.rateLimit);
  }

  for (const route of report.routes) {
    if (!handled.has(routeKey(route))) {
      throw new ApiConfigurationError(
        'MISSING_ROUTE_HANDLER',
        `Route ${routeKey(route)} has no registered handler.`,
      );
    }
  }
}

function validateReadinessChecks(checks: readonly { readonly id: string }[]): void {
  const seen = new Set<string>();
  const reserved = new Set(['config', 'database', 'rateLimitStore', 'audit']);
  for (const check of checks) {
    if (reserved.has(check.id)) {
      throw new ApiConfigurationError(
        'DUPLICATE_READINESS_CHECK',
        `Readiness check id "${check.id}" is reserved by core.`,
      );
    }
    if (typeof check.id !== 'string' || check.id.length === 0) {
      throw new ApiConfigurationError(
        'DUPLICATE_READINESS_CHECK',
        'Readiness checks require a non-empty id.',
      );
    }
    if (seen.has(check.id)) {
      throw new ApiConfigurationError(
        'DUPLICATE_READINESS_CHECK',
        `Readiness check "${check.id}" is registered more than once.`,
      );
    }
    seen.add(check.id);
  }
}

/** Fail-closed validation of all M5 startup inputs. Errors never include config values. */
export function resolveApiServerOptions(options: ApiServerOptions): ResolvedApiServerOptions {
  if (!isObject(options) || !isObject(options.appConfig)) {
    throw new ApiConfigurationError(
      'INVALID_APP_CONFIG',
      'Server options require an application config.',
    );
  }

  validateCors(options);
  validateRateLimit(options);

  const activationReport = options.activationReport ?? emptyActivationReport();
  validateActivationReportShape(activationReport);

  const routeHandlers = options.routeHandlers ?? [];
  validateRoutes(activationReport, routeHandlers);

  const readinessChecks = [...(options.readinessChecks ?? [])];
  if (options.migrationCheck !== undefined) readinessChecks.unshift(options.migrationCheck);
  validateReadinessChecks(readinessChecks);

  return {
    appConfig: options.appConfig,
    activationReport,
    database: options.database,
    authenticator: options.authenticator,
    csrfGuard: options.csrfGuard,
    routeHandlers,
    readinessChecks,
    migrationCheck: options.migrationCheck,
    rateLimitStore: options.rateLimitStore,
    auditSink: options.auditSink,
  };
}
