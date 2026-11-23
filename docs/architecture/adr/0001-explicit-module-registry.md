# ADR 0001 — Explicit static module registry

- Date: 2026-11-23
- Status: accepted
- Milestone: M4

## Context

SkeletonStructure is a modular monolith. Optional modules must share one process and a small set of core services without importing each other's internals or creating a hidden dependency graph. Startup must fail closed before HTTP listens when module configuration, dependencies, permissions, or routes are invalid.

## Decision

Each optional module exports one `ModuleDefinition`. An application provides a checked-in, explicit list of definitions to `composeModuleRegistry()`; core never imports a concrete module and never discovers plugins from disk. The registry validates definitions and module configuration, resolves `requires`, enabled `enhances`, and provided/consumed ports, activates modules in deterministic topological order, and returns a redacted activation report. Modules receive only a frozen `ModuleContext` exposing parsed module config, validated application config, the shared M3 `Database` interface, scoped permission and in-memory route registrars, and typed access to declared hard dependencies or resolved ports.

## Alternatives considered

1. Convention-only folders: rejected because dependency and configuration errors would surface late and rely on unstated conventions.
2. Disk-based dynamic plugin loading: rejected because it is harder to type, audit, and keep fail-closed.
3. A full DI container: rejected because the extra abstraction is unnecessary for a small explicit set of modules.

## Consequences

- Adding a module requires editing one composition list, which is an auditable trade-off.
- Invalid module configuration, missing or circular dependencies, ambiguous ports, duplicate permissions/routes, and unknown route permissions fail before activation completes.
- M4 route registration stays in memory. Fastify hooks, validation, and listening are deliberately deferred to M5.
- The activation report never contains config values, credentials, database URLs, or module public APIs.

## Verification

Unit tests cover registration, enable/disable, topological order, missing and circular dependencies, port validation, initialization failures, route/permission validation, duplicate/conflicting definitions, controlled context boundaries, static composition, and report redaction. CI runs type-check, lint, and the full test suite on Node.js 24, and M3's PostgreSQL integration test remains in the suite.
