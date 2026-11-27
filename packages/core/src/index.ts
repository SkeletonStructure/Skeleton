export const FOUNDATION_NAME = 'SkeletonStructure' as const;

export interface FoundationIdentity {
  readonly name: typeof FOUNDATION_NAME;
}

export function foundationIdentity(): FoundationIdentity {
  return { name: FOUNDATION_NAME };
}

export * as api from './api/index.js';
export * as config from './config/index.js';
export * as database from './database/index.js';
export * as lifecycle from './lifecycle/index.js';
export * as logging from './logging/index.js';
export * as modules from './modules/index.js';
export * as security from './security/index.js';
