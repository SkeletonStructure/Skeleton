import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { type AppConfig, defineConfig, env, loadConfig } from '../../src/config/index.js';
import type { Database } from '../../src/database/index.js';
import {
  composeModuleRegistry,
  createModuleRegistry,
  type ModuleConfigSource,
  type ModuleContext,
  type ModuleDefinition,
  type ModuleErrorCode,
  ModuleRegistryError,
} from '../../src/modules/index.js';

const VALID_DATABASE_URL = 'postgres://skeleton:skeleton@localhost:5432/skeleton';
const database = { db: {} } as unknown as Database;

async function makeAppConfig(): Promise<AppConfig> {
  return loadConfig({
    envFiles: false,
    environment: { DATABASE_URL: VALID_DATABASE_URL },
    config: () =>
      defineConfig({
        database: { url: env('DATABASE_URL') },
      }),
  });
}

function moduleConfig(
  enabledIds: readonly string[],
  entries: Readonly<Record<string, unknown>> = {},
): ModuleConfigSource {
  return {
    ...Object.fromEntries(enabledIds.map((id) => [id, { enabled: true }])),
    ...entries,
  };
}

function moduleDefinition(id: string, overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id,
    version: 1,
    stability: 'stable',
    register: () => {},
    ...overrides,
  };
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error to be thrown.');
}

async function captureAsyncError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error to be thrown.');
}

async function expectModuleError(
  promise: Promise<unknown>,
  code: ModuleErrorCode,
  moduleId?: string,
): Promise<ModuleRegistryError> {
  const error = await captureAsyncError(promise);
  expect(error).toBeInstanceOf(ModuleRegistryError);
  const registryError = error as ModuleRegistryError;
  expect(registryError.code).toBe(code);
  if (moduleId !== undefined) expect(registryError.moduleId).toBe(moduleId);
  return registryError;
}

function expectModuleErrorSync(run: () => unknown, code: ModuleErrorCode): ModuleRegistryError {
  const error = captureError(run);
  expect(error).toBeInstanceOf(ModuleRegistryError);
  const registryError = error as ModuleRegistryError;
  expect(registryError.code).toBe(code);
  return registryError;
}

