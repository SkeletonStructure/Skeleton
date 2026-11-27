---

name: skeletonstructure-engineering
description: Institutional engineering guide for the SkeletonStructure backend foundation. Use when working in the foundation repository or on an application that composes it, to preserve its architecture, compatibility, verification, and security conventions.
license: MIT
metadata:
skill-version: "1.1.0"
project-baseline: "v0.2.0"
repository: "SkeletonStructure/SkeletonStructure"
verified-on: "2026-11-27"
---

# SkeletonStructure Engineering

SkeletonStructure is a reusable backend foundation for building independent applications. It is a private, source-distributed pnpm monorepo at `v0.2.0`: a modular Fastify/TypeScript core, explicitly composed business modules, one shared PostgreSQL pool, a generated public OpenAPI contract, and a thin browser-safe SDK. It is a usable foundation release, **not** a production-ready platform.

This skill is the project's institutional memory. It exists so any compatible coding agent can understand why the foundation exists, how it is built, what has already been decided, what is currently true, and how to contribute without weakening the architecture.

## Source of truth

Use this hierarchy; derived documents never override the layer above them.

1. **Current implementation** — source, manifests, generated artifacts, tests, CI workflow, and git history — wins for what the system actually does.
2. **Current-state snapshot** — [current-state.md](references/current-state.md) and [feature-inventory.md](references/feature-inventory.md) — is the fastest dated view of what exists now. It is derived from the implementation, not authority over it.
3. **Accepted decisions** — in-repo ADRs and committed docs — record intent and constraints. An ADR marked `Superseded` is historical; follow its replacement.
4. **Roadmap and plans** — [roadmap.md](references/roadmap.md), milestone docs, and the sibling blueprint (`SkeletonStructure-blueprint/ARCHITECTURE_BLUEPRINT.md`, outside this repo) — describe intentions, including deferred work. They are not evidence that code exists.
5. **Session reports and PR descriptions** — evidence of what someone claimed, never proof that work is present, committed, pushed, or merged.
6. **Live GitHub state** — PRs, checks, alerts, rulesets, and collaborators — wins **within external facts**; re-query it. It does not override layers 1–4 for code behavior or intent. Local tracking refs may be stale.

Before any substantive task, verify the branch, `HEAD`, working tree, and actual remote ref. The local branch may be ahead of a stale local tracking ref while GitHub `main` is elsewhere; never reset based on an unverified ref. Correct factual status drift in the current-state snapshot, feature inventory, and this skill, but do not rewrite vision, established principles, or the long-term roadmap without approval.

## Agent responsibilities

- Preserve the foundation's identity: modular, explicit, small, reusable, and independent of any one application.
- Reuse existing core, module, port, composition, and artifact-generation facilities before adding anything.
- Keep changes scoped, verified, documented, and compatible with the `v0.1.0` baseline unless a breaking change is explicitly authorized.
- Distinguish confirmed implementation from documented intention, historical decisions, assumptions, and unresolved questions.
- Report exactly what was executed and what remains; never infer success from a script's existence.

## New-session continuity

Every new agent session working on SkeletonStructure must:

1. Read this `SKILL.md` and any applicable `AGENTS.md` instructions (root and nearest nested). If an agent does not support `AGENTS.md`, read `SKILL.md` directly.
2. Verify the current branch, `HEAD`, working tree, and remote state with `git status --short --branch`, `git rev-parse HEAD`, `git diff`, and `git ls-remote --heads origin`.
3. Inspect recent commits and relevant PRs when the task depends on recent work; do not trust a stale local tracking ref.
4. Read [current-state.md](references/current-state.md), [feature-inventory.md](references/feature-inventory.md), [roadmap.md](references/roadmap.md), and the applicable entries in [architectural-decisions.md](references/architectural-decisions.md).
5. Verify the actual implementation before relying on a previous session report, note, or PR description.
6. Never assume previous work was completed, committed, pushed, or merged. Treat all such claims as unverified until checked.

If any of these checks cannot be performed, say so explicitly and state what remains unverified.

## Read the relevant reference before acting

| Read this                                                        | When                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Project vision](references/project-vision.md)                   | You need purpose, users, scope, or the foundation/application relationship.                     |
| [Current state](references/current-state.md)                     | You are starting a session or need a dated snapshot of present status.                          |
| [Feature inventory](references/feature-inventory.md)             | You need to know what exists, is partial, deferred, planned, or absent.                         |
| [Architecture](references/architecture.md)                       | You are changing code, modules, APIs, DB, config, composition, SDK, or deployment behavior.     |
| [Engineering principles](references/engineering-principles.md)   | You need naming, typing, error, logging, dependency, compatibility, or reusability conventions. |
| [Development workflow](references/development-workflow.md)       | For every implementation task; it defines the inspection-to-report loop and exact commands.     |
| [Roadmap and current status](references/roadmap.md)              | You need to know what is complete, current, planned, deferred, blocked, or stale.               |
| [Architectural decisions](references/architectural-decisions.md) | Your change touches an established boundary or could imply a new architectural rule.            |
| [Testing and quality](references/testing-and-quality.md)         | You are choosing verification commands, adding tests, or interpreting CI.                       |
| [Security](references/security.md)                               | Your change touches auth, authz, CSRF, resets, validation, secrets, rate limits, DB, or errors. |
| [Ecosystem](references/ecosystem.md)                             | You work on an independent application, Orgo/Bookstore context, SDK consumption, or upgrades.   |
| [Known limitations](references/known-limitations.md)             | You are about to assume a capability exists, or need gotchas and unresolved facts.              |

