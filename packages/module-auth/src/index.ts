import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import '@fastify/cookie';

import {
  type ApiRouteDefinition,
  HttpError,
  successEnvelopeSchema,
} from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { AuditSink, Database } from '@skeletonstructure/core/database';
import type { ModuleDefinition } from '@skeletonstructure/core/modules';
import { runUsersMigrations, type UsersService } from '@skeletonstructure/module-users';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createConsoleEmailProvider, type EmailProvider } from './email.js';
import { type AuthService, createAuthService } from './service.js';
import type { AuthConfig, LoginInput, PasswordResetConfirmInput, RegisterInput } from './types.js';

export type { EmailDeliveryResult, EmailMessage, EmailProvider } from './email.js';
export { createConsoleEmailProvider, createInMemoryEmailProvider } from './email.js';
export { passwordResetTokens, sessions } from './schema.js';
export type { AuthService, AuthServiceOptions } from './service.js';
export { createAuthService } from './service.js';
export type {
  AuthConfig,
  AuthenticatedProfile,
  AuthenticatedResult,
  LoginInput,
  PasswordResetConfirmInput,
  RegisterInput,
  SessionTokenPair,
} from './types.js';

export const authModuleConfigSchema = z.object({
  passwordMinLength: z.number().int().min(12).default(12),
});

/** Mirrors the consumer-side port ID without making auth depend on orders. */
export const BUYER_CONTEXT_PORT = { id: 'buyer-context', version: 1 } as const;

const AUTH_RATE_LIMIT = { max: 10, timeWindow: 60_000 } as const;

const userSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'email'],
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    displayName: { type: 'string' },
  },
} as const;

const authenticatedDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user', 'csrfToken'],
  properties: {
    user: userSchema,
    csrfToken: { type: 'string' },
  },
} as const;

const meDataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user', 'roles', 'permissions', 'csrfToken'],
  properties: {
    user: userSchema,
    roles: { type: 'array', items: { type: 'string' } },
    permissions: { type: 'array', items: { type: 'string' } },
    csrfToken: { type: 'string' },
  },
} as const;

function asBody(request: FastifyRequest): Record<string, unknown> {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
    throw new HttpError({ status: 400, code: 'VALIDATION_ERROR' });
  }
  return request.body as Record<string, unknown>;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function auditContext(request: FastifyRequest) {
  return {
    requestId: request.requestId,
    ...(request.principal === undefined ? {} : { actorId: request.principal.id }),
  };
}

export interface AuthModuleOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly users: UsersService;
  readonly emailProvider?: EmailProvider;
  readonly audit?: AuditSink;
}

export interface AuthModule {
  readonly definition: ModuleDefinition<AuthConfig>;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly api: AuthService;
}

