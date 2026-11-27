# Current state

This is a lightweight, dated snapshot of the SkeletonStructure foundation. It exists so a new session can orient quickly without reconstructing history. It is derived from the implementation; if it conflicts with current code, manifests, generated artifacts, tests, or CI, the repository wins.

Snapshot date: **2026-11-27**
Released baseline: **v0.1.0** (`9d665ff3462cfc3b4f7adb7f96a2b95974f7ffff`)
Verified after M11 on 2026-11-27: PR #7 was merged into `main` as `b399a21cf86866a725eb29b9c95ff3405853c7b8` at 2026-11-27T11:04:44Z from head `b09356fb45b250fd28a5cf9592eaf1fb0ae08de0`. Its five PR checks passed, and post-merge `CI` (`45987449807`) and `Push on main` (`45987449130`) succeeded. M11 is merged on `main` but is not part of the `v0.1.0` tag; no new tag was created. PR #8 later merged post-M11 documentation cleanup; GitHub `main` was re-verified at `e4eae56bce29e956d77282d89cc58e38549f4e17` on 2026-11-27. Historical refs `docs/skill-continuity-pr-workflow` at `557406bb7776b6e6ef5a7bd86ddc90bbe884ee49` and local QA `1111`/`dde23ba59df044ce766932ceeeeded5a8c6b2f05` remain preserved.

## Refresh before relying on this snapshot

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -20
git diff
git ls-remote --heads origin
```

When GitHub is available and the task depends on external state, also check `gh pr view`, `gh run list`, and CodeQL/alert state. Do not treat a local tracking ref as current upstream.

Then verify the relevant implementation directly. For a capability inventory, start with [feature-inventory.md](feature-inventory.md); for milestone history, use [roadmap.md](roadmap.md).

## Current status

- M11 security and operational hardening is merged through PR #7: governance cleanup, shared rate-limit storage seam, persistent audit events, structured logging, graceful shutdown, and failure-path regressions.
- M12 application runtime work is present on `task/m12-application-runtime` from GitHub `main` at `e4eae56`: shared startup/migration helpers, `templates/basic-app`, opt-in migration readiness, and ADR 0013. It is pending review and is not merged on `main`.
- The foundation remains in post-release maintenance/QA hardening after `v0.1.0`; M11 is on `main` but has no separate tag or release record.
- The active `protect-main` ruleset still enforces PR-only changes, deletion protection, and non-fast-forward protection, but requires zero status checks and zero approvals. No independent second maintainer is verified; PR #7 had no approving review.
- M1–M10, M9a, and the `v0.1.0` release are complete. M9b restaurant demo is **planned/deferred**, not started.
- Six shared modules exist: `users`, `auth`, `catalog`, `products`, `inventory`, `orders`. The demo cart is app-local.
- The public SDK is workspace/source distributed; it is not published to npm.
- The project is an early foundation and is **not** production-ready beyond the tested scope. M11 does not remove the need for independent review, monitoring, or operator hardening.
- No Orgo implementation or reference was found. The local bookstore workspace is the concrete dependent-application example, but it is not upstream-documented.
- The website is a separate repository; backend work must not rewrite it.

## How to use this file

- Use it as orientation, not as proof. Confirm claims in source before acting.
- Keep it short. Longer explanations belong in [architecture.md](architecture.md), [roadmap.md](roadmap.md), [security.md](security.md), or [known-limitations.md](known-limitations.md).
- Update it in the same change when project status, release baseline, active milestone, remote state, or major capability status changes.

## Update protocol

When implementation changes, update this file and [feature-inventory.md](feature-inventory.md), then update whichever of these are affected:

- [architecture.md](architecture.md) — structure, module graph, API, DB, config, SDK behavior.
- [security.md](security.md) — auth, authz, CSRF, secrets, validation, rate limits.
- [testing-and-quality.md](testing-and-quality.md) — test layers, commands, CI, artifact checks.
- [known-limitations.md](known-limitations.md) — new or resolved gotchas.
- [roadmap.md](roadmap.md) — completed, active, deferred, or blocked work.
- [architectural-decisions.md](architectural-decisions.md) — accepted, superseded, or newly rejected decisions.
- Project docs, changelog, and release notes as appropriate.

Never rewrite the long-term vision or established principles here. Those belong to human-authorized decisions.
