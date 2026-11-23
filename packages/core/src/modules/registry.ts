import type { AppConfig } from '../config/index.js';
import { type Database, getDatabase } from '../database/index.js';
import { ModuleRegistryError } from './errors.js';
import { buildActivationPlan } from './graph.js';
import type {
  ActivationReport,
  ModuleConfigSource,
  ModuleContext,
  ModuleDefinition,
  ModuleHttpMethod,
  ModuleHttpRegistrar,
  ModuleId,
  ModulePublicApi,
  PermissionDefinition,
  PermissionRegistrar,
  PortApi,
  PortDefinition,
  RegisteredModuleRoute,
} from './types.js';
import {
  enabledModuleIds,
  isPermissionKey,
  isRecord,
  moduleConfigFromAppConfig,
  moduleSummary,
  parseModuleConfig,
  validateModuleConfigSource,
  validateModuleDefinition,
  validateModuleDefinitionId,
  validatePermissionDefinition,
} from './validation.js';

const HTTP_METHODS: readonly ModuleHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface ModuleRegistryOptions {
  readonly appConfig: AppConfig;
  readonly database?: Database;
}

export interface ActivateModulesOptions {
  readonly moduleConfig?: ModuleConfigSource;
  readonly database?: Database;
}

class PermissionStore {
  private readonly definitions = new Map<string, PermissionDefinition>();

  forModule(moduleId: ModuleId): PermissionRegistrar {
    return {
      register: (definition) => this.register(definition, moduleId),
      has: (key) => this.has(key),
      list: () => this.list(),
    };
  }

  register(value: unknown, moduleId: ModuleId): void {
    const definition = validatePermissionDefinition(value, moduleId);
    if (this.definitions.has(definition.key)) {
      throw new ModuleRegistryError(
        'MODULE_PERMISSION_DUPLICATE',
        `Permission "${definition.key}" is registered more than once.`,
        { moduleId },
      );
    }
    this.definitions.set(definition.key, definition);
  }

  has(key: string): boolean {
    return this.definitions.has(key);
  }

  list(): readonly PermissionDefinition[] {
    return [...this.definitions.values()].map((definition) => ({ ...definition }));
  }

  assertRoutesUseKnownPermissions(
    routes: readonly { readonly moduleId: ModuleId; readonly permission?: string }[],
  ): void {
    for (const route of routes) {
      if (route.permission === undefined || this.has(route.permission)) continue;
      throw new ModuleRegistryError(
        'MODULE_ROUTE_PERMISSION_UNKNOWN',
        `Route declares permission "${route.permission}", which no enabled module registered.`,
        { moduleId: route.moduleId },
      );
    }
  }
}

