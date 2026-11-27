import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type ApiRouteDefinition,
  HttpError,
  successEnvelopeSchema,
} from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { AuditSink, Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import { z } from 'zod';
import * as schema from './schema.js';
import { createUsersService, type UsersService } from './service.js';
import type { UsersConfig } from './types.js';

export { rolePermissions, userRoles, users } from './schema.js';
export {
  createUsersService,
  DEFAULT_USER_ROLE,
  isValidEmail,
  normalizeEmail,
  type UsersService,
} from './service.js';
export type {
  AuthUser,
  CreateUserInput,
  UserIdentity,
  UserProfile,
  UsersConfig,
  UsersExecutor,
} from './types.js';

export const usersModuleConfigSchema = z.object({
  allowSelfUpdate: z.boolean().default(true),
});

export const USERS_PERMISSIONS = [
  { key: 'users:read:self', description: 'Read the current user profile.' },
  { key: 'users:update:self', description: 'Update the current user profile.' },
] as const;

const profileDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'email', 'roles', 'permissions'],
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    displayName: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
    permissions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface UsersModuleOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly audit?: AuditSink;
}

export interface UsersModule {
  readonly definition: ModuleDefinition<UsersConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: UsersService;
}

interface RouteRequest {
  readonly requestId: string;
  readonly principal?: { readonly id: string };
  readonly body?: unknown;
}

function principalId(request: RouteRequest): string {
  const id = request.principal?.id;
  if (id === undefined) {
    throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
  }
  return id;
}

/** Builds the optional `users` module without importing it into core. */
export function createUsersModule(options: UsersModuleOptions): UsersModule {
  const api = createUsersService(options.database.db, {
    ...(options.audit === undefined ? {} : { audit: options.audit }),
  });
  const allowSelfUpdate = options.appConfig.modules.users.allowSelfUpdate;

  const routeHandlers: readonly ApiRouteDefinition[] = [
    {
      moduleId: 'users',
      method: 'GET',
      path: '/users/me',
      permission: 'users:read:self',
      schema: successEnvelopeSchema(profileDataSchema),
      handler: async (request: RouteRequest) =>
        api.getOwnedProfile(principalId(request), principalId(request)),
    },
    ...(allowSelfUpdate
      ? [
          {
            moduleId: 'users',
            method: 'PATCH' as const,
            path: '/users/me',
            permission: 'users:update:self',
            schema: {
              ...successEnvelopeSchema(profileDataSchema),
              body: {
                type: 'object',
                additionalProperties: false,
                maxProperties: 1,
                properties: { displayName: { type: 'string', minLength: 1, maxLength: 100 } },
              },
            },
            handler: async (request: RouteRequest) => {
              const id = principalId(request);
              const body = (request.body ?? {}) as { readonly displayName?: string };
              return api.updateOwnedProfile(id, id, body.displayName, allowSelfUpdate);
            },
          },
        ]
      : []),
  ];

  const definition: ModuleDefinition<UsersConfig> = {
    id: 'users',
    version: 1,
    stability: 'experimental',
    configSchema: usersModuleConfigSchema,
    permissions: [...USERS_PERMISSIONS],
    register(context) {
      context.http.register({ method: 'GET', path: '/users/me', permission: 'users:read:self' });
      if (context.config.allowSelfUpdate) {
        context.http.register({
          method: 'PATCH',
          path: '/users/me',
          permission: 'users:update:self',
        });
      }
    },
    publicApi: api,
  };

  return { definition, routeHandlers, api };
}

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));
const BUILT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function usersMigrationsFolder(): string {
  return existsSync(SOURCE_MIGRATIONS_FOLDER) ? SOURCE_MIGRATIONS_FOLDER : BUILT_MIGRATIONS_FOLDER;
}

export async function runUsersMigrations(database: Database) {
  return database.migrate({ migrationsFolder: usersMigrationsFolder() });
}

export { schema };
