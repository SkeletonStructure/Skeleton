import type { ZodType } from 'zod';

import type { AppConfig } from '../config/index.js';
import { ModuleRegistryError } from './errors.js';
import {
  MODULE_STABILITIES,
  type ModuleConfigSource,
  type ModuleDefinition,
  type ModuleId,
  type ModuleSummary,
  type PermissionDefinition,
  type PortRequirement,
} from './types.js';

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PERMISSION_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?::[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPermissionKey(value: unknown): value is string {
  return typeof value === 'string' && PERMISSION_PATTERN.test(value);
}

function invalidDefinition(message: string, moduleId?: string): never {
  throw new ModuleRegistryError('MODULE_INVALID_DEFINITION', message, {
    ...(moduleId === undefined ? {} : { moduleId }),
  });
}

function invalidConfig(message: string, moduleId?: string): never {
  throw new ModuleRegistryError('MODULE_CONFIG_INVALID', message, {
    ...(moduleId === undefined ? {} : { moduleId }),
  });
}

function validateVersion(value: unknown, label: string, moduleId: ModuleId): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    invalidDefinition(`${label} must be a positive integer.`, moduleId);
  }
  return value as number;
}

export function validateModuleDefinitionId(value: unknown): ModuleId {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    invalidDefinition('Module id must be a lowercase kebab-case identifier.');
  }
  return value;
}

function validateIdList(
  value: unknown,
  field: 'requires' | 'enhances',
  moduleId: ModuleId,
): readonly ModuleId[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidDefinition(`Module ${field} must be an array.`, moduleId);

  const result: ModuleId[] = [];
  value.forEach((entry: unknown, index: number) => {
    if (typeof entry !== 'string' || !ID_PATTERN.test(entry)) {
      invalidDefinition(
        `Module ${field}[${index}] must be a lowercase kebab-case identifier.`,
        moduleId,
      );
    }
    if (entry === moduleId) {
      invalidDefinition(`Module ${field} cannot reference itself.`, moduleId);
    }
    if (result.includes(entry)) {
      invalidDefinition(`Module ${field} contains duplicate entry "${entry}".`, moduleId);
    }
    result.push(entry);
  });

  return result;
}

function validatePorts(
  value: unknown,
  field: 'provides' | 'consumes',
  moduleId: ModuleId,
): readonly PortRequirement[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidDefinition(`Module ${field} must be an array.`, moduleId);

  const result: PortRequirement[] = [];
  const seen = new Set<string>();

  value.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      invalidDefinition(`Module ${field}[${index}] must be an object.`, moduleId);
    }
    if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      invalidDefinition(
        `Module ${field}[${index}].id must be a lowercase kebab-case identifier.`,
        moduleId,
      );
    }
    const version = validateVersion(entry.version, `Module ${field}[${index}].version`, moduleId);
    const key = `${entry.id}@${version}`;
    if (seen.has(key)) {
      invalidDefinition(`Module ${field} contains duplicate port "${key}".`, moduleId);
    }
    seen.add(key);

    if (
      field === 'consumes' &&
      entry.optional !== undefined &&
      typeof entry.optional !== 'boolean'
    ) {
      invalidDefinition(`Module consumes[${index}].optional must be a boolean.`, moduleId);
    }

    if (field === 'consumes' && typeof entry.optional === 'boolean') {
      result.push({ id: entry.id, version, optional: entry.optional });
    } else {
      result.push({ id: entry.id, version });
    }
  });

  return result;
}

export function validatePermissionDefinition(
  value: unknown,
  moduleId: ModuleId,
  label = 'permission',
): PermissionDefinition {
  if (!isRecord(value)) {
    invalidDefinition(`Module ${label} must be an object.`, moduleId);
  }
  if (!isPermissionKey(value.key)) {
    invalidDefinition(`Module ${label} key must use resource:action[:scope] format.`, moduleId);
  }
  if (typeof value.description !== 'string' || value.description.trim() === '') {
    invalidDefinition(`Module ${label} description must be a non-empty string.`, moduleId);
  }
  return { key: value.key, description: value.description };
}

function validatePermissions(value: unknown, moduleId: ModuleId): readonly PermissionDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    invalidDefinition('Module permissions must be an array.', moduleId);
  }

  const result: PermissionDefinition[] = [];
  const seen = new Set<string>();

  value.forEach((entry: unknown, index: number) => {
    const permission = validatePermissionDefinition(entry, moduleId, `permissions[${index}]`);
    if (seen.has(permission.key)) {
      invalidDefinition(`Module permissions contains duplicate key "${permission.key}".`, moduleId);
    }
    seen.add(permission.key);
    result.push(permission);
  });

  return result;
}

