# Implementation plan — SkeletonStructure

Use for substantial, multi-file, architectural, API, database, security, dependency, or ecosystem work. Keep it factual and scoped.

## New-session continuity

- [ ] `SKILL.md` read
- [ ] Applicable `AGENTS.md` read
- [ ] Branch, `HEAD`, working tree, and remote state verified
- [ ] Recent commits / relevant PRs inspected
- [ ] Current-state, feature inventory, roadmap, and applicable decisions read
- [ ] Implementation verified; no prior session report assumed complete or pushed

## Context

- Task and requested outcome:
- User authorization and stopping conditions:
- Relevant issue/PR/milestone, if any:
- Repository state verified (`HEAD`, branch, remote state, clean/dirty):

## Git and PR plan

- Target branch (never `main`):
- Base ref verified:
- Commit plan (focused, meaningful messages):
- Push and PR expected? Default yes; user exception:
- If GitHub access/permissions block a PR, exact next steps to report:

## Current reality

- Files and implementation traced:
- Relevant references read from this skill:
- Historical plan/decision consulted, and whether it is stale:
- Existing capabilities found that can be reused:

## Goals and non-goals

**Goals**

-
-

**Non-goals**

-
-

## Architecture impact

- Module boundary affected:
- Public interface/OpenAPI/SDK impact:
- Config/activation model impact:
- Database/migration impact:
- Security impact:
- Dependent-application impact:
- New ADR required? Why or why not:

## Proposed changes

| File | Change | Reason |
| ---- | ------ | ------ |
|      |        |        |

## Reuse decisions

| Need | Existing capability chosen | Why not add something new |
| ---- | -------------------------- | ------------------------- |
|      |                            |                           |

## Compatibility and migration strategy

- v0.1.0 operation baseline affected?
- Allowlist change required? Key(s):
- Existing migrations touched? (Should be no.)
- New migration appended? Review required:
- Breaking change? Changelog/release/version plan:

## Verification plan

- [ ] `pnpm run ci`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration`
- [ ] `pnpm test:contract`
- [ ] `pnpm test:regression`
- [ ] `pnpm test:migration-smoke`
- [ ] `pnpm openapi:check` / `pnpm sdk:check` as relevant
- [ ] `pnpm demo:ecommerce:verify` as relevant
- [ ] Artifact/config drift checks as relevant
- [ ] `pnpm audit --audit-level=high` if dependencies changed
- [ ] Full diff review and `git diff --check`

Add commands specific to the change. State Docker/tool limitations up front.

## Documentation and skill maintenance

- Docs to update:
- Current-state / feature-inventory updates:
- ADRs to add/update, including `Superseded` links for replacements:
- Changelog/release notes:
- Skill references to update after implementation:
- Vision/roadmap changes requiring human approval:

## Authorization gates

- [ ] Human approval obtained if requested, required by scope, or triggered by an authorization gate
- [ ] Human approval obtained before merge/tag/release/settings change
- [ ] No unrelated apps, website, or settings touched

## Completion criteria

-

Stop after reporting; do not begin additional milestones.
