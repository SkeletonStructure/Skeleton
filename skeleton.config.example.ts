import {
  type AppConfig,
  defineConfig,
  env,
  envBool,
  envInt,
  envList,
} from '@skeletonstructure/core/config';

export default defineConfig({
  app: {
    name: 'My SkeletonStructure app',
    env: env('NODE_ENV', 'development') as AppConfig['app']['env'],
    url: env('APP_URL', 'http://localhost:3000'),
  },

  server: {
    host: env('HOST', '0.0.0.0'),
    port: envInt('PORT', 3000),
    trustProxy: envBool('TRUST_PROXY', false),
  },

  database: {
    url: env('DATABASE_URL'),
    ssl: envBool('DATABASE_SSL', false),
    pool: {
      max: envInt('DB_POOL_MAX', 10),
      idleTimeoutMs: envInt('DB_POOL_IDLE_TIMEOUT_MS', 300_000),
      connectTimeoutMs: envInt('DB_POOL_CONNECT_TIMEOUT_MS', 10_000),
    },
  },

  logging: {
    level: env('LOG_LEVEL', 'info') as AppConfig['logging']['level'],
    format: env('LOG_FORMAT', 'json') as AppConfig['logging']['format'],
    redact: ['password', 'token', 'cookie', 'authorization', 'databaseUrl'],
  },

  security: {
    sessionCookie: {
      name: 'skel_session',
      secure: envBool('COOKIE_SECURE', false),
      sameSite: 'lax',
      httpOnly: true,
      maxAgeHours: envInt('SESSION_TTL_HOURS', 24),
    },
    csrf: {
      enabled: true,
    },
    cors: {
      origins: envList('CORS_ORIGINS', []),
      credentials: true,
    },
    rateLimit: {
      enabled: true,
      max: envInt('RATE_LIMIT_MAX', 100),
      windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
    },
  },

  modules: {
    auth: { enabled: true, passwordMinLength: 12 },
    users: { enabled: true, allowSelfUpdate: true },
    catalog: { enabled: true, publicRead: false },
    products: { enabled: true, defaultCurrency: 'USD' },
    orders: { enabled: true, requireIdempotencyKey: true },
    inventory: { enabled: true, allowNegativeStock: false },
  },

  providers: {
    email: { driver: 'console' },
  },
});
