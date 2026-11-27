import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ZodIssue } from 'zod';
import {
  drainEnvIssues,
  type Environment,
  env,
  envBool,
  envInt,
  envList,
  loadEnvironment,
  resetActiveEnvironment,
  type SecretValue,
  setActiveEnvironment,
} from './env.js';
import { ConfigError, type ConfigIssue } from './errors.js';
import { type AppConfig, type ConfigInput, configSchema } from './schema.js';

const SECRET_FIELD_PATHS: ReadonlySet<string> = new Set(['database.url']);

const CONFIG_FILE_NAMES = [
  'skeleton.config.ts',
  'skeleton.config.mts',
  'skeleton.config.cts',
  'skeleton.config.js',
  'skeleton.config.mjs',
] as const;

export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}

function isSecretValue(value: unknown): value is SecretValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'secret' &&
    typeof (value as { key?: unknown }).key === 'string'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !isSecretValue(value)
  );
}

function joinPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`;
}

function resolveConfigInput(input: unknown, issueSink: ConfigIssue[], path = ''): unknown {
  if (isSecretValue(input)) {
    return input.value;
  }

  if (Array.isArray(input)) {
    return input.map((entry, index) => resolveConfigInput(entry, issueSink, `${path}[${index}]`));
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const fieldPath = joinPath(path, key);

    if (SECRET_FIELD_PATHS.has(fieldPath) && !isSecretValue(value)) {
      issueSink.push({
        path: fieldPath,
        message:
          'Secret fields must come from env(...), not literal values. Set DATABASE_URL in the environment.',
        source: 'config',
      });
      resolved[key] = undefined;
      continue;
    }

    resolved[key] = resolveConfigInput(value, issueSink, fieldPath);
  }

  return resolved;
}

function zodIssuesToConfigIssues(issues: readonly ZodIssue[]): ConfigIssue[] {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.'),
    message: issue.message,
    source: 'config',
  }));
}

function findConfigFile(cwd: string): string | undefined {
  return CONFIG_FILE_NAMES.map((name) => resolve(cwd, name)).find((file) => existsSync(file));
}

function defaultConfigInput(): ConfigInput {
  return defineConfig({
    app: {
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
    },
    security: {
      sessionCookie: {
        secure: envBool('COOKIE_SECURE', false),
        maxAgeHours: envInt('SESSION_TTL_HOURS', 24),
      },
      cors: { origins: envList('CORS_ORIGINS', []) },
      rateLimit: {
        max: envInt('RATE_LIMIT_MAX', 100),
        windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
        store: env('RATE_LIMIT_STORE', 'memory') as AppConfig['security']['rateLimit']['store'],
        redis: { keyPrefix: env('RATE_LIMIT_REDIS_KEY_PREFIX', 'skel:ratelimit:') },
      },
    },
  });
}

async function readConfigModule(configPath: string): Promise<ConfigInput> {
  const href = `${pathToFileURL(configPath).href}?t=${Date.now()}`;
  const imported = (await import(href)) as {
    default?: ConfigInput;
    config?: ConfigInput;
  };

  const config = imported.default ?? imported.config;
  if (config === undefined) {
    throw new ConfigError([
      {
        path: '(config file)',
        message: `No default config export found in ${configPath}`,
        source: 'config',
      },
    ]);
  }

  return config;
}

export interface LoadConfigOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly environment?: Environment;
  readonly envFiles?: boolean;
  readonly config?: ConfigInput | (() => ConfigInput);
}

/** Loads, resolves, and validates configuration. Throws ConfigError on any issue. */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const cwd = options.cwd ?? process.cwd();
  const environment = await loadEnvironment({
    cwd,
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.envFiles === undefined ? {} : { envFiles: options.envFiles }),
  });

  resetActiveEnvironment();
  setActiveEnvironment(environment);

  try {
    let input: ConfigInput;

    if (typeof options.config === 'function') {
      input = options.config();
    } else if (options.config !== undefined) {
      input = options.config;
    } else {
      const configPath = options.configPath
        ? resolve(cwd, options.configPath)
        : findConfigFile(cwd);
      input = configPath === undefined ? defaultConfigInput() : await readConfigModule(configPath);
    }

    const envIssues = drainEnvIssues();
    const resolutionIssues: ConfigIssue[] = [];
    const resolved = resolveConfigInput(input, resolutionIssues);
    const parsed = configSchema.safeParse(resolved);

    if (!parsed.success) {
      const allIssues = [
        ...envIssues,
        ...resolutionIssues,
        ...zodIssuesToConfigIssues(parsed.error.issues),
      ];
      throw new ConfigError(allIssues);
    }

    const allIssues = [...envIssues, ...resolutionIssues];
    if (allIssues.length > 0) {
      throw new ConfigError(allIssues);
    }

    return parsed.data;
  } finally {
    resetActiveEnvironment();
  }
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|cookie|authorization|databaseurl|apikey)/i;
const REDACTED = '[REDACTED]';

function redactValue(value: unknown, key?: string): unknown {
  if (key !== undefined && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export function redactConfig(config: AppConfig): Record<string, unknown> {
  const redacted = redactValue(config) as {
    database: Record<string, unknown>;
    [key: string]: unknown;
  };
  if (isPlainObject(redacted.database)) {
    redacted.database.url = REDACTED;
  }
  return redacted;
}

function enabledModules(config: AppConfig): string {
  return (
    Object.entries(config.modules)
      .filter(([, value]) => value.enabled)
      .map(([name]) => name)
      .join(', ') || 'none'
  );
}

export function formatStartupSummary(config: AppConfig): string {
  const { app, server, database, logging, security, modules, providers } = config;

  return [
    'SkeletonStructure startup configuration:',
    `  app: name=${app.name} env=${app.env} url=${app.url}`,
    `  server: host=${server.host} port=${server.port} trustProxy=${server.trustProxy}`,
    `  database: url=${REDACTED} ssl=${database.ssl} pool.max=${database.pool.max}`,
    `  logging: level=${logging.level} format=${logging.format} redact=${logging.redact.join(',')}`,
    `  security: cookie=${security.sessionCookie.name} httpOnly=${security.sessionCookie.httpOnly} secure=${security.sessionCookie.secure} sameSite=${security.sessionCookie.sameSite} ttlHours=${security.sessionCookie.maxAgeHours}`,
    `  security.csrf: enabled=${security.csrf.enabled}`,
    `  security.cors: origins=${security.cors.origins.join(',') || 'same-origin'} credentials=${security.cors.credentials}`,
    `  security.rateLimit: enabled=${security.rateLimit.enabled} max=${security.rateLimit.max} windowMs=${security.rateLimit.windowMs}`,
    `  modules: ${enabledModules(config)}`,
    `  modules.auth.passwordMinLength=${modules.auth.passwordMinLength}`,
    `  providers.email.driver=${providers.email.driver}`,
  ].join('\n');
}