export function validateModuleDefinition(value: unknown): asserts value is ModuleDefinition {
  if (!isRecord(value)) invalidDefinition('Module definition must be an object.');

  const moduleId = validateModuleDefinitionId(value.id);

  if (!MODULE_STABILITIES.includes(value.stability as (typeof MODULE_STABILITIES)[number])) {
    invalidDefinition('Module stability must be experimental, stable, or deprecated.', moduleId);
  }
  validateVersion(value.version, 'Module version', moduleId);
  if (typeof value.register !== 'function') {
    invalidDefinition('Module register() must be a function.', moduleId);
  }
  if (
    value.configSchema !== undefined &&
    typeof (value.configSchema as { safeParse?: unknown }).safeParse !== 'function'
  ) {
    invalidDefinition('Module configSchema must be a Zod schema.', moduleId);
  }

  const requires = validateIdList(value.requires, 'requires', moduleId);
  const enhances = validateIdList(value.enhances, 'enhances', moduleId);
  const overlap = requires.find((id) => enhances.includes(id));
  if (overlap !== undefined) {
    invalidDefinition(
      `Module "${overlap}" cannot be both a required and enhanced dependency.`,
      moduleId,
    );
  }

  const provides = validatePorts(value.provides, 'provides', moduleId);
  const consumes = validatePorts(value.consumes, 'consumes', moduleId);
  const providedKeys = new Set(provides.map((port) => `${port.id}@${port.version}`));
  for (const requirement of consumes) {
    if (providedKeys.has(`${requirement.id}@${requirement.version}`)) {
      invalidDefinition(
        `Module cannot consume port "${requirement.id}" version ${requirement.version} that it provides itself.`,
        moduleId,
      );
    }
  }

  validatePermissions(value.permissions, moduleId);
}

export function moduleSummary(definition: ModuleDefinition): ModuleSummary {
  return {
    id: definition.id,
    version: definition.version,
    stability: definition.stability,
    requires: [...(definition.requires ?? [])],
    enhances: [...(definition.enhances ?? [])],
    provides: [...(definition.provides ?? [])].map((port) => ({ ...port })),
    consumes: [...(definition.consumes ?? [])].map((port) => ({ ...port })),
  };
}

export function validateModuleConfigSource(
  value: unknown,
  knownModuleIds: ReadonlySet<ModuleId>,
): ModuleConfigSource {
  if (!isRecord(value)) invalidConfig('Module configuration must be an object.');

  const config: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      invalidConfig(`Configuration for module "${id}" must be an object.`, id);
    }
    if (typeof entry.enabled !== 'boolean') {
      invalidConfig(`Configuration for module "${id}" must include a boolean "enabled" value.`, id);
    }
    if (entry.enabled === true && !knownModuleIds.has(id)) {
      invalidConfig(`Module "${id}" is enabled in configuration but is not registered.`, id);
    }
    config[id] = { ...entry };
  }
  return config;
}

export function enabledModuleIds(
  moduleConfig: ModuleConfigSource,
  registrationOrder: readonly ModuleId[],
): readonly ModuleId[] {
  return registrationOrder.filter((id) => {
    const entry = moduleConfig[id];
    return isRecord(entry) && entry.enabled === true;
  });
}

export function parseModuleConfig<C>(
  definition: ModuleDefinition<C>,
  moduleConfig: ModuleConfigSource,
): C {
  const moduleId = definition.id;
  const rawConfig = moduleConfig[moduleId] ?? {};
  if (!isRecord(rawConfig)) {
    invalidConfig(`Configuration for module "${moduleId}" must be an object.`, moduleId);
  }

  const moduleValues: Record<string, unknown> = { ...rawConfig };
  delete moduleValues.enabled;

  const schema: ZodType<C> | undefined = definition.configSchema;
  if (schema === undefined) return moduleValues as C;

  const result = schema.safeParse(moduleValues);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    invalidConfig(`Configuration for module "${moduleId}" is invalid: ${details}.`, moduleId);
  }
  return result.data as C;
}

export function moduleConfigFromAppConfig(appConfig: AppConfig): ModuleConfigSource {
  return appConfig.modules as unknown as ModuleConfigSource;
}
