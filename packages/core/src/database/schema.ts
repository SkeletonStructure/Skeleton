import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Core owns one infrastructure table: the append-only security audit log.
 * Application domain tables remain module-local.
 */
export const auditEvents = pgTable(
  'core_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    requestId: text('request_id'),
    actorId: text('actor_id'),
    subjectId: text('subject_id'),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index('core_audit_events_occurred_at_idx').on(table.occurredAt),
    index('core_audit_events_actor_id_idx').on(table.actorId),
    index('core_audit_events_request_id_idx').on(table.requestId),
    check('core_audit_events_outcome_check', sql`${table.outcome} in ('success', 'failure')`),
  ],
);
