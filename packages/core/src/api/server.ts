import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import fastify, { type FastifyInstance } from 'fastify';

import { createPermissionGuard } from './auth.js';
import { resolveApiServerOptions } from './config.js';
import { HttpError, mapRequestError } from './errors.js';
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

  app.decorateRequest('requestId', '');
  app.addHook('onRequest', async (request, reply) => {
    request.requestId = newRequestId();
    reply.header('x-request-id', request.requestId);
  });
  app.addHook('preHandler', createPermissionGuard(resolved.authenticator));

  app.setErrorHandler((error, request, reply) => {
    const mapped = mapRequestError(error, request.requestId);
    reply.code(mapped.statusCode).send(mapped.body);
  });
  app.setNotFoundHandler((request, reply) => {
    const mapped = mapRequestError(
      new HttpError({ status: 404, code: 'NOT_FOUND' }),
      request.requestId,
    );
    reply.code(mapped.statusCode).send(mapped.body);
  });

  const corsConfig = resolved.appConfig.security.cors;
  await app.register(cors, {
    origin: corsConfig.origins.length > 0 ? corsConfig.origins : false,
    credentials: corsConfig.origins.length > 0 ? corsConfig.credentials : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-csrf-token'],
  });

  const rateLimitConfig = resolved.appConfig.security.rateLimit;
  await app.register(rateLimit, {
    global: rateLimitConfig.enabled,
    max: rateLimitConfig.max,
    timeWindow: rateLimitConfig.windowMs,
    errorResponseBuilder: () => new HttpError({ status: 429, code: 'RATE_LIMITED' }),
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
