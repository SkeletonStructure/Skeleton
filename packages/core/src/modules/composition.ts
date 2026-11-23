import {
  createModuleRegistry,
  type ModuleRegistry,
  type ModuleRegistryOptions,
} from './registry.js';
import type { ModuleDefinition } from './types.js';

export interface StaticCompositionOptions extends ModuleRegistryOptions {
  /** Explicit, checked-in list; modules are never discovered dynamically. */
  readonly modules: readonly ModuleDefinition[];
}

/**
 * Builds the registry from a static composition list. Applications own the list;
 * core only validates and activates the definitions it is given.
 */
export function composeModuleRegistry(options: StaticCompositionOptions): ModuleRegistry {
  const coreOptions: ModuleRegistryOptions =
    options.database === undefined
      ? { appConfig: options.appConfig }
      : { appConfig: options.appConfig, database: options.database };

  const registry = createModuleRegistry(coreOptions);
  for (const definition of options.modules) registry.register(definition);
  return registry;
}
