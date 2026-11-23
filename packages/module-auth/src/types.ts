import type { RequestPrincipal } from '@skeletonstructure/core/api';
import type { UserIdentity } from '@skeletonstructure/module-users';

export interface SessionTokenPair {
  readonly token: string;
  readonly csrfToken: string;
  readonly tokenHash: string;
  readonly csrfHash: string;
  readonly expiresAt: Date;
}

export interface AuthenticatedProfile {
  readonly user: UserIdentity;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly csrfToken: string;
}

export interface AuthConfig {
  readonly passwordMinLength: number;
}

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface PasswordResetConfirmInput {
  readonly token: string;
  readonly password: string;
}

export interface AuthenticatedResult {
  readonly user: UserIdentity;
  readonly session: SessionTokenPair;
  readonly principal: RequestPrincipal;
}
