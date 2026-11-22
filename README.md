# SkeletonStructure backend foundation

A self-hosted, MIT-licensed backend foundation built as a modular monolith. This repository is the engineering counterpart to the [SkeletonStructure website](https://skeletonstructure.github.io/); the website itself is maintained separately and is intentionally untouched by backend work.

## Status

- Milestone M1 — project foundation and tooling.
- No production-readiness claim. Security review and release verification happen in milestone M10.

## Quick start

Requirements: Node.js 22 or newer and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

## Scripts

| Script       | Command                                    | Purpose                             |
| ------------ | ------------------------------------------ | ----------------------------------- |
| `typecheck`  | `tsc -b --pretty false`                    | Type-check all TypeScript projects  |
| `lint`       | `biome check .`                            | Format check and lint               |
| `format`     | `biome format --write .`                   | Apply formatting                    |
| `test`       | `vitest run`                               | Run unit and integration tests once |
| `test:watch` | `vitest`                                   | Run tests in watch mode             |
| `ci`         | `pnpm typecheck && pnpm lint && pnpm test` | Full local verification             |

## Layout

```text
packages/core/       mandatory core infrastructure (placeholder in M1)
apps/                demonstration applications (added in M9)
templates/           starter application template
docs/architecture/   architecture records and ADRs
openapi/             generated public OpenAPI artifact (added in M5)
```

## Documentation

- `CONTRIBUTING.md` — contribution workflow.
- `SECURITY.md` — private vulnerability reporting and limitations.
- `docs/architecture/adr/` — architecture decision records.

The authoritative engineering blueprint lives in the `SkeletonStructure-blueprint` workspace during bootstrap and will be imported into `docs/architecture/` as the repository matures.
