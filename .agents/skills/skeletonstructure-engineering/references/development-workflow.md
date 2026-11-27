# Development workflow

Use this loop for every substantive task. Do not skip inspection, verification, diff review, or reporting. [SKILL.md](../SKILL.md) is canonical for workflow rules; this file expands them with commands and detail.

## 0. New-session continuity

Before touching files:

1. Read [SKILL.md](../SKILL.md) and any applicable `AGENTS.md` instructions (root and nearest nested). If an agent does not support `AGENTS.md`, read `SKILL.md` directly.
2. Verify branch, `HEAD`, working tree, and remote state. Inspect recent commits and relevant PRs when the task depends on recent work.
3. Read [current-state.md](current-state.md), [feature-inventory.md](feature-inventory.md), [roadmap.md](roadmap.md), and the decisions relevant to the task.
4. Verify the actual implementation before relying on a previous session report, note, or PR description.
5. Never assume previous work was completed, committed, pushed, or merged. If a check cannot be performed, state the limitation.

## 1. Inspect current repository state

```bash
git status --short --branch
git log --oneline --decorate -20
git diff
git diff --check
git tag -l
git ls-remote --heads origin
```

If a GitHub remote is available, verify the actual branch/PR state rather than trusting a stale local `origin/*` ref. The local checkout has previously lagged GitHub.

Also inspect the relevant manifests, source, tests, generated artifacts, and docs. Do not assume a plan reflects current code.

## Git and pull request workflow

Defaults for every task involving repository changes:

- **Never work directly on `main`.** Create a dedicated branch for each independent task from a verified base: `git switch -c task/<short-name>`. Do not discard uncommitted work to move branches.
- **Keep commits focused** with meaningful messages; one independent concern per branch/PR.
- **Run relevant tests, linting, typechecking, and builds** before considering work complete. Use the full gate when shared behavior changes.
- **Review the complete diff before pushing**, including new files and generated artifacts. Confirm no unrelated changes.
- **Push the branch to the remote repository** when the work is ready for review.
- **Open a PR for every completed task involving repository changes.** Explain the changes, reasoning, documentation updates, and actual verification results.
- **Never merge a PR without explicit human authorization.**
- **Never force-push, rewrite shared history, overwrite existing work, or run destructive Git operations** without permission.
- **Never include unrelated changes in a PR.**
- If GitHub access or permissions prevent opening a PR, **report the limitation and provide the branch name and exact next steps**. Never claim a PR was created if it was not.
- If the user explicitly says not to commit or push for a particular task, stop after preparing and reviewing the local diff and report the exact next steps.

## 2. Understand the relevant implementation

Read the matching references from [SKILL.md](../SKILL.md). Then trace the concrete path: config → composition → module/service → API route → database → generated contract → test. Identify existing capabilities before designing new ones.

## 3. Identify reusable capabilities

Check, in order:

1. `packages/core` for config, DB, API, security, module primitives.
2. Existing modules and their `publicApi`/ports.
3. `packages/app-composition` for wiring and migration runners.
4. Scripts for artifact generation, migration, cleanup, and startup.
5. Existing tests and regression patterns.
6. Existing docs/ADRs for prior reasoning.

If nothing fits, record why a new capability is justified.

## 4. Understand architectural implications

Before editing, answer:

- Does this touch a module boundary, public interface, port, permission, route, or OpenAPI artifact?
- Does it require a new migration, config field, dependency, or activation model change?
- Could it affect an independent application?
- Does it imply a new ADR or a break of the `v0.1.0` baseline?
- Is human approval required before implementation or merge?

## 5. Define implementation scope

Use [implementation-plan.md](../templates/implementation-plan.md). State goals, non-goals, files likely affected, reuse decisions, tests, verification, compatibility impact, and authorization gates. Do not silently expand scope.

## 6. Present a plan for substantial changes

For architectural, API, DB, security, dependency, or multi-file work, present the plan. Wait for explicit approval when the user asks, when the change exceeds the authorized scope, or when an authorization gate applies; otherwise continue within the authorized task. Clarify ambiguity rather than guessing. Approval for one task is not approval for unrelated external actions.

## 7. Implement incrementally

- Keep edits scoped and consistent with existing style.
- Do not weaken or delete tests.
- Do not hand-edit generated artifacts; change the source and regenerate with the project's script.
- Do not add dependencies without justification.
- Do not activate optional modules/features without understanding the activation model.
- Do not modify unrelated applications, the website, or GitHub settings.

## 8. Verify

Minimum local gate:

```bash
pnpm run ci
```

Full gate when CI, tests, APIs, artifacts, dependencies, config, migrations, or release behavior change:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:regression
pnpm test:migration-smoke
pnpm openapi:check
pnpm sdk:check
pnpm demo:ecommerce:verify
pnpm --filter @skeletonstructure/demo-ecommerce build
pnpm config:docs && git diff --exit-code -- docs/config/reference.md
pnpm audit --audit-level=high
```

Notes:

- `pnpm ci` invokes pnpm's built-in command and fails; use `pnpm run ci`.
- Integration, browser E2E, migration smoke, and several regressions require Docker.
- E2E uses ports `3000` and `5173`; check them before running and do not terminate unrelated processes.
- Report the command, result, and any limitation. Never claim a command passed if it was not run.

See [testing-and-quality.md](testing-and-quality.md) for layer details.

## 9. Review the complete diff

```bash
git status --short
git diff
git diff --check
git diff --cached
```

For new files, inspect them explicitly. Confirm no secrets, unrelated changes, stale generated artifacts, or unintended formatting churn. Stage only intended files.

## 10. Update documentation and project context

Update affected docs, ADRs, changelog/release notes, compatibility artifacts, [current-state.md](current-state.md), [feature-inventory.md](feature-inventory.md), and this skill when the implementation or status changed. When a decision is replaced, mark the old record `Superseded`, preserve its history, and link the replacement. Do not rewrite vision, principles, or roadmap without human approval.

## 11. Report and stop

Use [completion-report.md](../templates/completion-report.md). Include files changed, tests added, exact verification results, E2E result, security findings, compatibility impact, documentation/current-state updates, branch and PR state (or the exact limitation and next steps), remaining owner-only actions, and whether the work is ready to merge. Stop when the authorized task is complete; do not start a new milestone.

## Authorization gates

Human authorization is required before:

- merging, tagging, releasing, force-pushing, or rewriting history;
- changing GitHub repository settings or branch protection;
- committing secrets or making external/public changes;
- introducing breaking API/SDK/config/schema changes;
- adding a new milestone, redefining the roadmap, or promoting app-local code into shared packages;
- changing an established architectural decision or security guarantee.
