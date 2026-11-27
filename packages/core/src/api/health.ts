import type { AuditSink, Database } from '../database/index.js';
import { ApiConfigurationError } from './config.js';
import type { RateLimitStoreProvider } from './rate-limit.js';
import type {
  HealthResult,
  ReadinessCheck,
  ReadinessCheckResult,
  ReadinessReport,
  ResolvedApiServerOptions,
} from './types.js';

const SAFE_REASON_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export function databaseReadinessCheck(database: Database | undefined): ReadinessCheck {
  return {
    id: 'database',
    check: async () => {
      if (database === undefined) {
        return { status: 'error', reason: 'DATABASE_NOT_INITIALIZED' };
      }

      const result = await database.health();
      if (result.status === 'ok') return { status: 'ok' };
      return { status: 'error', reason: result.reason ?? 'DATABASE_UNAVAILABLE' };
    },
  };
}

export function rateLimitStoreReadinessCheck(provider: RateLimitStoreProvider): ReadinessCheck {
  return {
    id: 'rateLimitStore',
    check: async () => {
      try {
        const result = await provider.health();
        return result.status === 'ok'
          ? { status: 'ok' }
          : { status: 'error', reason: result.reason ?? 'RATE_LIMIT_STORE_UNAVAILABLE' };
      } catch {
        return { status: 'error', reason: 'RATE_LIMIT_STORE_UNAVAILABLE' };
      }
    },
  };
}

export function auditReadinessCheck(sink: AuditSink): ReadinessCheck {
  return {
    id: 'audit',
    check: async () => {
      if (sink.health === undefined) return { status: 'ok' };
      try {
        const result = await sink.health();
        return result.status === 'ok'
          ? { status: 'ok' }
          : { status: 'error', reason: result.reason ?? 'AUDIT_STORE_UNAVAILABLE' };
      } catch {
        return { status: 'error', reason: 'AUDIT_STORE_UNAVAILABLE' };
      }
    },
  };
}

export function buildReadinessChecks(options: ResolvedApiServerOptions): readonly ReadinessCheck[] {
  const reserved = new Set(['config', 'database', 'rateLimitStore', 'audit']);
  for (const check of options.readinessChecks) {
    if (reserved.has(check.id)) {
      throw new ApiConfigurationError(
        'DUPLICATE_READINESS_CHECK',
        `Readiness check id "${check.id}" is reserved by core.`,
      );
    }
  }

  return [
    { id: 'config', check: () => ({ status: 'ok' }) },
    databaseReadinessCheck(options.database),
    ...options.readinessChecks,
    ...(options.rateLimitStore === undefined
      ? []
      : [rateLimitStoreReadinessCheck(options.rateLimitStore)]),
    ...(options.auditSink === undefined ? [] : [auditReadinessCheck(options.auditSink)]),
  ];
}

function safeReason(reason: string | undefined): string {
  return reason !== undefined && SAFE_REASON_PATTERN.test(reason) ? reason : 'HEALTH_CHECK_FAILED';
}

function normalizeResult(value: unknown): HealthResult {
  if (typeof value !== 'object' || value === null) {
    return { status: 'error', reason: 'HEALTH_CHECK_FAILED' };
  }

  const result = value as { status?: unknown; reason?: unknown };
  if (result.status === 'ok') return { status: 'ok' };
  if (result.status === 'error') {
    return {
      status: 'error',
      reason: safeReason(typeof result.reason === 'string' ? result.reason : undefined),
    };
  }
  return { status: 'error', reason: 'HEALTH_CHECK_FAILED' };
}

/** Deterministic readiness evaluation with no exception details in the result. */
export async function evaluateReadiness(
  checks: readonly ReadinessCheck[],
): Promise<ReadinessReport> {
  const results: ReadinessCheckResult[] = [];

  for (const check of checks) {
    let result: HealthResult;
    try {
      result = normalizeResult(await check.check());
    } catch {
      result = { status: 'error', reason: 'HEALTH_CHECK_FAILED' };
    }
    results.push({ id: check.id, ...result });
  }

  const failed = results.find((result) => result.status === 'error');
  if (failed === undefined) return { status: 'ok', checks: results };

  return {
    status: 'error',
    reason: failed.reason ?? 'HEALTH_CHECK_FAILED',
    checks: results,
  };
}
