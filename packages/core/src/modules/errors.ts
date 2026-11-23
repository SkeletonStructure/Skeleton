export const MODULE_ERROR_CODES = [
  'MODULE_REGISTRY_NOT_INITIALIZED',
  'MODULE_INVALID_DEFINITION',
  'MODULE_ALREADY_REGISTERED',
  'MODULE_NOT_REGISTERED',
  'MODULE_CONFIG_INVALID',
  'MODULE_MISSING_DEPENDENCY',
  'MODULE_CIRCULAR_DEPENDENCY',
  'MODULE_PORT_MISSING',
  'MODULE_PORT_AMBIGUOUS',
  'MODULE_PORT_VERSION_MISMATCH',
  'MODULE_PORT_API_MISSING',
  'MODULE_PORT_NOT_DECLARED',
  'MODULE_PERMISSION_DUPLICATE',
  'MODULE_ROUTE_DUPLICATE',
  'MODULE_ROUTE_INVALID',
  'MODULE_ROUTE_PERMISSION_UNKNOWN',
  'MODULE_API_UNAVAILABLE',
  'MODULE_INITIALIZATION_FAILED',
  'MODULE_ALREADY_ACTIVATED',
] as const;

export type ModuleErrorCode = (typeof MODULE_ERROR_CODES)[number];

export interface ModuleErrorOptions {
  readonly moduleId?: string;
  readonly cause?: unknown;
}

export class ModuleRegistryError extends Error {
  readonly code: ModuleErrorCode;
  readonly moduleId?: string;

  constructor(code: ModuleErrorCode, message: string, options: ModuleErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ModuleRegistryError';
    this.code = code;
    if (options.moduleId !== undefined) this.moduleId = options.moduleId;
  }
}
