# Current state

This is a lightweight, dated snapshot of the SkeletonStructure foundation. It exists so a new session can orient quickly without reconstructing history. It is derived from the implementation; if it conflicts with current code, manifests, generated artifacts, tests, or CI, the repository wins.

Snapshot date: **2026-11-27**
Released baseline: **v0.1.0** (`9d665ff3462cfc3b4f7adb7f96a2b95974f7ffff`)
Observed local state during the skill update: branch `docs/skill-continuity-pr-workflow`, local QA head `dde23ba59df044ce766932ceeeeded5a8c6b2f05`, stale local `origin/main` at `9d665ff`, GitHub `main` at `b71653cfc45553101a7968002818220a50bffa6e`.

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

- No new feature milestone is verified as active.
- The foundation is in post-release maintenance and QA hardening after `v0.1.0`.
- M1–M10, M9a, and the `v0.1.0` release are complete. M9b restaurant demo is **planned/deferred**, not started.
- Six shared modules exist: `users`, `auth`, `catalog`, `products`, `inventory`, `orders`. The demo cart is app-local.
- The public SDK is workspace/source distributed; it is not published to npm.
- The project is an early foundation and is **not** production-ready beyond the tested scope.
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