/** Builds the optional `auth` module without importing it into core. */
export function createAuthModule(options: AuthModuleOptions): AuthModule {
  const api = createAuthService({
    appConfig: options.appConfig,
    database: options.database,
    users: options.users,
    emailProvider: options.emailProvider ?? createConsoleEmailProvider(),
    ...(options.audit === undefined ? {} : { audit: options.audit }),
  });
  const passwordMinLength = options.appConfig.modules.auth.passwordMinLength;

  const passwordSchema = { type: 'string', minLength: passwordMinLength, maxLength: 200 } as const;

  const routeHandlers: readonly ApiRouteDefinition[] = [
    {
      moduleId: 'auth',
      method: 'POST',
      path: '/auth/register',
      rateLimit: AUTH_RATE_LIMIT,
      schema: {
        ...successEnvelopeSchema(authenticatedDataSchema),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 254 },
            password: passwordSchema,
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        const body = asBody(request);
        const input: RegisterInput = {
          email: readString(body, 'email'),
          password: readString(body, 'password'),
          ...(typeof body.displayName === 'string' ? { displayName: body.displayName } : {}),
        };
        const result = await api.register(input, reply, auditContext(request));
        return {
          user: result.user,
          csrfToken: result.session.csrfToken,
        };
      },
    },
    {
      moduleId: 'auth',
      method: 'POST',
      path: '/auth/login',
      rateLimit: AUTH_RATE_LIMIT,
      schema: {
        ...successEnvelopeSchema(authenticatedDataSchema),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 254 },
            password: passwordSchema,
          },
        },
      },
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        const body = asBody(request);
        const input: LoginInput = {
          email: readString(body, 'email'),
          password: readString(body, 'password'),
        };
        const result = await api.login(
          input,
          api.presentedToken(request),
          reply,
          auditContext(request),
        );
        return {
          user: result.user,
          csrfToken: result.session.csrfToken,
        };
      },
    },
    {
      moduleId: 'auth',
      method: 'POST',
      path: '/auth/logout',
      requireAuth: true,
      schema: successEnvelopeSchema({
        type: 'object',
        additionalProperties: false,
        properties: {},
      }),
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        await api.logout(api.presentedToken(request), reply, auditContext(request));
        return {};
      },
    },
    {
      moduleId: 'auth',
      method: 'GET',
      path: '/auth/me',
      requireAuth: true,
      schema: successEnvelopeSchema(meDataSchema),
      handler: async (request: FastifyRequest) => api.currentUser(request),
    },
    {
      moduleId: 'auth',
      method: 'POST',
      path: '/auth/password-reset/request',
      rateLimit: AUTH_RATE_LIMIT,
      schema: {
        ...successEnvelopeSchema({
          type: 'object',
          additionalProperties: false,
          required: ['message'],
          properties: { message: { type: 'string' } },
        }),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: { email: { type: 'string', minLength: 3, maxLength: 254 } },
        },
      },
      handler: async (request: FastifyRequest) => {
        const body = asBody(request);
        await api.requestPasswordReset(readString(body, 'email'), auditContext(request));
        return {
          message: 'If an account exists, a password reset message has been sent.',
        };
      },
    },
    {
      moduleId: 'auth',
      method: 'POST',
      path: '/auth/password-reset/confirm',
      rateLimit: AUTH_RATE_LIMIT,
      schema: {
        ...successEnvelopeSchema(authenticatedDataSchema),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'password'],
          properties: {
            token: { type: 'string', minLength: 20, maxLength: 512 },
            password: passwordSchema,
          },
        },
      },
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        const body = asBody(request);
        const input: PasswordResetConfirmInput = {
          token: readString(body, 'token'),
          password: readString(body, 'password'),
        };
        const result = await api.confirmPasswordReset(input, reply, auditContext(request));
        return {
          user: result.user,
          csrfToken: result.session.csrfToken,
        };
      },
    },
  ];

  const definition: ModuleDefinition<AuthConfig> = {
    id: 'auth',
    version: 1,
    stability: 'experimental',
    requires: ['users'],
    provides: [BUYER_CONTEXT_PORT],
    configSchema: authModuleConfigSchema,
    register(context) {
      for (const route of routeHandlers) {
        context.http.register({
          method: route.method,
          path: route.path,
          ...(route.permission === undefined ? {} : { permission: route.permission }),
        });
      }
    },
    publicApi: api,
  };

  return { definition, routeHandlers, api };
}

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));
const BUILT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function authMigrationsFolder(): string {
  return existsSync(SOURCE_MIGRATIONS_FOLDER) ? SOURCE_MIGRATIONS_FOLDER : BUILT_MIGRATIONS_FOLDER;
}

export async function runAuthMigrations(database: Database) {
  return database.migrate({ migrationsFolder: authMigrationsFolder() });
}

/** Applies core, users, then auth migrations in dependency order. */
export async function runAuthUsersMigrations(database: Database) {
  const core = await database.migrate();
  const users = await runUsersMigrations(database);
  const auth = await runAuthMigrations(database);
  return { core, users, auth };
}

export type { AuthUsersComposition, AuthUsersCompositionOptions } from './composition.js';
export { createAuthUsersComposition } from './composition.js';
