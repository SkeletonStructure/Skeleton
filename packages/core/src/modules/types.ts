import type { ZodType } from 'zod';

import type { AppConfig } from '../config/index.js';
import type { Database } from '../database/index.js';

export const MODULE_STABILITIES = ['experimental', 'stable', 'deprecated'] as const;

export type ModuleStability = (typeof MODULE_STABILITIES)[number];
export type ModuleId = string;
export type ModuleHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Applications can augment this interface to make `ctx.use()` type-safe.
 * Core never imports a concrete module.
 */
export interface ModuleApiRegistry {
  readonly [moduleId: string]: unknown;
}

/**
 * Applications can augment this interface to make `ctx.port()` type-safe.
 */
export interface PortApiRegistry {
  readonly [portId: string]: unknown;
}

export type ModulePublicApi<T extends ModuleId> = T extends keyof ModuleApiRegistry
  ? ModuleApiRegistry[T]
  : unknown;

export type PortApi<T extends string> = T extends keyof PortApiRegistry
  ? PortApiRegistry[T]
  : unknown;

export interface PermissionDefinition {
  readonly key: string;
  readonly description: string;
}

export interface PortDefinition {
  readonly id: string;
  readonly version: number;
}

export interface PortRequirement extends PortDefinition {
  readonly optional?: boolean;
}

export interface ModuleRouteDefinition {
  readonly method: ModuleHttpMethod;
  readonly path: string;
  readonly permission?: string;
}

export interface RegisteredModuleRoute extends ModuleRouteDefinition {
  readonly moduleId: ModuleId;
}

export interface PermissionRegistrar {
  register(definition: PermissionDefinition): void;
  has(key: string): boolean;
  list(): readonly PermissionDefinition[];
}

export interface ModuleHttpRegistrar {
  register(route: ModuleRouteDefinition): void;
}

export interface ModuleContext<C = unknown> {
  readonly config: C;
  readonly appConfig: AppConfig;
  readonly db: Database;
  readonly permissions: PermissionRegistrar;
  readonly http: ModuleHttpRegistrar;
  use<T extends ModuleId>(id: T): ModulePublicApi<T>;
  port<T extends string>(port: PortDefinition): PortApi<T>;
}

export interface ModuleDefinition<C = unknown> {
  readonly id: ModuleId;
  readonly version: number;
  readonly stability: ModuleStability;
  readonly requires?: readonly ModuleId[];
  readonly enhances?: readonly ModuleId[];
  readonly provides?: readonly PortDefinition[];
  readonly consumes?: readonly PortRequirement[];
  readonly configSchema?: ZodType<C>;
  readonly permissions?: readonly PermissionDefinition[];
  register(context: ModuleContext<C>): void | Promise<void>;
  readonly publicApi?: unknown;
}

export interface ModuleSummary {
  readonly id: ModuleId;
  readonly version: number;
  readonly stability: ModuleStability;
  readonly requires: readonly ModuleId[];
  readonly enhances: readonly ModuleId[];
  readonly provides: readonly PortDefinition[];
  readonly consumes: readonly PortRequirement[];
}

export interface PortBinding {
  readonly id: string;
  readonly version: number;
  readonly provider: ModuleId;
  readonly consumers: readonly ModuleId[];
}

export interface ActivationReport {
  readonly enabled: readonly ModuleSummary[];
  readonly disabled: readonly ModuleSummary[];
  readonly order: readonly ModuleId[];
  readonly permissions: readonly PermissionDefinition[];
  readonly routes: readonly RegisteredModuleRoute[];
  readonly ports: readonly PortBinding[];
}

export type ModuleConfigSource = Readonly<Record<string, unknown>>;
