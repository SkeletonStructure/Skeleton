import {
  type Authenticator,
  type CsrfGuard,
  HttpError,
  type RequestPrincipal,
  validationError,
} from '@skeletonstructure/core/api';
import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database, DatabaseTransaction } from '@skeletonstructure/core/database';
import {
  hashPassword,
  hashToken,
  needsPasswordRehash,
  newCsrfToken,
  newSessionToken,
  timingSafeTokenEqual,
  verifyPassword,
} from '@skeletonstructure/core/security';
import { isValidEmail, normalizeEmail, type UsersService } from '@skeletonstructure/module-users';
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';

import type { EmailProvider } from './email.js';
import { passwordResetTokens, sessions } from './schema.js';
import type {
  AuthConfig,
  AuthenticatedProfile,
  AuthenticatedResult,
  LoginInput,
  PasswordResetConfirmInput,
  RegisterInput,
  SessionTokenPair,
} from './types.js';

/** Constant-cost work for unknown email addresses and invalid reset tokens. */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$eSyuRuTjF7c+9KyWxxKhyA$1ShbJPvLsE+0HHn2ozEv1d0a4HzDCEZvmKqcLsTI3Kc';
const DUMMY_PASSWORD = 'dummy-password-for-timing-equalization';
const PASSWORD_RESET_TTL_MINUTES = 30;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface AuthRequestLike {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly cookies?: Readonly<Record<string, string | undefined>>;
}

interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'strict';
  readonly path: '/';
  readonly maxAge: number;
}

interface SessionReplyLike {
  setCookie(name: string, value: string, options: SessionCookieOptions): void;
  clearCookie(name: string, options: { readonly path: '/' }): void;
}

interface SessionRow {
  readonly tokenHash: string;
  readonly userId: string;
  readonly csrfHash: string;
  readonly expiresAt: Date;
}

interface AuthBuyerRequest {
  readonly principal?: { readonly id?: string };
}

interface AuthBuyerRef {
  readonly kind: 'user';
  readonly id: string;
}

interface AuthOrderBuyerRef {
  readonly buyerKind: string;
  readonly buyerRef: string;
}

export interface AuthService {
  readonly authenticator: Authenticator;
  readonly csrfGuard: CsrfGuard;
  presentedToken(request: AuthRequestLike): string | undefined;
  register(input: RegisterInput, reply: SessionReplyLike): Promise<AuthenticatedResult>;
  login(
    input: LoginInput,
    presentedToken: string | undefined,
    reply: SessionReplyLike,
  ): Promise<AuthenticatedResult>;
  logout(token: string | undefined, reply: SessionReplyLike): Promise<void>;
  currentUser(request: AuthRequestLike): Promise<AuthenticatedProfile>;
  /** `BuyerContextPort` implementation for authenticated users in v0.1. */
  currentBuyer(request: AuthBuyerRequest): Promise<AuthBuyerRef>;
  owns(order: AuthOrderBuyerRef, buyer: AuthBuyerRef): boolean;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(
    input: PasswordResetConfirmInput,
    reply: SessionReplyLike,
  ): Promise<AuthenticatedResult>;
  cleanupExpired(): Promise<{
    readonly sessionsDeleted: number;
    readonly resetTokensDeleted: number;
  }>;
}

export interface AuthServiceOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly users: UsersService;
  readonly emailProvider: EmailProvider;
}

