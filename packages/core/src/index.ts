export const FOUNDATION_NAME = 'SkeletonStructure' as const;

export interface FoundationIdentity {
  readonly name: typeof FOUNDATION_NAME;
}

export function foundationIdentity(): FoundationIdentity {
  return { name: FOUNDATION_NAME };
}

export * as config from './config/index.js';
export * as database from './database/index.js';
export * as modules from './modules/index.js';