function isValidRoutePath(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  if (path !== '/' && path.endsWith('/')) return false;
  if (path.includes('//') || /[?#\s]/.test(path)) return false;
  return /^\/(?:[A-Za-z0-9._~:-]+(?:\/[A-Za-z0-9._~:-]+)*)?$/.test(path);
}

class RouteRegistry {
  private readonly routes: RegisteredModuleRoute[] = [];

  forModule(moduleId: ModuleId): ModuleHttpRegistrar {
    return { register: (route) => this.record(moduleId, route) };
  }

  list(): readonly RegisteredModuleRoute[] {
    return this.routes.map((route) => ({ ...route }));
  }

  private record(moduleId: ModuleId, value: unknown): void {
    if (!isRecord(value)) {
      throw new ModuleRegistryError(
        'MODULE_ROUTE_INVALID',
        `Module "${moduleId}" registered an invalid route.`,
        { moduleId },
      );
    }
    if (
      typeof value.method !== 'string' ||
      !HTTP_METHODS.includes(value.method as ModuleHttpMethod)
    ) {
      throw new ModuleRegistryError(
        'MODULE_ROUTE_INVALID',
        `Module "${moduleId}" registered an unsupported HTTP method.`,
        { moduleId },
      );
    }
    if (!isValidRoutePath(value.path)) {
      throw new ModuleRegistryError(
        'MODULE_ROUTE_INVALID',
        `Module "${moduleId}" registered an invalid route path.`,
        { moduleId },
      );
    }
    if (value.permission !== undefined && !isPermissionKey(value.permission)) {
      throw new ModuleRegistryError(
        'MODULE_ROUTE_INVALID',
        `Module "${moduleId}" registered a route with an invalid permission key.`,
        { moduleId },
      );
    }

    const method = value.method as ModuleHttpMethod;
    const path = value.path;
    if (this.routes.some((route) => route.method === method && route.path === path)) {
      throw new ModuleRegistryError(
        'MODULE_ROUTE_DUPLICATE',
        `Route ${method} ${path} is registered more than once.`,
        { moduleId },
      );
    }

    this.routes.push(
      value.permission === undefined
        ? { method, path, moduleId }
        : { method, path, permission: value.permission, moduleId },
    );
  }
}

function copyReport(report: ActivationReport): ActivationReport {
  return {
    enabled: report.enabled.map((summary) => ({
      ...summary,
      requires: [...summary.requires],
      enhances: [...summary.enhances],
      provides: summary.provides.map((port) => ({ ...port })),
      consumes: summary.consumes.map((port) => ({ ...port })),
    })),
    disabled: report.disabled.map((summary) => ({
      ...summary,
      requires: [...summary.requires],
      enhances: [...summary.enhances],
      provides: summary.provides.map((port) => ({ ...port })),
      consumes: summary.consumes.map((port) => ({ ...port })),
    })),
    order: [...report.order],
    permissions: report.permissions.map((permission) => ({ ...permission })),
    routes: report.routes.map((route) => ({ ...route })),
    ports: report.ports.map((port) => ({ ...port, consumers: [...port.consumers] })),
  };
}

export class ModuleRegistry {
  private readonly definitions = new Map<ModuleId, ModuleDefinition>();
  private readonly registrationOrder: ModuleId[] = [];
  private readonly publicApis = new Map<ModuleId, unknown>();
  private activated = false;
  private report: ActivationReport | undefined;

  constructor(private readonly options: ModuleRegistryOptions) {}

  register(definition: ModuleDefinition): void {
    if (this.activated) {
      throw new ModuleRegistryError(
        'MODULE_ALREADY_ACTIVATED',
        'Modules cannot be registered after activation.',
      );
    }

    const id = validateModuleDefinitionId(definition.id);
    if (this.definitions.has(id)) {
      throw new ModuleRegistryError(
        'MODULE_ALREADY_REGISTERED',
        `Module "${id}" is already registered.`,
        { moduleId: id },
      );
    }

    validateModuleDefinition(definition);
    this.definitions.set(id, definition);
    this.registrationOrder.push(id);
  }

  isRegistered(id: ModuleId): boolean {
    return this.definitions.has(id);
  }

  isActivated(): boolean {
    return this.activated;
  }

  async activate(options: ActivateModulesOptions = {}): Promise<ActivationReport> {
    if (this.activated) {
      throw new ModuleRegistryError(
        'MODULE_ALREADY_ACTIVATED',
        'Modules have already been activated.',
      );
    }

    this.publicApis.clear();

    const moduleConfig = validateModuleConfigSource(
      options.moduleConfig ?? moduleConfigFromAppConfig(this.options.appConfig),
      new Set(this.registrationOrder),
    );
    const enabledIds = enabledModuleIds(moduleConfig, this.registrationOrder);
    const database = enabledIds.length === 0 ? undefined : this.resolveDatabase(options.database);
    const { order, ports, portProviders } = buildActivationPlan(enabledIds, this.definitions);
    const configs = new Map<ModuleId, unknown>(
      enabledIds.map((id) => [id, parseModuleConfig(this.requireDefinition(id), moduleConfig)]),
    );

    const permissions = new PermissionStore();
    for (const id of enabledIds) {
      for (const permission of this.requireDefinition(id).permissions ?? []) {
        permissions.register(permission, id);
      }
    }

    const routes = new RouteRegistry();
    for (const id of order) {
      const definition = this.requireDefinition(id);
      if (database === undefined) throw new Error('Database was not resolved for enabled modules.');

      const context = this.createContext(
        id,
        definition,
        configs.get(id),
        this.options.appConfig,
        database,
        permissions,
        routes,
        portProviders,
      );

      try {
        await definition.register(context);
      } catch (error) {
        if (error instanceof ModuleRegistryError) throw error;
        throw new ModuleRegistryError(
          'MODULE_INITIALIZATION_FAILED',
          `Module "${id}" failed to initialize.`,
          { moduleId: id, cause: error },
        );
      }

      if (definition.publicApi !== undefined) this.publicApis.set(id, definition.publicApi);
    }

    permissions.assertRoutesUseKnownPermissions(routes.list());

    this.report = {
      enabled: order.map((id) => moduleSummary(this.requireDefinition(id))),
      disabled: this.registrationOrder
        .filter((id) => !enabledIds.includes(id))
        .map((id) => moduleSummary(this.requireDefinition(id))),
      order: [...order],
      permissions: permissions.list(),
      routes: routes.list(),
      ports: ports.map((port) => ({ ...port, consumers: [...port.consumers] })),
    };
    this.activated = true;
    return copyReport(this.report);
  }

  activationReport(): ActivationReport {
    if (this.report === undefined) {
      throw new ModuleRegistryError(
        'MODULE_REGISTRY_NOT_INITIALIZED',
        'Module registry has not been activated.',
      );
    }
    return copyReport(this.report);
  }

  private resolveDatabase(override: Database | undefined): Database {
    if (override !== undefined) return override;
    if (this.options.database !== undefined) return this.options.database;

    try {
      return getDatabase();
    } catch (error) {
      throw new ModuleRegistryError(
        'MODULE_INITIALIZATION_FAILED',
        'Shared database is unavailable during module activation.',
        { cause: error },
      );
    }
  }

  private requireDefinition(id: ModuleId): ModuleDefinition {
    const definition = this.definitions.get(id);
    if (definition === undefined) {
      throw new ModuleRegistryError('MODULE_NOT_REGISTERED', `Module "${id}" is not registered.`, {
        moduleId: id,
      });
    }
    return definition;
  }

  private createContext(
    id: ModuleId,
    definition: ModuleDefinition,
    config: unknown,
    appConfig: AppConfig,
    database: Database,
    permissions: PermissionStore,
    routes: RouteRegistry,
    portProviders: ReadonlyMap<string, ModuleId>,
  ): ModuleContext {
    const requires = [...(definition.requires ?? [])];
    const consumes = [...(definition.consumes ?? [])];

    return Object.freeze({
      config,
      appConfig,
      db: database,
      permissions: permissions.forModule(id),
      http: routes.forModule(id),
      use: <T extends ModuleId>(dependencyId: T): ModulePublicApi<T> => {
        if (!requires.includes(dependencyId)) {
          throw new ModuleRegistryError(
            'MODULE_API_UNAVAILABLE',
            `Module "${id}" cannot use "${dependencyId}" because it is not a declared required dependency.`,
            { moduleId: id },
          );
        }
        const api = this.publicApis.get(dependencyId);
        if (api === undefined) {
          throw new ModuleRegistryError(
            'MODULE_API_UNAVAILABLE',
            `Module "${dependencyId}" does not expose a public API.`,
            { moduleId: id },
          );
        }
        return api as ModulePublicApi<T>;
      },
      port: <T extends string>(port: PortDefinition): PortApi<T> => {
        const declared = consumes.find(
          (requirement) => requirement.id === port.id && requirement.version === port.version,
        );
        if (declared === undefined) {
          throw new ModuleRegistryError(
            'MODULE_PORT_NOT_DECLARED',
            `Module "${id}" does not declare port "${port.id}" version ${port.version}.`,
            { moduleId: id },
          );
        }
        const provider = portProviders.get(`${port.id}@${port.version}`);
        if (provider === undefined) {
          throw new ModuleRegistryError(
            'MODULE_PORT_MISSING',
            `Port "${port.id}" version ${port.version} is not available to module "${id}".`,
            { moduleId: id },
          );
        }
        const api = this.publicApis.get(provider);
        if (api === undefined) {
          throw new ModuleRegistryError(
            'MODULE_PORT_API_MISSING',
            `Module "${provider}" provides port "${port.id}" but exposes no public API.`,
            { moduleId: id },
          );
        }
        return api as PortApi<T>;
      },
    });
  }
}

export function createModuleRegistry(options: ModuleRegistryOptions): ModuleRegistry {
  return new ModuleRegistry(options);
}
