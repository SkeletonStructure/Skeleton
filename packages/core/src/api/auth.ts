import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuditSink } from '../database/index.js';
import { HttpError } from './errors.js';
import type { Authenticator } from './types.js';

interface RouteConfigLike {
  readonly permission?: unknown;
  readonly requireAuth?: unknown;
}

/** Reads permission metadata attached by route registration. */
export function routePermission(request: FastifyRequest): string | undefined {
  const config = request.routeOptions.config as RouteConfigLike | undefined;
  return typeof config?.permission === 'string' && config.permission.length > 0
    ? config.permission
    : undefined;
}

function routeRequiresAuth(request: FastifyRequest): boolean {
  const config = request.routeOptions.config as RouteConfigLike | undefined;
  return config?.requireAuth === true;
}

/**
 * Root-level permission guard. Because it is installed on the Fastify instance,
 * encapsulated module plugins cannot bypass it.
 */
export function createPermissionGuard(
  authenticator: Authenticator | undefined,
  auditSink?: AuditSink,
) {
  return async function permissionGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const permission = routePermission(request);
    if (permission === undefined && !routeRequiresAuth(request)) return;

    const principal = await authenticator?.authenticate(request);
    if (
      principal === undefined ||
      (permission !== undefined && !principal.permissions.includes(permission))
    ) {
      const status = principal === undefined ? 401 : 403;
      if (auditSink !== undefined) {
        await auditSink.record({
          action: 'authz.decision',
          outcome: 'failure',
          requestId: request.requestId,
          ...(principal === undefined ? {} : { actorId: principal.id }),
          ...(permission === undefined ? {} : { subjectId: permission }),
          metadata: { status },
        });
      }
      if (principal === undefined) {
        throw new HttpError({ status: 401, code: 'UNAUTHENTICATED' });
      }
      throw new HttpError({ status: 403, code: 'FORBIDDEN' });
    }

    request.principal = principal;
  };
}
