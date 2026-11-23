import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from './errors.js';
import type { Authenticator } from './types.js';

interface RouteConfigLike {
  readonly permission?: unknown;
}

/** Reads permission metadata attached by route registration. */
export function routePermission(request: FastifyRequest): string | undefined {
  const config = request.routeOptions.config as RouteConfigLike | undefined;
  return typeof config?.permission === 'string' && config.permission.length > 0
    ? config.permission
    : undefined;
}

/**
 * Root-level permission guard. Because it is installed on the Fastify instance,
 * encapsulated module plugins cannot bypass it.
 */
export function createPermissionGuard(authenticator: Authenticator | undefined) {
  return async function permissionGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const permission = routePermission(request);
    if (permission === undefined) return;

    const principal = await authenticator?.authenticate(request);
    if (principal === undefined) {
      throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
    }
    if (!principal.permissions.includes(permission)) {
      throw new HttpError({ status: 403, code: 'FORBIDDEN' });
    }

    request.principal = principal;
  };
}
