# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for suspected vulnerabilities.

Report privately using GitHub's private vulnerability reporting flow:

- <https://github.com/SkeletonStructure/skeleton/security/advisories/new>

If private vulnerability reporting is unavailable, contact an organization administrator privately through GitHub and ask them to route the report to the maintainers. Do not publish exploit details before coordination is complete.

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
- Enable GitHub secret scanning and Dependabot for this public repository. CI runs `pnpm audit --audit-level=high`; security updates take priority over feature work.

## Limitations

SkeletonStructure provides careful defaults, not a guarantee of complete security. Operators remain responsible for TLS, secret management, least-privilege database credentials, backups, updates, and deployment hardening. No release may claim production readiness without the milestone M10 security review.