describe('module registry (unit)', () => {
  it('registers a fixture route and permission and reports activation metadata', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('fixture', {
        permissions: [{ key: 'fixture:read', description: 'Read fixtures' }],
        register: (context) => {
          context.permissions.register({ key: 'fixture:write', description: 'Write fixtures' });
          context.http.register({
            method: 'GET',
            path: '/v1/fixtures',
            permission: 'fixture:read',
          });
          context.http.register({
            method: 'POST',
            path: '/v1/fixtures',
            permission: 'fixture:write',
          });
        },
      }),
    );

    const report = await registry.activate({ moduleConfig: moduleConfig(['fixture']) });

    expect(report.order).toEqual(['fixture']);
    expect(report.enabled).toEqual([
      {
        id: 'fixture',
        version: 1,
        stability: 'stable',
        requires: [],
        enhances: [],
        provides: [],
        consumes: [],
      },
    ]);
    expect(report.disabled).toEqual([]);
    expect(report.permissions.map((permission) => permission.key)).toEqual([
      'fixture:read',
      'fixture:write',
    ]);
    expect(report.routes).toEqual([
      { method: 'GET', path: '/v1/fixtures', permission: 'fixture:read', moduleId: 'fixture' },
      { method: 'POST', path: '/v1/fixtures', permission: 'fixture:write', moduleId: 'fixture' },
    ]);
    expect(report.ports).toEqual([]);
  });

  it('does not register routes or permissions for a disabled module', async () => {
    const register = vi.fn();
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('fixture', {
        permissions: [{ key: 'fixture:read', description: 'Read fixtures' }],
        register,
      }),
    );

    const report = await registry.activate({
      moduleConfig: moduleConfig([], { fixture: { enabled: false } }),
    });

    expect(register).not.toHaveBeenCalled();
    expect(report.enabled).toEqual([]);
    expect(report.order).toEqual([]);
    expect(report.routes).toEqual([]);
    expect(report.permissions).toEqual([]);
    expect(report.disabled.map((summary) => summary.id)).toEqual(['fixture']);
  });

  it('fails clearly when a required dependency is registered but disabled', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(moduleDefinition('alpha', { requires: ['beta'] }));
    registry.register(moduleDefinition('beta'));

    const error = await expectModuleError(
      registry.activate({
        moduleConfig: moduleConfig(['alpha'], { beta: { enabled: false } }),
      }),
      'MODULE_MISSING_DEPENDENCY',
      'alpha',
    );

    expect(error.message).toContain('requires "beta", which is disabled');
  });

  it('fails clearly when a required dependency is not registered', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(moduleDefinition('alpha', { requires: ['beta'] }));

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['alpha']) }),
      'MODULE_MISSING_DEPENDENCY',
      'alpha',
    );

    expect(error.message).toContain('requires "beta", which is not registered');
  });

  it('initializes dependencies before dependents and exposes declared APIs through use()', async () => {
    const calls: string[] = [];
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('alpha', {
        requires: ['beta'],
        register: (context) => {
          calls.push('alpha');
          expect(context.use('beta')).toEqual({ name: 'beta-api' });
        },
      }),
    );
    registry.register(
      moduleDefinition('beta', {
        publicApi: { name: 'beta-api' },
        register: () => {
          calls.push('beta');
        },
      }),
    );

    const report = await registry.activate({ moduleConfig: moduleConfig(['alpha', 'beta']) });

    expect(calls).toEqual(['beta', 'alpha']);
    expect(report.order).toEqual(['beta', 'alpha']);
    expect(report.enabled.map((summary) => summary.id)).toEqual(['beta', 'alpha']);
  });

  it('rejects use() for an undeclared module API', async () => {
    let accessError: unknown;
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('alpha', {
        register: (context) => {
          try {
            context.use('beta');
          } catch (error) {
            accessError = error;
          }
        },
      }),
    );
    registry.register(moduleDefinition('beta', { publicApi: { name: 'beta-api' } }));

    await registry.activate({ moduleConfig: moduleConfig(['alpha', 'beta']) });

    expect(accessError).toMatchObject({
      name: 'ModuleRegistryError',
      code: 'MODULE_API_UNAVAILABLE',
    });
  });

  it('fails on a circular required dependency', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(moduleDefinition('alpha', { requires: ['beta'] }));
    registry.register(moduleDefinition('beta', { requires: ['alpha'] }));

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['alpha', 'beta']) }),
      'MODULE_CIRCULAR_DEPENDENCY',
    );

    expect(error.message).toContain('Circular module dependency detected');
  });

  it('fails on an enhancement cycle only when both optional modules are enabled', async () => {
    const appConfig = await makeAppConfig();
    const registry = createModuleRegistry({ appConfig, database });
    registry.register(moduleDefinition('alpha', { enhances: ['beta'] }));
    registry.register(moduleDefinition('beta', { enhances: ['alpha'] }));

    const singleReport = await registry.activate({ moduleConfig: moduleConfig(['alpha']) });
    expect(singleReport.order).toEqual(['alpha']);

    const bothRegistry = createModuleRegistry({ appConfig, database });
    bothRegistry.register(moduleDefinition('alpha', { enhances: ['beta'] }));
    bothRegistry.register(moduleDefinition('beta', { enhances: ['alpha'] }));

    await expectModuleError(
      bothRegistry.activate({ moduleConfig: moduleConfig(['alpha', 'beta']) }),
      'MODULE_CIRCULAR_DEPENDENCY',
    );
  });

  it('rejects duplicate module registration', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(moduleDefinition('fixture'));

    const error = expectModuleErrorSync(
      () => registry.register(moduleDefinition('fixture')),
      'MODULE_ALREADY_REGISTERED',
    );

    expect(error.moduleId).toBe('fixture');
  });

  it('rejects invalid module definitions before activation', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });

    const error = expectModuleErrorSync(
      () => registry.register(moduleDefinition('fixture', { version: 0 })),
      'MODULE_INVALID_DEFINITION',
    );

    expect(error.moduleId).toBe('fixture');
    expect(registry.isRegistered('fixture')).toBe(false);
  });

  it('rejects malformed module configuration', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(moduleDefinition('fixture'));

    const enabledError = await expectModuleError(
      registry.activate({ moduleConfig: { fixture: { enabled: 'yes' } } }),
      'MODULE_CONFIG_INVALID',
      'fixture',
    );
    expect(enabledError.message).toContain('boolean "enabled"');

    const schemaRegistry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    schemaRegistry.register(
      moduleDefinition('fixture', {
        configSchema: z.object({ threshold: z.number().int().positive() }),
      }),
    );
    const schemaError = await expectModuleError(
      schemaRegistry.activate({
        moduleConfig: { fixture: { enabled: true, threshold: -1 } },
      }),
      'MODULE_CONFIG_INVALID',
      'fixture',
    );
    expect(schemaError.message).toContain('threshold');
  });

  it('rejects enabled configuration for a module that was never registered', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['ghost']) }),
      'MODULE_CONFIG_INVALID',
      'ghost',
    );
    expect(error.message).toContain('enabled in configuration but is not registered');
  });

  it('ignores disabled configuration entries for modules outside the composition', async () => {
    const appConfig = await makeAppConfig();
    const registry = createModuleRegistry({ appConfig, database });
    registry.register(moduleDefinition('fixture'));

    const report = await registry.activate({
      moduleConfig: {
        ...(appConfig.modules as unknown as ModuleConfigSource),
        fixture: { enabled: true },
        ghost: { enabled: false },
      },
    });

    expect(report.order).toEqual(['fixture']);
    expect(report.disabled.map((summary) => summary.id)).toEqual([]);
  });

  it('wraps module initialization failures with the module id and no raw internals', async () => {
    const secret = 'raw-password-should-never-leak';
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('fixture', {
        register: () => {
          throw new Error(`connect failed for ${secret}`);
        },
      }),
    );

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['fixture']) }),
      'MODULE_INITIALIZATION_FAILED',
      'fixture',
    );

    expect(error.message).toBe('Module "fixture" failed to initialize.');
    expect(error.message).not.toContain(secret);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('fails when a route declares an unknown permission', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('fixture', {
        register: (context) => {
          context.http.register({
            method: 'GET',
            path: '/v1/fixtures',
            permission: 'missing:read',
          });
        },
      }),
    );

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['fixture']) }),
      'MODULE_ROUTE_PERMISSION_UNKNOWN',
      'fixture',
    );

    expect(error.message).toContain('missing:read');
  });

  it('rejects duplicate permissions and duplicate routes', async () => {
    const appConfig = await makeAppConfig();
    const permissionsRegistry = createModuleRegistry({ appConfig, database });
    permissionsRegistry.register(
      moduleDefinition('alpha', {
        permissions: [{ key: 'shared:read', description: 'Read' }],
      }),
    );
    permissionsRegistry.register(
      moduleDefinition('beta', {
        permissions: [{ key: 'shared:read', description: 'Read too' }],
      }),
    );
    await expectModuleError(
      permissionsRegistry.activate({ moduleConfig: moduleConfig(['alpha', 'beta']) }),
      'MODULE_PERMISSION_DUPLICATE',
    );

    const routesRegistry = createModuleRegistry({ appConfig, database });
    routesRegistry.register(
      moduleDefinition('fixture', {
        register: (context) => {
          context.http.register({ method: 'GET', path: '/v1/fixtures' });
          context.http.register({ method: 'GET', path: '/v1/fixtures' });
        },
      }),
    );
    await expectModuleError(
      routesRegistry.activate({ moduleConfig: moduleConfig(['fixture']) }),
      'MODULE_ROUTE_DUPLICATE',
      'fixture',
    );
  });

  it('fails with a specific error when a required port has no provider', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('consumer', {
        consumes: [{ id: 'price-resolver', version: 1 }],
      }),
    );

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['consumer']) }),
      'MODULE_PORT_MISSING',
      'consumer',
    );

    expect(error.message).toContain('price-resolver');
  });

  it('reports a port version mismatch when only another version is available', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('consumer', {
        consumes: [{ id: 'price-resolver', version: 2 }],
      }),
    );
    registry.register(
      moduleDefinition('provider', {
        provides: [{ id: 'price-resolver', version: 1 }],
        publicApi: { resolve: () => 1 },
      }),
    );

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['consumer', 'provider']) }),
      'MODULE_PORT_VERSION_MISMATCH',
      'consumer',
    );

    expect(error.message).toContain('available versions: 1');
  });

  it('fails on ambiguous port providers', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('consumer', {
        consumes: [{ id: 'price-resolver', version: 1 }],
      }),
    );
    registry.register(
      moduleDefinition('provider-a', {
        provides: [{ id: 'price-resolver', version: 1 }],
        publicApi: { resolve: () => 1 },
      }),
    );
    registry.register(
      moduleDefinition('provider-b', {
        provides: [{ id: 'price-resolver', version: 1 }],
        publicApi: { resolve: () => 2 },
      }),
    );

    const error = await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['consumer', 'provider-a', 'provider-b']) }),
      'MODULE_PORT_AMBIGUOUS',
      'consumer',
    );

    expect(error.message).toContain('provider-a, provider-b');
  });

  it('allows a missing optional port and resolves its provider before the consumer', async () => {
    const appConfig = await makeAppConfig();
    const optionalRegistry = createModuleRegistry({ appConfig, database });
    optionalRegistry.register(
      moduleDefinition('consumer', {
        consumes: [{ id: 'email-provider', version: 1, optional: true }],
      }),
    );

    const optionalReport = await optionalRegistry.activate({
      moduleConfig: moduleConfig(['consumer']),
    });
    expect(optionalReport.ports).toEqual([]);

    const calls: string[] = [];
    let resolvedApi: unknown;
    const registry = createModuleRegistry({ appConfig, database });
    registry.register(
      moduleDefinition('consumer', {
        consumes: [{ id: 'price-resolver', version: 1 }],
        register: (context) => {
          calls.push('consumer');
          resolvedApi = context.port({ id: 'price-resolver', version: 1 });
        },
      }),
    );
    registry.register(
      moduleDefinition('provider', {
        provides: [{ id: 'price-resolver', version: 1 }],
        publicApi: { resolve: () => 42 },
        register: () => {
          calls.push('provider');
        },
      }),
    );

    const report = await registry.activate({
      moduleConfig: moduleConfig(['consumer', 'provider']),
    });

    expect(calls).toEqual(['provider', 'consumer']);
    expect(report.order).toEqual(['provider', 'consumer']);
    expect(resolvedApi).toEqual({ resolve: expect.any(Function) });
    expect(report.ports).toEqual([
      {
        id: 'price-resolver',
        version: 1,
        provider: 'provider',
        consumers: ['consumer'],
      },
    ]);
  });

  it('keeps configuration values and secrets out of the activation report', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('fixture', {
        configSchema: z.object({ token: z.string() }),
        permissions: [{ key: 'fixture:read', description: 'Read fixtures' }],
        register: (context) => {
          expect(context.config).toEqual({ token: 'module-token-secret' });
        },
      }),
    );

    const report = await registry.activate({
      moduleConfig: {
        fixture: {
          enabled: true,
          token: 'module-token-secret',
          password: 'extra-secret',
        },
      },
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('module-token-secret');
    expect(serialized).not.toContain('extra-secret');
    expect(serialized).not.toContain(VALID_DATABASE_URL);
  });

  it('exposes only the controlled core façade to modules', async () => {
    let context: ModuleContext | undefined;
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(
      moduleDefinition('fixture', {
        register: (moduleContext) => {
          context = moduleContext;
        },
      }),
    );

    await registry.activate({ moduleConfig: moduleConfig(['fixture']) });

    expect(context).toBeDefined();
    if (context === undefined) throw new Error('Module context was not captured.');
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.keys(context).sort()).toEqual([
      'appConfig',
      'config',
      'db',
      'http',
      'permissions',
      'port',
      'use',
    ]);
    expect(context.db).toBe(database);
    expect(context).not.toHaveProperty('pool');
    expect(context).not.toHaveProperty('modules');
  });

  it('builds a registry from an explicit static composition list', async () => {
    const appConfig = await makeAppConfig();
    const registry = composeModuleRegistry({
      appConfig,
      database,
      modules: [moduleDefinition('alpha', { requires: ['beta'] }), moduleDefinition('beta')],
    });

    expect(registry.isRegistered('alpha')).toBe(true);
    expect(registry.isRegistered('beta')).toBe(true);
    const report = await registry.activate({ moduleConfig: moduleConfig(['alpha', 'beta']) });
    expect(report.order).toEqual(['beta', 'alpha']);

    expectModuleErrorSync(
      () =>
        composeModuleRegistry({
          appConfig,
          database,
          modules: [moduleDefinition('alpha'), moduleDefinition('alpha')],
        }),
      'MODULE_ALREADY_REGISTERED',
    );
  });

  it('allows activation only once and rejects later registration', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });
    registry.register(moduleDefinition('fixture'));

    await registry.activate({ moduleConfig: moduleConfig(['fixture']) });

    expectModuleErrorSync(
      () => registry.register(moduleDefinition('another')),
      'MODULE_ALREADY_ACTIVATED',
    );
    await expectModuleError(
      registry.activate({ moduleConfig: moduleConfig(['fixture']) }),
      'MODULE_ALREADY_ACTIVATED',
    );
  });

  it('requires activation before exposing an activation report', async () => {
    const registry = createModuleRegistry({
      appConfig: await makeAppConfig(),
      database,
    });

    expectModuleErrorSync(() => registry.activationReport(), 'MODULE_REGISTRY_NOT_INITIALIZED');
  });
});
