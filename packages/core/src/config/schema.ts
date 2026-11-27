import { z } from 'zod';

import type { SecretValue } from './env.js';

export const APP_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
export const LOG_FORMATS = ['json', 'pretty'] as const;
export const COOKIE_SAME_SITE_MODES = ['lax', 'strict'] as const;
export const EMAIL_DRIVERS = ['console'] as const;
export const RATE_LIMIT_STORES = ['memory', 'redis'] as const;
export const RATE_LIMIT_FAILURE_POLICIES = ['deny'] as const;

export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'password',
  'token',
  'cookie',
  'authorization',
  'databaseUrl',
];

const databaseUrlSchema = z
  .string()
  .min(1)
  .regex(/^postgres(?:ql)?:\/\//, 'Database URL must use postgres:// or postgresql://');

export const configSchema = z
  .object({
    app: z
      .object({
        name: z.string().min(1).default('SkeletonStructure'),
        env: z.enum(APP_ENVIRONMENTS).default('development'),
        url: z.string().min(1).default('http://localhost:3000'),
      })
      .prefault({}),
    server: z
      .object({
        host: z.string().min(1).default('0.0.0.0'),
        port: z.number().int().min(1).max(65_535).default(3000),
        trustProxy: z.boolean().default(false),
      })
      .prefault({}),
    database: z.object({
      url: databaseUrlSchema,
      ssl: z.boolean().default(false),
      pool: z
        .object({
          max: z.number().int().min(1).default(10),
          idleTimeoutMs: z.number().int().min(1000).max(2_147_483_647).default(300_000),
          connectTimeoutMs: z.number().int().min(1000).max(2_147_483_647).default(10_000),
        })
        .prefault({}),
    }),
    logging: z
      .object({
        level: z.enum(LOG_LEVELS).default('info'),
        format: z.enum(LOG_FORMATS).default('json'),
        redact: z.array(z.string().min(1)).default([...DEFAULT_REDACT_KEYS]),
      })
      .prefault({}),
    security: z
      .object({
        sessionCookie: z
          .object({
            name: z.string().min(1).default('skel_session'),
            secure: z.boolean().default(false),
            sameSite: z.enum(COOKIE_SAME_SITE_MODES).default('lax'),
            httpOnly: z.literal(true).default(true),
            maxAgeHours: z.number().int().min(1).default(24),
          })
          .prefault({}),
        csrf: z
          .object({
            enabled: z.boolean().default(true),
          })
          .prefault({}),
        cors: z
          .object({
            origins: z.array(z.string().min(1)).default([]),
            credentials: z.boolean().default(true),
          })
          .prefault({}),
        rateLimit: z
          .object({
            enabled: z.boolean().default(true),
            max: z.number().int().min(1).default(100),
            windowMs: z.number().int().min(1).default(60_000),
            store: z.enum(RATE_LIMIT_STORES).default('memory'),
            failurePolicy: z.enum(RATE_LIMIT_FAILURE_POLICIES).default('deny'),
            redis: z
              .object({
                keyPrefix: z.string().min(1).default('skel:ratelimit:'),
              })
              .prefault({}),
          })
          .prefault({}),
      })
      .prefault({}),
    modules: z
      .object({
        auth: z
          .object({
            enabled: z.boolean().default(false),
            passwordMinLength: z.number().int().min(12).default(12),
          })
          .prefault({}),
        users: z
          .object({
            enabled: z.boolean().default(false),
            allowSelfUpdate: z.boolean().default(true),
          })
          .prefault({}),
        catalog: z
          .object({
            enabled: z.boolean().default(false),
            publicRead: z.boolean().default(false),
          })
          .prefault({}),
        products: z
          .object({
            enabled: z.boolean().default(false),
            defaultCurrency: z
              .string()
              .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase ISO 4217 code')
              .default('USD'),
          })
          .prefault({}),
        orders: z
          .object({
            enabled: z.boolean().default(false),
            requireIdempotencyKey: z.boolean().default(true),
          })
          .prefault({}),
        inventory: z
          .object({
            enabled: z.boolean().default(false),
            allowNegativeStock: z.boolean().default(false),
          })
          .prefault({}),
      })
      .prefault({}),
    providers: z
      .object({
        email: z
          .object({
            driver: z.enum(EMAIL_DRIVERS).default('console'),
          })
          .prefault({}),
      })
      .prefault({}),
  })
  .superRefine((config, ctx) => {
    const production = config.app.env === 'production';

    if (production && !config.security.sessionCookie.secure) {
      ctx.addIssue({
        code: 'custom',
        path: ['security', 'sessionCookie', 'secure'],
        message: 'Session cookies must be secure in production',
      });
    }

    if (production && config.logging.format !== 'json') {
      ctx.addIssue({
        code: 'custom',
        path: ['logging', 'format'],
        message: 'Logging format must be json in production',
      });
    }

    if (production && !config.security.csrf.enabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['security', 'csrf', 'enabled'],
        message: 'CSRF protection cannot be disabled in production',
      });
    }

    if (production && !config.security.rateLimit.enabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['security', 'rateLimit', 'enabled'],
        message: 'Rate limiting cannot be disabled in production',
      });
    }

    if (config.security.cors.credentials && config.security.cors.origins.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['security', 'cors', 'origins'],
        message: 'Wildcard CORS origins cannot be used with credentials',
      });
    }

    const redactKeys = new Set(config.logging.redact.map((key) => key.toLowerCase()));
    for (const key of DEFAULT_REDACT_KEYS) {
      if (!redactKeys.has(key.toLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          path: ['logging', 'redact'],
          message: `Default redaction key ${key} cannot be removed`,
        });
      }
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

type SchemaInput = z.input<typeof configSchema>;

export type ConfigInput = Omit<SchemaInput, 'database'> & {
  readonly database: Omit<NonNullable<SchemaInput['database']>, 'url'> & {
    readonly url: SecretValue;
  };
};
