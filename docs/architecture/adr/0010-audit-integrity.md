# ADR 0010 — Audit integrity

- Date: 2026-11-27
- Status: accepted
- Milestone: M11

## Context

An audit log is only useful if ordinary application code cannot quietly rewrite history and if untrusted input cannot turn it into a second secret store. PostgreSQL already provides transactional durability and constraints; no new service or dependency is justified for the foundation's first durable audit capability.

## Decision

Integrity is enforced at three layers:

1. **Schema:** `core_audit_events` uses a generated UUID primary key, a server-side `now()` timestamp, a check constraint restricting outcomes to `success` or `failure`, and indexes on time, actor, and request ID. PostgreSQL triggers raise on every `UPDATE` or `DELETE`, making the table append-only to application roles.
2. **Sink validation:** core allows only the declared action/outcome vocabulary, validates request IDs as `req_<32 hex>`, restricts actor/subject IDs to a bounded safe character set, caps metadata at eight fields, allows only primitive values, rejects control characters and oversized strings, and rejects keys containing `password`, `token`, `secret`, `cookie`, `authorization`, or `databaseUrl`.
3. **Transaction boundaries:** identity-changing events are inserted with the domain transaction executor. A failed transaction removes its audit row together with the domain change; a successful transaction cannot commit the domain change without the audit row.

Readiness also probes the audit table explicitly, so a missing or inaccessible table is reported as `AUDIT_STORE_UNAVAILABLE` instead of appearing healthy because `SELECT 1` succeeded.

## Alternatives considered

1. Hash-chained rows: rejected for M11 because verification would require a second storage concern and a cross-row serialization point; it can be added with a future ADR if tamper evidence beyond database privileges is required.
2. Application-only validation: rejected because a future code path could bypass it; database triggers remain the final guard.
3. Mutable status column with soft deletion: rejected because it weakens the append-only guarantee and complicates incident review.

## Consequences

- Application roles need `INSERT`, `SELECT`, and normal DDL migration rights; they do not need `UPDATE` or `DELETE` for this table.
- A PostgreSQL superuser or schema owner can still disable triggers. The foundation documents this as an operator trust boundary rather than claiming cryptographic tamper evidence.
- Deletion/retention must be performed by a controlled operator procedure, not ordinary application cleanup jobs.
- Tests pin the append-only triggers, constraint, validation rejections, and transaction rollback behavior.
