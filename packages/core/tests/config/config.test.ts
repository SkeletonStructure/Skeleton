import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CONFIG_FIELDS,
  ConfigError,
  type ConfigInput,
  defineConfig,
  env,
  envInt,
  formatStartupSummary,
  loadConfig,
  redactConfig,
} from '../../src/config/index.js';

const VALID_DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';

const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'skeleton-config-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadConfig', () => {
  it('loads a valid config and applies defaults for optional values', async () => {
    const config = await loadConfig({
      cwd: await makeTemporaryDirectory(),
      envFiles: false,
      environment: { DATABASE_URL: VALID_DATABASE_URL },
      config: () => defineConfig({ database: { url: env('DATABASE_URL') } }),
    });

    expect(config.database.url).toBe(VALID_DATABASE_URL);
    expect(config.app.name).toBe('SkeletonStructure');
    expect(config.app.env).toBe('development');
    expect(config.server.port).toBe(3000);
    expect(config.logging.level).toBe('info');
    expect(config.security.sessionCookie.httpOnly).toBe(true);
    expect(config.modules.products.defaultCurrency).toBe('USD');
    expect(config.providers.email.driver).toBe('console');
  });

  it('reports all invalid config errors in one output and never prints literal secrets', async () => {
    const literalSecret = 'postgres://literal:secret@example.com/db';
    const error = await loadConfig({
      cwd: await makeTemporaryDirectory(),
      envFiles: false,
      environment: { DATABASE_URL: VALID_DATABASE_URL },
      config: () =>
        defineConfig({
          app: { env: 'staging' as never },
          server: { port: 70_000 },
          database: { url: literalSecret as unknown as ConfigInput['database']['url'] },
          providers: { email: { driver: 'smtp' as never } },
        }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    expect(message).toContain('Invalid configuration:');
    expect(message).toContain('app.env');
    expect(message).toContain('server.port');
    expect(message).toContain('database.url');
    expect(message).toContain('providers.email.driver');
    expect(message).toContain('Secret fields must come from env(...)');
    expect(message).not.toContain(literalSecret);
  });

  it('fails when DATABASE_URL is missing', async () => {
    const error = await loadConfig({
      cwd: await makeTemporaryDirectory(),
      envFiles: false,
      environment: {},
      config: () => defineConfig({ database: { url: env('DATABASE_URL') } }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain('database.url');
    expect((error as Error).message).toContain('Set DATABASE_URL');
  });

  it('aggregates invalid environment variable values', async () => {
    const error = await loadConfig({
      cwd: await makeTemporaryDirectory(),
      envFiles: false,
      environment: { DATABASE_URL: VALID_DATABASE_URL, PORT: 'abc', RATE_LIMIT_MAX: 'many' },
      config: () =>
        defineConfig({
          database: { url: env('DATABASE_URL') },
          server: { port: envInt('PORT', 3000) },
          security: { rateLimit: { max: envInt('RATE_LIMIT_MAX', 100) } },
        }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    expect(message).toContain('PORT: Environment variable PORT must be an integer');
    expect(message).toContain(
      'RATE_LIMIT_MAX: Environment variable RATE_LIMIT_MAX must be an integer',
    );
  });

  it('rejects production config with insecure session cookies', async () => {
    const error = await loadConfig({
      cwd: await makeTemporaryDirectory(),
      envFiles: false,
      environment: { DATABASE_URL: VALID_DATABASE_URL },
      config: () =>
        defineConfig({
          app: { env: 'production' },
          database: { url: env('DATABASE_URL') },
        }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain('Session cookies must be secure in production');
  });

  it('loads a config file with process, .env.local, .env, and default precedence', async () => {
    const directory = await makeTemporaryDirectory();

    await writeFile(
      join(directory, '.env'),
      'APP_URL=http://from-dotenv\nPORT=1111\nLOG_LEVEL=warn\n',
      'utf8',
    );
    await writeFile(join(directory, '.env.local'), 'PORT=2222\n', 'utf8');

    const configPath = join(directory, 'skeleton.config.mjs');
    const coreEntryUrl = pathToFileURL(
      resolve(process.cwd(), 'packages/core/src/config/index.ts'),
    ).href;

    await writeFile(
      configPath,
      `import { defineConfig, env, envInt } from '${coreEntryUrl}';
export default defineConfig({
  app: { url: env('APP_URL', 'http://default') },
  database: { url: env('DATABASE_URL') },
  logging: { level: env('LOG_LEVEL', 'info') },
  server: { port: envInt('PORT', 3000) },
});
`,
      'utf8',
    );

    const config = await loadConfig({
      cwd: directory,
      configPath,
      environment: { APP_URL: 'http://from-process', DATABASE_URL: VALID_DATABASE_URL },
    });

    expect(config.app.url).toBe('http://from-process');
    expect(config.server.port).toBe(2222);
    expect(config.logging.level).toBe('warn');
    expect(config.database.url).toBe(VALID_DATABASE_URL);
  });
});

describe('secret safety', () => {
  it('never prints secret values in startup summaries or redacted config', async () => {
    const secret = 'postgres://user:hunter2@db.example.com:5432/app';
    const config = await loadConfig({
      cwd: await makeTemporaryDirectory(),
      envFiles: false,
      environment: { DATABASE_URL: secret },
      config: () => defineConfig({ database: { url: env('DATABASE_URL') } }),
    });

    const summary = formatStartupSummary(config);
    const redacted = JSON.stringify(redactConfig(config));

    expect(summary).not.toContain(secret);
    expect(summary).not.toContain('hunter2');
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain('hunter2');
    expect(summary).toContain('database: url=[REDACTED]');
  });
});

describe('repository documentation', () => {
  it('keeps .env ignored while committing .env.example', async () => {
    const gitignore = await readFile(resolve(process.cwd(), '.gitignore'), 'utf8');
    const envExample = await readFile(resolve(process.cwd(), '.env.example'), 'utf8');

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
    expect(envExample).toContain('DATABASE_URL=');
    expect(envExample).toContain('PORT=');
  });

  it('includes every documented field in the generated reference', async () => {
    const reference = await readFile(resolve(process.cwd(), 'docs/config/reference.md'), 'utf8');
    const sample = await readFile(resolve(process.cwd(), 'skeleton.config.example.ts'), 'utf8');

    expect(sample).toContain('defineConfig({');
    for (const field of CONFIG_FIELDS) {
      expect(reference).toContain(`\`${field.path}\``);
    }
    expect(reference).toContain('## Precedence');
  });
});
