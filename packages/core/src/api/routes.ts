import type { FastifyInstance, FastifySchema } from 'fastify';

import { resolveApiServerOptions } from './config.js';
import { buildReadinessChecks, evaluateReadiness } from './health.js';
import { buildPublicConfig } from './public-config.js';
import {
  errorEnvelopeSchema,
  isCursorPage,
  liveResponseSchema,
  publicConfigDataSchema,
  readyErrorResponseSchema,
  successEnvelope,
  successEnvelopeSchema,
} from './schemas.js';
import type { ApiServerOptions, ResolvedApiServerOptions } from './types.js';

function withErrorSchemas(schema: FastifySchema | undefined): FastifySchema {
  const response = schema?.response ?? {};
  return {
    ...schema,
    response: {
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
      ...response,
    },
  };
}

/** Registers HTTP routes from validated options. Called by `createServer()`. */
export async function registerResolvedRoutes(
  app: FastifyInstance,
  options: ResolvedApiServerOptions,
): Promise<void> {
  const readinessChecks = buildReadinessChecks(options);

  await app.register(
    async (v1) => {
      v1.get(
        '/config/public',
        {
          schema: successEnvelopeSchema(publicConfigDataSchema),
          config: { public: true },
        },
        async (request) =>
          successEnvelope(
            request.requestId,
            buildPublicConfig(options.appConfig, options.activationReport),
          ),
      );

      for (const route of options.routeHandlers) {
        v1.route({
          method: route.method,
          url: route.path,
          schema: withErrorSchemas(route.schema),
          config: {
            ...(route.permission === undefined ? {} : { permission: route.permission }),
            ...(route.requireAuth === true ? { requireAuth: true } : {}),
            ...(route.moduleId === undefined ? {} : { moduleId: route.moduleId }),
            ...(route.rateLimit === undefined ? {} : { rateLimit: route.rateLimit }),
          },
          handler: async (request, reply) => {
            const result = await route.handler(request, reply);
            if (reply.sent) return reply;
            if (isCursorPage(result)) {
              return successEnvelope(request.requestId, result.data, result.nextCursor);
            }
            return successEnvelope(request.requestId, result === undefined ? {} : result);
          },
        });
      }
    },
    { prefix: '/v1' },
  );

  app.get(
    '/health/live',
    {
      schema: { response: { 200: liveResponseSchema }, tags: ['internal'] },
      config: { internal: true },
    },
    async () => ({ status: 'ok' }) as const,
  );

  app.get(
    '/health/ready',
    {
      schema: {
        response: { 200: liveResponseSchema, 503: readyErrorResponseSchema },
        tags: ['internal'],
      },
      config: { internal: true },
    },
    async (request, reply) => {
      const result = await evaluateReadiness(readinessChecks);
      if (result.status === 'error') {
        return reply.code(503).send({
          status: 'error',
          reason: result.reason ?? 'NOT_READY',
          requestId: request.requestId,
        });
      }
      return { status: 'ok' } as const;
    },
  );
}

/** Public helper for registering routes on an already-configured Fastify instance. */
export async function registerRoutes(
  app: FastifyInstance,
  options: ApiServerOptions,
): Promise<void> {
  await registerResolvedRoutes(app, resolveApiServerOptions(options));
}
