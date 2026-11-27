# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for suspected vulnerabilities.

Report privately using GitHub's private vulnerability reporting flow:

- <https://github.com/SkeletonStructure/SkeletonStructure/security/advisories/new>

If private vulnerability reporting is unavailable, email the organization fallback address: <admin@uranium.is-a.dev>. Do not publish exploit details before coordination is complete.

Include, if possible:

- affected version or commit;
- reproduction steps or a minimal proof of concept;
- expected versus actual behavior;
- known workarounds.

## Response targets

- Acknowledgement: within 3 business days.
- Initial assessment or fix plan: within 30 days for high-severity reports.
- Coordinated disclosure: up to 90 days, negotiated with the reporter.

## Scope

This repository contains the backend foundation. Security reports should concern code or configuration in this repository. Reports about the static website belong in the `SkeletonStructure.github.io` repository.

## Credential rotation

- Use separate, least-privilege credentials for development, CI, staging, and production.
- Never commit `.env`; only `.env.example` belongs in version control.
- Rotate database passwords, email credentials, and any future API keys immediately after suspected exposure and at least quarterly for long-lived production credentials.
- Revoke old credentials before announcing rotation is complete, and record the rotation in the deployment log.
- GitHub secret scanning, push protection, and Dependabot security updates were recorded as enabled during the v0.1.0 review. The current settings are not fully verifiable through the available API; see [`docs/security/github-governance.md`](./docs/security/github-governance.md) for dated evidence and owner confirmation steps. CI runs `pnpm audit --audit-level=high`; security updates take priority over feature work. GitHub non-provider pattern scanning was disabled in v0.1.0.

## Limitations

SkeletonStructure provides careful defaults, not a guarantee of complete security. Operators remain responsible for TLS, secret management, least-privilege database credentials, backups, updates, and deployment hardening. No release, including `v0.2.0`, is claimed to be completely secure or production-ready beyond the tested scope. The historical `v0.1.0` review is recorded in [`docs/security/checklist.md`](./docs/security/checklist.md) and [`docs/release/checklist.md`](./docs/release/checklist.md); the `v0.2.0` boundary is recorded in [`docs/releases/v0.2.0.md`](./docs/releases/v0.2.0.md).

M11 hardening is included in `v0.2.0` and adds shared rate-limit storage, persistent audit events, structured request logs, and bounded graceful shutdown. M12 is also included in `v0.2.0` and adds shared startup/migration helpers, the `basic-app` starter, and an opt-in migration readiness preflight. Neither milestone is part of the historical `v0.1.0` tag, and neither constitutes an independent security review or a claim that MFA, CAPTCHA, per-account limits, real email delivery, or production deployment manifests exist. Migration readiness is opt-in and verifies recorded Drizzle hashes, not schema semantics. See [ADRs 0008–0013](./docs/architecture/adr/), [`docs/releases/v0.2.0.md`](./docs/releases/v0.2.0.md), and the M11/M12 sections of the security checklist.
