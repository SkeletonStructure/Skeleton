# ADR 0012 — Security infrastructure failure behavior

- Date: 2026-11-27
- Status: accepted
- Milestone: M11

## Context

Rate limiting, audit persistence, readiness checks, and shutdown are security-relevant infrastructure. A storage outage could silently weaken all of them if providers failed open, returned generic health without checking their backing store, or left half-closed resources behind. The foundation also needs a consistent answer for applications that configure an optional provider but do not supply its required client.

## Decision

All security infrastructure fails closed:

1. **Rate limiting:** `@fastify/rate-limit` is registered globally before authorization and CSRF hooks with `skipOnError: false`. A storage error becomes a mapped server error; it never allows an unmetered request. The Redis provider is available only through an injected ioredis-compatible client and an explicit `store: 'redis'`; startup rejects an injected provider whose id does not match configuration.
2. **Audit writes:** a failed audit record propagates before the protected response is returned. Identity-changing auth and role events share the domain transaction, so neither the domain change nor its audit row can commit alone. There is no in-memory fallback and no best-effort drop.
3. **Readiness:** the database, rate-limit store, audit table, and explicit lifecycle each contribute a named check. Provider exceptions and invalid results become a safe `*_UNAVAILABLE` reason; no exception text, URL, or token is exposed. During startup, draining, or after close, the lifecycle check returns `503` even when dependencies look healthy.
4. **Shutdown:** the coordinator flips readiness to draining before closing resources, makes one close attempt with a bounded timeout, closes the HTTP server, optional providers, and the shared database in the application's explicit order, and re-raises the original signal. A hung close is terminated with `SIGKILL` after the timeout. Cleanup is one-shot and idempotent.
5. **Logging:** structured log transport failures are isolated from request handling and never suppress a security failure.

## Alternatives considered

1. Fail open when a limiter or audit store is unavailable: rejected because it converts an outage into an unmetered or unlogged security operation.
2. Automatic Redis fallback: rejected because it adds a hidden dependency and contradicts explicit provider composition.
3. Readiness based only on `SELECT 1`: rejected because it cannot detect a missing audit table or a down rate-limit backend.
4. Immediate `process.exit()` on signal: rejected because it can truncate audit writes and leave the shared pool open.

## Consequences

- A degraded limiter or audit store produces `500`/`503` responses rather than silently reduced security.
- Operators must configure and monitor both the audit table and any injected shared limiter before routing production traffic.
- Deployments need a drain window long enough for in-flight requests and audit writes; the default timeout is 10 seconds.
- Applications own the concrete Redis client and its connection lifecycle; core never creates one.
- Tests pin fail-closed rate limiting, failed audit writes, named readiness failures, lifecycle transitions, and shutdown timeout behavior.
