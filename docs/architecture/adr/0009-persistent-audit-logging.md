# ADR 0009 — Persistent audit logging

- Date: 2026-11-27
- Status: accepted
- Milestone: M11

## Context

v0.1.0 had request IDs and structured configuration for logs, but no durable record of security-relevant decisions. Operators could not reconstruct an authentication failure, a denied authorization, a CSRF rejection, or a role assignment after the process exited. Code scanning also made clear that security controls need observable, reviewable evidence without leaking credentials into logs or responses.

## Decision

Core owns one optional PostgreSQL table, `core_audit_events`, and one sink, `createDatabaseAuditSink()`. The table is infrastructure, not a business module: it lives in `packages/core/migrations/0001_*.sql` and is applied by the normal core migration path before module migrations. Modules and core HTTP hooks receive the same `AuditSink` port through `createM8Composition()` and `createServer()`; applications that do not supply a sink keep the v0.1 request-ID-only behavior.

Events are emitted for successful registration, login, logout, password-reset request/confirm, role assignment, failed authorization, CSRF rejection, and rate-limit rejection. Identity-changing events, including logout, are recorded with the same transaction executor as the state change, so a rollback removes both. Non-transactional security failures are recorded before the HTTP error is returned. A request-scoped `AuditContext` carries only server-generated request IDs and authenticated principal IDs; client bodies, tokens, cookies, reset links, email content, and database URLs are never event fields. CSRF and rate-limit hooks run before the permission guard and authentication, so those two failure events normally have no `actorId`; the request ID remains the reliable correlation key.

A dedicated `audit` readiness check queries the table itself, not merely the connection pool. Startup composition and server options accept the sink explicitly; core never creates a second database pool. No public HTTP route or SDK operation is added: audit data is operator/application data, not part of the v0.1 API contract.

## Alternatives considered

1. Module-owned audit table: rejected because authorization, CSRF, and rate-limit events happen in core before modules run.
2. Log-only audit events: rejected because process logs are ephemeral and cannot participate in a database transaction.
3. A new `module-audit`: rejected because it would force core to depend on a module and break the infrastructure boundary.
4. Recording full request bodies/headers: rejected because secrets and personal data would be persisted.

## Consequences

- Deployments that enable auditing must run the new core migration before starting the application.
- Applications that do not pass a sink remain backward compatible; no new operation, config field, or table is required at runtime by them.
- Audit writes participate in domain transactions where possible; a storage failure prevents an unlogged security-sensitive operation from completing.
- The table is deliberately narrow and primitive-valued. Rich querying, retention, and export belong to operators or applications, not the shared core.
- Append-only integrity constraints and validation rules are recorded in ADR 0010.
