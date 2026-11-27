import type { HealthResult } from '../api/types.js';
import { auditEvents } from './schema.js';
import type { Database, DatabaseTransaction } from './types.js';

export const AUDIT_ACTIONS = [
  'auth.register',
  'auth.login',
  'auth.logout',
  'auth.password_reset.request',
  'auth.password_reset.confirm',
  'authz.decision',
  'security.csrf',
  'security.rate_limit',
  'users.role.assign',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditOutcome = 'success' | 'failure';
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

export interface AuditEvent {
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  readonly requestId?: string;
  readonly actorId?: string;
  readonly subjectId?: string;
  readonly metadata?: AuditMetadata;
  readonly occurredAt?: Date;
}

/** Callers pass server-generated correlation data, never client-supplied identities. */
export interface AuditContext {
  readonly requestId?: string;
  readonly actorId?: string;
}

export type AuditExecutor = Database['db'] | DatabaseTransaction;

export interface AuditSink {
  /** Pass the same transaction executor to keep state changes and events atomic. */
  record(event: AuditEvent, executor?: AuditExecutor): Promise<void>;
  health?(): Promise<HealthResult>;
  close?(): Promise<void>;
}

export class AuditError extends Error {
  readonly code = 'INVALID_AUDIT_EVENT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AuditError';
  }
}

const REQUEST_ID_PATTERN = /^req_[a-f0-9]{32}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const METADATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const FORBIDDEN_METADATA_KEYS = /password|token|secret|cookie|authorization|databaseurl/i;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) <= 0x1f) return true;
  }
  return false;
}

function validateMetadata(metadata: AuditMetadata | undefined): AuditMetadata {
  if (metadata === undefined) return {};
  const entries = Object.entries(metadata);
  if (entries.length > 8) throw new AuditError('Audit metadata has too many fields.');
  const result: Record<string, AuditMetadataValue> = {};
  for (const [key, value] of entries) {
    if (!METADATA_KEY_PATTERN.test(key) || FORBIDDEN_METADATA_KEYS.test(key)) {
      throw new AuditError('Audit metadata field is not allowed.');
    }
    if (typeof value === 'string') {
      if (value.length > 128 || containsControlCharacter(value)) {
        throw new AuditError('Audit metadata string is not allowed.');
      }
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new AuditError('Audit metadata number is not allowed.');
    } else if (typeof value !== 'boolean' && value !== null) {
      throw new AuditError('Audit metadata value must be a primitive.');
    }
    result[key] = value;
  }
  return result;
}

function validateEvent(
  event: AuditEvent,
): Required<Pick<AuditEvent, 'action' | 'outcome' | 'metadata'>> & AuditEvent {
  if (!AUDIT_ACTIONS.includes(event.action)) {
    throw new AuditError('Unknown audit action.');
  }
  if (event.outcome !== 'success' && event.outcome !== 'failure') {
    throw new AuditError('Unknown audit outcome.');
  }
  if (event.requestId !== undefined && !REQUEST_ID_PATTERN.test(event.requestId)) {
    throw new AuditError('Audit request id is invalid.');
  }
  for (const id of [event.actorId, event.subjectId]) {
    if (id !== undefined && !IDENTIFIER_PATTERN.test(id)) {
      throw new AuditError('Audit actor or subject id is invalid.');
    }
  }
  if (event.occurredAt !== undefined && Number.isNaN(event.occurredAt.getTime())) {
    throw new AuditError('Audit timestamp is invalid.');
  }
  return { ...event, metadata: validateMetadata(event.metadata) };
}

interface InsertExecutor {
  insert(table: typeof auditEvents): {
    values(row: {
      action: AuditAction;
      outcome: AuditOutcome;
      requestId: string | null;
      actorId: string | null;
      subjectId: string | null;
      metadata: AuditMetadata;
      occurredAt?: Date;
    }): Promise<unknown>;
  };
}

interface SelectExecutor {
  select(fields: { readonly id: typeof auditEvents.id }): {
    from(table: typeof auditEvents): { limit(count: number): Promise<readonly unknown[]> };
  };
}

/** Core-owned sink writing through the application's existing database port. */
export function createDatabaseAuditSink(database: Database): AuditSink {
  return {
    async record(event, executor) {
      const valid = validateEvent(event);
      const target = (executor ?? database.db) as unknown as InsertExecutor;
      await target.insert(auditEvents).values({
        action: valid.action,
        outcome: valid.outcome,
        requestId: valid.requestId ?? null,
        actorId: valid.actorId ?? null,
        subjectId: valid.subjectId ?? null,
        metadata: valid.metadata,
        ...(valid.occurredAt === undefined ? {} : { occurredAt: valid.occurredAt }),
      });
    },
    async health() {
      try {
        const result = await database.health();
        if (result.status !== 'ok') {
          return { status: 'error', reason: 'AUDIT_STORE_UNAVAILABLE' };
        }
        const executor = database.db as unknown as SelectExecutor;
        await executor.select({ id: auditEvents.id }).from(auditEvents).limit(1);
        return { status: 'ok' };
      } catch {
        return { status: 'error', reason: 'AUDIT_STORE_UNAVAILABLE' };
      }
    },
  };
}
