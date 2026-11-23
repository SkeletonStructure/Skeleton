export { composeModuleRegistry, type StaticCompositionOptions } from './composition.js';
export {
  MODULE_ERROR_CODES,
  type ModuleErrorCode,
  type ModuleErrorOptions,
  ModuleRegistryError,
} from './errors.js';
export { type ActivationPlan, buildActivationPlan } from './graph.js';
export {
  type ActivateModulesOptions,
  createModuleRegistry,
  type ModuleRegistry,
  type ModuleRegistryOptions,
} from './registry.js';
export {
  type ActivationReport,
  MODULE_STABILITIES,
  type ModuleApiRegistry,
  type ModuleConfigSource,
  type ModuleContext,
  type ModuleDefinition,
  type ModuleHttpMethod,
  type ModuleHttpRegistrar,
  type ModuleId,
  type ModulePublicApi,
  type ModuleRouteDefinition,
  type ModuleStability,
  type ModuleSummary,
  type PermissionDefinition,
  type PermissionRegistrar,
  type PortApi,
  type PortApiRegistry,
  type PortBinding,
  type PortDefinition,
  type PortRequirement,
  type RegisteredModuleRoute,
} from './types.js';
