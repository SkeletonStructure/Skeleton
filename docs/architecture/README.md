# Architecture records

This directory holds the repository's architecture documentation and accepted ADRs. The sibling `SkeletonStructure-blueprint` workspace was the authoritative design intent during bootstrap; it has not been imported here and is historical, not current implementation status. Current accepted decisions are the ADRs listed below and in the engineering skill's source-of-truth hierarchy.

Use `adr/0000-template.md` for new architectural decisions.

## Decision records

- [ADR 0001 — Explicit module registry](./adr/0001-explicit-module-registry.md)
- [ADR 0002 — API infrastructure boundary](./adr/0002-api-infrastructure-boundary.md)
- [ADR 0003 — Opaque sessions and authorization](./adr/0003-opaque-sessions-and-authz.md)
- [ADR 0004 — OpenAPI-derived thin SDK](./adr/0004-openapi-derived-thin-sdk.md)
- [ADR 0005 — Static M8 composition and early port ambiguity checks](./adr/0005-m8-static-composition-and-port-ambiguity.md)
- [ADR 0006 — Generic catalog extensions and immutable order snapshots](./adr/0006-generic-catalog-extensions-and-order-snapshots.md)
- [ADR 0007 — Demo-local cart and deferred payment seam](./adr/0007-demo-local-cart-and-deferred-payment-seam.md)
- [ADR 0008 — Replaceable rate-limit storage](./adr/0008-rate-limit-storage.md)
- [ADR 0009 — Persistent audit logging](./adr/0009-persistent-audit-logging.md)
- [ADR 0010 — Audit integrity](./adr/0010-audit-integrity.md)
- [ADR 0011 — Structured logging and request correlation](./adr/0011-structured-logging.md)
- [ADR 0012 — Security infrastructure failure behavior](./adr/0012-security-infrastructure-failure-behavior.md)

ADRs 0008–0012 record unreleased M11 hardening after the `v0.1.0` tag; they do not retroactively change that release.
