import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Logger } from '../logging/index.js';
import { createNoopLogger } from '../logging/index.js';
import { createPermissionGuard } from './auth.js';
import { resolveApiServerOptions } from './config.js';
import { HttpError, mapRequestError } from './errors.js';
import {
  createMemoryRateLimitStore,
  type RateLimitStoreProvider,
  rateLimitStoreConstructor,
} from './rate-limit.js';
import { newRequestId } from './request.js';
import { registerResolvedRoutes } from './routes.js';
import type { ApiServerOptions } from './types.js';

const requestStarts = new WeakMap<FastifyRequest, number>();
const requestLoggers = new WeakMap<FastifyRequest, Logger>();

function safeRoutePath(request: FastifyRequest): string {
  const path = request.routeOptions.url;
  return typeof path === 'string' && path.length > 0 ? path : 'unmatched';
}

/** Builds the M5 Fastify instance with all global hooks already installed. */
export async function createServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const resolved = resolveApiServerOptions(options);
  const app = fastify({
    logger: false,
    trustProxy: resolved.appConfig.server.trustProxy,
  });
  const logger = resolved.logger ?? createNoopLogger();

  app.decorateRequest('requestId', '');
  app.decorateRequest('logger', {
    getter(this: FastifyRequest) {
      return requestLoggers.get(this) ?? logger;
    },
    setter(this: FastifyRequest, value: Logger) {
      requestLoggers.set(this, value);
    },
  });
  app.addHook('onRequest', async (request, reply) => {
    request.requestId = newRequestId();
    request.logger = logger.child({ requestId: request.requestId });
    requestStarts.set(request, Date.now());
    reply.header('x-request-id', request.requestId);
  });

  // Register the shared limiter after request correlation but before the
  // authorization/CSRF hooks it protects. Its onRoute hook installs the limiter
  // on every registered route, including health probes that opt out explicitly.
  const rateLimitConfig = resolved.appConfig.security.rateLimit;
  const rateLimitStore: RateLimitStoreProvider =
    resolved.rateLimitStore ?? createMemoryRateLimitStore();
  await app.register(rateLimit, {
    global: rateLimitConfig.enabled,
    max: rateLimitConfig.max,
    timeWindow: rateLimitConfig.windowMs,
    hook: 'onRequest',
    skipOnError: false,
    store: rateLimitStoreConstructor(rateLimitStore),
    errorResponseBuilder: () => new HttpError({ status: 429, code: 'RATE_LIMITED' }),
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStarts.get(request) ?? Date.now();
    requestStarts.delete(request);
    request.logger.info('http.request_completed', {
      method: request.method,
      route: safeRoutePath(request),
      statusCode: reply.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  app.addHook('onClose', async () => {
    try {
      await rateLimitStore.close?.();
      await resolved.auditSink?.close?.();
    } catch {
      logger.error('lifecycle.resource_close_failed');
    }
  });

  const csrfGuard = resolved.csrfGuard;
  if (csrfGuard !== undefined) {
    app.addHook('preHandler', async (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        try {
          await csrfGuard.verify(request);
        } catch (error) {
          if (resolved.auditSink !== undefined) {
            await resolved.auditSink.record({
              action: 'security.csrf',
              outcome: 'failure',
              requestId: request.requestId,
              ...(request.principal === undefined ? {} : { actorId: request.principal.id }),
            });
          }
          throw error;
        }
      }
    });
  }
  app.addHook('preHandler', createPermissionGuard(resolved.authenticator, resolved.auditSink));

  app.setErrorHandler(async (error, request, reply) => {
    const mapped = mapRequestError(error, request.requestId);
    request.logger.warn('http.request_failed', {
      statusCode: mapped.statusCode,
      errorCode: mapped.body.error.code,
    });
    if (mapped.statusCode === 429 && resolved.auditSink !== undefined) {
      await resolved.auditSink.record({
        action: 'security.rate_limit',
        outcome: 'failure',
        requestId: request.requestId,
        ...(request.principal === undefined ? {} : { actorId: request.principal.id }),
      });
    }
    reply.code(mapped.statusCode).send(mapped.body);
  });
  app.setNotFoundHandler((request, reply) => {
    const mapped = mapRequestError(
      new HttpError({ status: 404, code: 'NOT_FOUND' }),
      request.requestId,
    );
    request.logger.warn('http.request_failed', { statusCode: 404, errorCode: 'NOT_FOUND' });
    reply.code(mapped.statusCode).send(mapped.body);
  });

  await app.register(cookie);

  const corsConfig = resolved.appConfig.security.cors;
  await app.register(cors, {
    origin: corsConfig.origins.length > 0 ? corsConfig.origins : false,
    credentials: corsConfig.origins.length > 0 ? corsConfig.credentials : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-csrf-token'],
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: `${resolved.appConfig.app.name} API`,
        version: '0.1.0',
        description: 'Public SkeletonStructure HTTP contract.',
      },
    },
    hiddenTag: 'internal',
    exposeHeadRoutes: false,
  });

  await registerResolvedRoutes(app, resolved);
  logger.debug('api.server_created');
  return app;
}
