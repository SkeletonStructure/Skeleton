# ADR 0011 — Structured logging and request correlation

- Date: 2026-11-27
- Status: accepted
- Milestone: M11

## Context

`logging.level`, `logging.format`, and `logging.redact` were validated by configuration but unused at runtime. Fastify's built-in logger was disabled, and startup scripts called `app.log.info(...)`, which is a no-op. Operators therefore had request IDs on responses but no dependable way to correlate service logs with a request or to prove that secrets were removed from log output.

## Decision

Core owns a dependency-free `Logger` port and `createLogger()` implementation supporting `json` and `pretty` formats, level filtering, deterministic child bindings, and configured redaction keys. Applications build the logger from `appConfig.logging` and inject it into `createServer()` and the graceful-shutdown coordinator. Fastify remains configured with `logger: false`; the core API adds an `onRequest` hook that binds a request-scoped child logger with the same `requestId` returned in `x-request-id` and error envelopes.

Log records contain only bounded, JSON-safe primitives: method, route template, status, duration, error code, and explicit caller fields. Bodies, query strings, raw URLs, headers, tokens, cookies, reset links, email content, exception messages, and configuration values are never emitted by infrastructure. Redaction is applied recursively to both key names and compact object paths, so `database.url` is protected by the `databaseUrl` default key. A failing log transport is swallowed; observability must not turn a successful operation into a failed one.

The logger accepts an injectable sink for deterministic tests. No transport, aggregation service, or runtime dependency is added.

## Alternatives considered

1. Enable Fastify's Pino logger: rejected because it introduces a transport dependency and makes request-body/header logging policy harder to pin at the foundation boundary.
2. Log only in application scripts: rejected because request correlation belongs where request IDs and error mapping are created.
3. Raw `console.log`: rejected because it cannot enforce levels, schema, redaction, or a test seam.

## Consequences

- Production JSON logging is now functional and remains required by config validation.
- Request logs can be correlated with client-visible `x-request-id` values.
- Applications may inject their own `Logger` implementation, but must preserve the redaction guarantee.
- Tests assert redaction, level filtering, child bindings, and transport-failure isolation.
- The foundation still does not provide log shipping, retention, or aggregation; those remain operator responsibilities.
