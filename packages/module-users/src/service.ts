import { HttpError, validationError } from '@skeletonstructure/core/api';
import { and, eq } from 'drizzle-orm';
import { rolePermissions, userRoles, users } from './schema.js';
import type {
  AuthUser,
  CreateUserInput,
  UserIdentity,
  UserProfile,
  UsersExecutor,
} from './types.js';

export const DEFAULT_USER_ROLE = 'user';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function containsWhitespace(value: string): boolean {
  for (const character of value) {
    if (character.trim() === '') return true;
  }
  return false;
}

export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;

  const separator = email.indexOf('@');
  if (separator <= 0 || separator !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (domain.length === 0 || containsWhitespace(local) || containsWhitespace(domain)) return false;

  // The legacy regex accepted a dot anywhere before the final character,
  // including domains such as `example.com.` and `example..com`.
  for (let index = 1; index < domain.length - 1; index += 1) {
    if (domain[index] === '.') return true;
  }
  return false;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly cause?: { readonly code?: unknown };
  };
  return candidate.code === '23505' || candidate.cause?.code === '23505';
}

function identity(row: {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
}): UserIdentity {
  return {
    id: row.id,
    email: row.email,
    ...(row.displayName === null ? {} : { displayName: row.displayName }),
  };
}

export interface UsersService {
  createUser(input: CreateUserInput, executor?: UsersExecutor): Promise<UserIdentity>;
  findAuthUserByEmail(email: string): Promise<AuthUser | undefined>;
  findAuthUserById(id: string): Promise<AuthUser | undefined>;
  getProfile(userId: string): Promise<UserProfile | undefined>;
  listRoles(userId: string, executor?: UsersExecutor): Promise<readonly string[]>;
  listPermissions(userId: string, executor?: UsersExecutor): Promise<readonly string[]>;
  assignRole(userId: string, role: string, executor?: UsersExecutor): Promise<void>;
  setPasswordHash(userId: string, passwordHash: string, executor?: UsersExecutor): Promise<void>;
  getOwnedProfile(principalId: string, targetId: string): Promise<UserProfile>;
  updateOwnedProfile(
    principalId: string,
    targetId: string,
    displayName: string | undefined,
    allowSelfUpdate: boolean,
  ): Promise<UserProfile>;
}

export function createUsersService(
  database: UsersExecutor,
  options: { readonly defaultRole?: string } = {},
): UsersService {
  const defaultRole = options.defaultRole ?? DEFAULT_USER_ROLE;

  async function listRolesFor(userId: string, executor: UsersExecutor): Promise<readonly string[]> {
    const rows = await executor
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return [...new Set(rows.map((row) => row.role))].sort();
  }

  async function listPermissionsFor(
    userId: string,
    executor: UsersExecutor,
  ): Promise<readonly string[]> {
    const rows = await executor
      .select({ permission: rolePermissions.permission })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.role, rolePermissions.role))
      .where(eq(userRoles.userId, userId));
    return [...new Set(rows.map((row) => row.permission))].sort();
  }

  async function authUserFor(row: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string | null;
    readonly passwordHash: string;
  }): Promise<AuthUser> {
    return {
      ...identity(row),
      passwordHash: row.passwordHash,
      roles: await listRolesFor(row.id, database),
      permissions: await listPermissionsFor(row.id, database),
    };
  }

  return {
    async createUser(input, executor = database) {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) {
        throw validationError([{ path: 'email', message: 'Enter a valid email address.' }]);
      }
      if (input.passwordHash.length === 0) {
        throw validationError([{ path: 'password', message: 'Password hash is invalid.' }]);
      }

      try {
        const rows = await executor
          .insert(users)
          .values({
            email,
            passwordHash: input.passwordHash,
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          })
          .returning({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
          });

        const created = rows[0];
        if (created === undefined) throw new Error('User insert returned no row.');
        await executor.insert(userRoles).values({ userId: created.id, role: defaultRole });
        return identity(created);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError({
            status: 409,
            code: 'CONFLICT',
            message: 'An account with that email already exists.',
            cause: error,
          });
        }
        throw error;
      }
    },

    async findAuthUserByEmail(email) {
      const rows = await database
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.email, normalizeEmail(email)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? undefined : authUserFor(row);
    },

    async findAuthUserById(id) {
      const rows = await database
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      const row = rows[0];
      return row === undefined ? undefined : authUserFor(row);
    },

    async getProfile(userId) {
      const rows = await database
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return undefined;
      return {
        ...identity(row),
        roles: await listRolesFor(userId, database),
        permissions: await listPermissionsFor(userId, database),
      };
    },

    async listRoles(userId, executor = database) {
      return listRolesFor(userId, executor);
    },

    async listPermissions(userId, executor = database) {
      return listPermissionsFor(userId, executor);
    },

    async assignRole(userId, role, executor = database) {
      await executor.insert(userRoles).values({ userId, role }).onConflictDoNothing();
    },

    async setPasswordHash(userId, passwordHash, executor = database) {
      await executor
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId));
    },

    async getOwnedProfile(principalId, targetId) {
      if (principalId !== targetId) {
        throw new HttpError({ status: 403, code: 'FORBIDDEN', message: 'Ownership check failed.' });
      }
      const profile = await this.getProfile(targetId);
      if (profile === undefined) {
        throw new HttpError({ status: 404, code: 'NOT_FOUND' });
      }
      return profile;
    },

    async updateOwnedProfile(principalId, targetId, displayName, allowSelfUpdate) {
      if (principalId !== targetId) {
        throw new HttpError({ status: 403, code: 'FORBIDDEN', message: 'Ownership check failed.' });
      }
      if (!allowSelfUpdate) {
        throw new HttpError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Self updates are disabled.',
        });
      }
      if (displayName !== undefined && displayName.length > 100) {
        throw validationError([
          { path: 'displayName', message: 'Must be at most 100 characters.' },
        ]);
      }

      await database
        .update(users)
        .set({
          ...(displayName === undefined ? {} : { displayName }),
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, targetId), eq(users.id, principalId)));

      const profile = await this.getProfile(targetId);
      if (profile === undefined) {
        throw new HttpError({ status: 404, code: 'NOT_FOUND' });
      }
      return profile;
    },
  };
}
