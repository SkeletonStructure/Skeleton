import { type AppConfig, defineConfig, env, envBool, envInt } from '@skeletonstructure/core/config';

export default defineConfig({
  app: {
    name: 'Basic SkeletonStructure app',
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
  },
  logging: {
    level: env('LOG_LEVEL', 'info') as AppConfig['logging']['level'],
    format: env('LOG_FORMAT', 'json') as AppConfig['logging']['format'],
  },
});
