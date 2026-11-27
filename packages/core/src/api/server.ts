import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import fastify, { type FastifyInstance } from 'fastify';

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

/** Builds the M5 Fastify instance with all global hooks already installed. */
export async function createServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const resolved = resolveApiServerOptions(options);
  const app = fastify({
    logger: false,
    trustProxy: resolved.appConfig.server.trustProxy,
  });

  // Register the shared limiter before the request hooks it protects. Its
  // onRoute hook installs the limiter on every registered route, including the
  // CSRF and permission-guarded ones below.
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
  app.addHook('onClose', async () => {
    await rateLimitStore.close?.();
    await resolved.auditSink?.close?.();
  });

  app.decorateRequest('requestId', '');
  app.addHook('onRequest', async (request, reply) => {
    request.requestId = newRequestId();
    reply.header('x-request-id', request.requestId);
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
  return app;
}
