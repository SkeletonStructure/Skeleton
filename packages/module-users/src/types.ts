import type { Database, DatabaseTransaction } from '@skeletonstructure/core/database';

export type UsersExecutor = Database['db'] | DatabaseTransaction;

export interface UserIdentity {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string;
}

export interface UserProfile extends UserIdentity {
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface AuthUser extends UserIdentity {
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface CreateUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName?: string;
}

export interface UsersConfig {
  readonly allowSelfUpdate: boolean;
}