Use [implementation-plan.md](templates/implementation-plan.md) for substantial work and [completion-report.md](templates/completion-report.md) for the final report.

## Mandatory engineering workflow

1. **Inspect** the working tree, branch, remote state, relevant files, tests, and generated artifacts before proposing changes.
2. **Understand** the relevant implementation and read the matching references. Do not rely only on old plans.
3. **Find reuse** in core, existing modules, ports, composition helpers, scripts, and generated artifacts.
4. **Assess impact** on module boundaries, public API, database, config, security, compatibility baselines, and dependent applications.
5. **Define scope** in writing for substantial changes; list non-goals and authorization gates.
6. **Present a plan** before substantial implementation. Wait for explicit approval when the user asks, when the change exceeds the authorized scope, or when an authorization gate applies; otherwise continue within the authorized task.
7. **Implement incrementally**, preserving established conventions and keeping unrelated files untouched.
8. **Verify** with the appropriate commands; run the full gate when CI, tests, APIs, artifacts, dependencies, or migrations change.
9. **Review the complete diff**, including new files, and confirm no generated drift or unrelated edits.
10. **Update documentation and this skill** when reality changed, then report exactly what was done and what remains.

## Git and pull request workflow

Defaults for every task involving repository changes:

- **Never work directly on `main`.** Create a dedicated branch for each independent task from a verified base, e.g. `git switch -c task/<short-name>`. Do not discard uncommitted work to move branches.
- **Keep commits focused** with meaningful messages; one independent concern per branch/PR.
- **Run relevant tests, linting, typechecking, and builds** before considering the work complete; use the full gate when shared behavior changes.
- **Review the complete diff before pushing**, including new files, generated artifacts, and unrelated edits.
- **Push the branch to the remote repository** when the work is ready for review.
- **Open a Pull Request for every completed task involving repository changes.** Explain what changed, why, which documentation was updated, and the actual verification results.
- **Never merge a PR without explicit human authorization.**
- **Never force-push, rewrite shared history, overwrite existing work, or perform destructive Git operations** without permission.
- **Never include unrelated changes in a PR.**
- If GitHub access or permissions prevent opening a PR, **report the limitation and provide the branch name and exact next steps**. Never claim a PR was created if it was not.
- If the user explicitly says not to commit or push for a particular task, stop after preparing and reviewing the local diff, and report the exact next steps.

## Living documentation

Documentation is part of the implementation, not an afterthought.

- When features, architecture, APIs, modules, security behavior, or project status change, update the relevant documentation in the same change: current-state, feature inventory, architecture, security, testing, known limitations, roadmap, ADRs, and changelog/release notes as applicable.
- Documentation must reflect the current implementation, not outdated historical plans. If a document describes old behavior, mark it historical or update it; do not present it as current.
- When an architectural decision is replaced, mark the old record `Superseded`, preserve its history, and link to the replacement. See [architectural decisions](references/architectural-decisions.md).
- Never silently rewrite established architectural principles or the long-term vision. Changes to those require human approval.

## Rules before making changes

- Never reinvent functionality before checking whether it already exists.
- Never introduce dependencies without a meaningful justification.
- Never introduce unnecessary architectural complexity.
- Never break existing functionality to implement a new feature.
- Never silently change public interfaces or established contracts.
- Never couple independent applications unnecessarily.
- Never activate optional functionality without understanding its intended activation model.
- Never make significant architectural decisions without documenting their reasoning.
- Never claim tests passed if they were not executed successfully.
- Never ignore failing tests or hide verification limitations.
- Never modify unrelated files without justification.
- Never work directly on `main` or mix unrelated tasks in one branch or PR.
- Never assume previous session work was completed, committed, pushed, or merged.
- Never push before reviewing the complete diff.
- Never claim a PR was created if it was not.
- Never silently replace an architectural decision; mark the old record `Superseded` and link its replacement.
- Never merge changes or make irreversible project decisions without human authorization.

These are defaults, not a ban on justified evolution. If an established rule must change, explain why, record the reasoning, and seek human approval.

## Self-maintenance

After a substantial milestone or architectural change, evaluate whether [current state](references/current-state.md), [feature inventory](references/feature-inventory.md), [roadmap](references/roadmap.md), [decisions](references/architectural-decisions.md), [engineering principles](references/engineering-principles.md), [known limitations](references/known-limitations.md), [testing instructions](references/testing-and-quality.md), [ecosystem](references/ecosystem.md), the root `AGENTS.md`, or this entry point need updating. Keep the skill synchronized with the implementation.

Do **not** rewrite the vision, silently alter established principles, or change the long-term roadmap because you prefer a different approach. Those changes require human approval.