function headerValue(headers: AuthRequestLike['headers'], name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

function bearerToken(request: AuthRequestLike): string | undefined {
  const authorization = headerValue(request.headers, 'authorization');
  if (authorization === undefined) return undefined;

  const prefixLength = 'Bearer'.length;
  if (authorization.slice(0, prefixLength).toLowerCase() !== 'bearer') return undefined;

  let index = prefixLength;
  while (index < authorization.length && authorization[index]?.trim() === '') {
    index += 1;
  }
  if (index === prefixLength) return undefined;

  const token = authorization.slice(index).trim();
  return token.length > 0 ? token : undefined;
}

function validatePassword(password: string, minLength: number): void {
  if (typeof password !== 'string' || password.length < minLength || password.length > 200) {
    throw validationError([
      { path: 'password', message: `Must be at least ${minLength} characters.` },
    ]);
  }
}

function validateResetToken(token: string): void {
  if (typeof token !== 'string' || token.length < 20 || token.length > 512) {
    throw validationError([{ path: 'token', message: 'Invalid or expired reset token.' }]);
  }
}

function newSessionPair(maxAgeHours: number): SessionTokenPair {
  const token = newSessionToken();
  const csrfToken = newCsrfToken();
  return {
    token,
    csrfToken,
    tokenHash: hashToken(token),
    csrfHash: hashToken(csrfToken),
    expiresAt: new Date(Date.now() + maxAgeHours * 60 * 60 * 1000),
  };
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const { appConfig, database, users, emailProvider } = options;
  const authConfig = appConfig.modules.auth as AuthConfig;
  const cookieConfig = appConfig.security.sessionCookie;
  const csrfEnabled = appConfig.security.csrf.enabled;

  function cookieToken(request: AuthRequestLike): string | undefined {
    const token = request.cookies?.[cookieConfig.name];
    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  function presentedToken(request: AuthRequestLike): string | undefined {
    return bearerToken(request) ?? cookieToken(request);
  }

  async function findSession(
    token: string | undefined,
    executor: Database['db'] | DatabaseTransaction = database.db,
  ): Promise<SessionRow | undefined> {
    if (token === undefined) return undefined;
    const rows = await executor
      .select({
        tokenHash: sessions.tokenHash,
        userId: sessions.userId,
        csrfHash: sessions.csrfHash,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async function insertSession(
    userId: string,
    pair: SessionTokenPair,
    executor: Database['db'] | DatabaseTransaction,
  ): Promise<void> {
    await executor.insert(sessions).values({
      tokenHash: pair.tokenHash,
      userId,
      csrfHash: pair.csrfHash,
      expiresAt: pair.expiresAt,
    });
  }

  function setCookie(reply: SessionReplyLike, pair: SessionTokenPair): void {
    reply.setCookie(cookieConfig.name, pair.token, {
      httpOnly: true,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: '/',
      maxAge: cookieConfig.maxAgeHours * 60 * 60,
    });
  }

  async function principalFor(request: AuthRequestLike): Promise<RequestPrincipal | undefined> {
    const token = presentedToken(request);
    const session = await findSession(token);
    if (session === undefined) return undefined;
    const user = await users.findAuthUserById(session.userId);
    if (user === undefined) return undefined;
    await database.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.tokenHash, session.tokenHash));
    return { id: user.id, permissions: [...user.permissions] };
  }

  async function requireSession(
    request: AuthRequestLike,
  ): Promise<{ readonly session: SessionRow; readonly token: string }> {
    const token = presentedToken(request);
    const session = await findSession(token);
    if (session === undefined || token === undefined) {
      throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
    }
    return { session, token };
  }

  return {
    presentedToken,

    authenticator: {
      authenticate: async (request) => principalFor(request),
    },

    async currentBuyer(request) {
      const id = request.principal?.id;
      if (id === undefined || id.length === 0) {
        throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
      }
      return { kind: 'user', id };
    },

    owns(order, buyer) {
      return order.buyerKind === buyer.kind && order.buyerRef === buyer.id;
    },

    csrfGuard: {
      async verify(request) {
        if (!csrfEnabled || !UNSAFE_METHODS.has(request.method)) return;
        const token = cookieToken(request);
        const session = await findSession(token);
        if (session === undefined) return;

        const provided = headerValue(request.headers, 'x-csrf-token');
        if (
          provided === undefined ||
          !timingSafeTokenEqual(hashToken(provided), session.csrfHash)
        ) {
          throw new HttpError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'CSRF token is missing or invalid.',
          });
        }
      },
    },

    async register(input, reply) {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) {
        throw validationError([{ path: 'email', message: 'Enter a valid email address.' }]);
      }
      validatePassword(input.password, authConfig.passwordMinLength);
      if (input.displayName !== undefined && input.displayName.length > 100) {
        throw validationError([
          { path: 'displayName', message: 'Must be at most 100 characters.' },
        ]);
      }

      const passwordHash = await hashPassword(input.password);
      const pair = newSessionPair(cookieConfig.maxAgeHours);
      const user = await database.transaction(async (tx) => {
        const created = await users.createUser(
          {
            email,
            passwordHash,
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          },
          tx,
        );
        await insertSession(created.id, pair, tx);
        return created;
      });

      setCookie(reply, pair);
      return {
        user,
        session: pair,
        principal: { id: user.id, permissions: [...(await users.listPermissions(user.id))] },
      };
    },

    async login(input, token, reply) {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) {
        throw validationError([{ path: 'email', message: 'Enter a valid email address.' }]);
      }
      validatePassword(input.password, authConfig.passwordMinLength);

      const invalidCredentials = () =>
        new HttpError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Invalid email or password.',
        });

      // Both branches perform exactly one Argon2id verification. Unknown emails
      // use a fixed dummy hash so failures cannot be distinguished by cost.
      const user = await users.findAuthUserByEmail(email);
      const verificationHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
      const verificationPassword = user === undefined ? DUMMY_PASSWORD : input.password;
      const valid = await verifyPassword(verificationHash, verificationPassword);
      if (user === undefined || !valid) throw invalidCredentials();

      if (needsPasswordRehash(user.passwordHash)) {
        await users.setPasswordHash(user.id, await hashPassword(input.password));
      }

      const pair = newSessionPair(cookieConfig.maxAgeHours);
      await database.transaction(async (tx) => {
        if (token !== undefined) {
          await tx
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
        }
        await insertSession(user.id, pair, tx);
      });

      setCookie(reply, pair);
      return {
        user: {
          id: user.id,
          email: user.email,
          ...(user.displayName === undefined ? {} : { displayName: user.displayName }),
        },
        session: pair,
        principal: { id: user.id, permissions: [...user.permissions] },
      };
    },

    async logout(token, reply) {
      if (token === undefined) {
        throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
      }
      await database.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
      reply.clearCookie(cookieConfig.name, { path: '/' });
    },

    async currentUser(request) {
      const { session } = await requireSession(request);
      const user = await users.findAuthUserById(session.userId);
      if (user === undefined) {
        throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
      }

      const csrfToken = newCsrfToken();
      await database.db
        .update(sessions)
        .set({ csrfHash: hashToken(csrfToken), lastSeenAt: new Date() })
        .where(eq(sessions.tokenHash, session.tokenHash));

      return {
        user: {
          id: user.id,
          email: user.email,
          ...(user.displayName === undefined ? {} : { displayName: user.displayName }),
        },
        roles: user.roles,
        permissions: user.permissions,
        csrfToken,
      };
    },

    async requestPasswordReset(email) {
      const normalized = normalizeEmail(email);
      if (!isValidEmail(normalized)) {
        throw validationError([{ path: 'email', message: 'Enter a valid email address.' }]);
      }

      await verifyPassword(DUMMY_PASSWORD_HASH, DUMMY_PASSWORD);
      const user = await users.findAuthUserByEmail(normalized);
      const pair = newSessionPair(PASSWORD_RESET_TTL_MINUTES / 60);

      if (user !== undefined) {
        await database.transaction(async (tx) => {
          await tx
            .delete(passwordResetTokens)
            .where(
              and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)),
            );
          await tx.insert(passwordResetTokens).values({
            tokenHash: pair.tokenHash,
            userId: user.id,
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
          });
        });
      }

      // The same template and recipient are always used. Only the body differs,
      // so the HTTP response and observable email metadata never reveal accounts.
      await emailProvider.send({
        to: normalized,
        subject: 'Password reset request',
        templateId: 'password-reset',
        text:
          user === undefined
            ? 'If an account exists for this address, a password reset link has been prepared.'
            : `Use this single-use token to reset your password: ${pair.token}`,
      });
    },

    async confirmPasswordReset(input, reply) {
      validateResetToken(input.token);
      validatePassword(input.password, authConfig.passwordMinLength);

      const tokenHash = hashToken(input.token);
      const passwordHash = await hashPassword(input.password);
      const pair = newSessionPair(cookieConfig.maxAgeHours);

      const userId = await database.transaction(async (tx) => {
        const rows = await tx
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(passwordResetTokens.tokenHash, tokenHash),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, new Date()),
            ),
          )
          .returning({ userId: passwordResetTokens.userId });
        const row = rows[0];
        if (row === undefined) {
          throw validationError([{ path: 'token', message: 'Invalid or expired reset token.' }]);
        }

        await users.setPasswordHash(row.userId, passwordHash, tx);
        await tx
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
        await insertSession(row.userId, pair, tx);
        return row.userId;
      });

      const user = await users.findAuthUserById(userId);
      if (user === undefined) {
        throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
      }

      setCookie(reply, pair);
      return {
        user: {
          id: user.id,
          email: user.email,
          ...(user.displayName === undefined ? {} : { displayName: user.displayName }),
        },
        session: pair,
        principal: { id: user.id, permissions: [...user.permissions] },
      };
    },

    async cleanupExpired() {
      const now = new Date();
      const expiredSessions = await database.db
        .delete(sessions)
        .where(lt(sessions.expiresAt, now))
        .returning({ tokenHash: sessions.tokenHash });
      const finishedResets = await database.db
        .delete(passwordResetTokens)
        .where(or(lt(passwordResetTokens.expiresAt, now), isNotNull(passwordResetTokens.usedAt)))
        .returning({ tokenHash: passwordResetTokens.tokenHash });
      return {
        sessionsDeleted: expiredSessions.length,
        resetTokensDeleted: finishedResets.length,
      };
    },
  };
}
