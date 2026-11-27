# Current state

This is a lightweight, dated snapshot of the SkeletonStructure foundation. It exists so a new session can orient quickly without reconstructing history. It is derived from the implementation; if it conflicts with current code, manifests, generated artifacts, tests, or CI, the repository wins.

Snapshot date: **2026-11-27**
Released baseline: **v0.2.0** (annotated tag `v0.2.0`); compatibility baseline: **v0.1.0** (`9d665ff3462cfc3b4f7adb7f96a2b95974f7ffff`)
Verified on 2026-11-27: PR #7 merged M11 into `main` as `b399a21cf86866a725eb29b9c95ff3405853c7b8` from head `b09356fb45b250fd28a5cf9592eaf1fb0ae08de0`; its five checks and post-merge `CI` (`45987449807`) and `Push on main` (`45987449130`) runs passed. PR #8 merged post-M11 documentation cleanup as `e4eae56bce29e956d77282d89cc58e38549f4e17`. PR #9 merged M12 at 2026-11-27T12:33:15Z as `9f1455705d61dd8cd2fe6bddfc3164e31291b7f6` from head `b3aeb7dd7d6b34c66bcd2aa5596810e0edeb6980`; its five checks and post-merge `CI` (`45999611587`) and `Push on main` (`45999611907`) runs passed. PR #10 merged the documentation reconciliation as `0b3ff8640abe29e46255257aa680b6e512137c7f`. M11, M12, and that documentation state are included in the annotated `v0.2.0` release; the `v0.1.0` tag remains the historical compatibility baseline. Historical refs `docs/skill-continuity-pr-workflow` at `557406bb7776b6e6ef5a7bd86ddc90bbe884ee49` and local QA `1111`/`dde23ba59df044ce766932ceeeeded5a8c6b2f05` remain preserved.

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
- M12 application runtime work is merged on `main` through PR #9: shared startup/migration helpers, `templates/basic-app`, opt-in migration readiness, and ADR 0013.
- `v0.2.0` is the current release; `v0.1.0` remains the frozen compatibility and migration baseline.
- The active `protect-main` ruleset still enforces PR-only changes, deletion protection, and non-fast-forward protection, but requires zero status checks and zero approvals. No independent second maintainer is verified; PR #7 and PR #9 had no approving review.
- M1–M10, M9a, and the `v0.1.0` release are complete. M9b restaurant demo is **planned/deferred**, not started.
- Six shared modules exist: `users`, `auth`, `catalog`, `products`, `inventory`, `orders`. The demo cart is app-local.
- The public SDK is workspace/source distributed; it is not published to npm.
- The project is an early foundation and is **not** production-ready beyond the tested scope. `v0.2.0` does not remove the need for independent review, monitoring, or operator hardening.
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
