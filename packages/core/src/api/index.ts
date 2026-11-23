export { routePermission } from './auth.js';
export {
  API_CONFIGURATION_ERROR_CODES,
  ApiConfigurationError,
  type ApiConfigurationErrorCode,
  emptyActivationReport,
  resolveApiServerOptions,
} from './config.js';
export {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorOptions,
  HttpError,
  type MappedError,
  mapRequestError,
  type ValidationDetail,
  validationError,
} from './errors.js';
export {
  buildReadinessChecks,
  databaseReadinessCheck,
  evaluateReadiness,
} from './health.js';
export {
  generateOpenApiDocument,
  type OpenApiDocument,
  serializeOpenApiDocument,
} from './openapi.js';
export { buildPublicConfig } from './public-config.js';
export { newRequestId } from './request.js';
export { registerRoutes } from './routes.js';
export {
  errorEnvelopeSchema,
  liveResponseSchema,
  publicConfigDataSchema,
  readyErrorResponseSchema,
  type SuccessEnvelope,
  successEnvelope,
  successEnvelopeSchema,
} from './schemas.js';
export { createServer } from './server.js';
export type {
  ApiRouteDefinition,
  ApiRouteHandler,
  ApiServerOptions,
  Authenticator,
  CsrfGuard,
  HealthResult,
  PublicConfig,
  ReadinessCheck,
  ReadinessCheckResult,
  ReadinessReport,
  RequestPrincipal,
  ResolvedApiServerOptions,
  RouteRateLimit,
} from './types.js';
