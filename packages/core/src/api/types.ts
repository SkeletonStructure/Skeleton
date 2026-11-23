import type { FastifyReply, FastifyRequest, FastifySchema } from 'fastify';

import type { AppConfig } from '../config/index.js';
import type { Database } from '../database/index.js';
import type { ActivationReport, ModuleHttpMethod } from '../modules/index.js';

export interface RequestPrincipal {
  readonly id: string;
  readonly permissions: readonly string[];
}

/**
 * M5 authentication boundary. Real session authentication is M6; this interface
 * lets applications and tests supply the current principal to the global guard.
 */
export interface Authenticator {
  authenticate(request: FastifyRequest): Promise<RequestPrincipal | undefined>;
}

export type ApiRouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => unknown | Promise<unknown>;

export interface ApiRouteDefinition {
  readonly method: ModuleHttpMethod;
  readonly path: string;
  readonly permission?: string;
  /** Authentication-only routes: no permission key, but a principal is required. */
  readonly requireAuth?: boolean;
  readonly moduleId?: string;
  readonly rateLimit?: RouteRateLimit;
  readonly schema?: FastifySchema;
  readonly handler: ApiRouteHandler;
}

export interface CsrfGuard {
  /** Throws an HttpError when a cookie-authenticated mutation lacks a valid token. */
  verify(request: FastifyRequest): Promise<void> | void;
}

export interface RouteRateLimit {
  readonly max: number;
  readonly timeWindow: number | string;
}

export interface HealthResult {
  readonly status: 'ok' | 'error';
  readonly reason?: string;
}

export interface ReadinessCheck {
  readonly id: string;
  readonly check: () => Promise<HealthResult> | HealthResult;
}

export interface ReadinessCheckResult extends HealthResult {
  readonly id: string;
}

export interface ReadinessReport extends HealthResult {
  readonly checks: readonly ReadinessCheckResult[];
}

export interface PublicConfig {
  readonly appName: string;
  readonly apiBaseUrl: '/v1';
  readonly authMode: 'session';
  readonly publicModules: readonly string[];
}

export interface ApiServerOptions {
  readonly appConfig: AppConfig;
  readonly activationReport?: ActivationReport;
  readonly database?: Database;
  readonly authenticator?: Authenticator;
  /** Optional CSRF policy supplied by an authentication module. */
  readonly csrfGuard?: CsrfGuard;
  /** Handlers for routes declared by the M4 activation report. */
  readonly routeHandlers?: readonly ApiRouteDefinition[];
  /** Additional readiness checks, including future module health contributors. */
  readonly readinessChecks?: readonly ReadinessCheck[];
  /** Read-only migration-state check supplied by the application. */
  readonly migrationCheck?: ReadinessCheck;
}

export interface ResolvedApiServerOptions {
  readonly appConfig: AppConfig;
  readonly activationReport: ActivationReport;
  readonly database: Database | undefined;
  readonly authenticator: Authenticator | undefined;
  readonly csrfGuard: CsrfGuard | undefined;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly readinessChecks: readonly ReadinessCheck[];
  readonly migrationCheck: ReadinessCheck | undefined;
}

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    principal?: RequestPrincipal;
  }
}
