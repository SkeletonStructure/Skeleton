# Contributing

Thanks for helping build a foundation people can own.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

## Before opening a pull request

- Keep changes small and scoped to one concern.
- Run `pnpm run ci` and report the actual result in the PR description.
- Run the full verification list in `.github/pull_request_template.md` when the change affects CI, tests, generated artifacts, or dependencies.
- Update documentation when behavior, configuration, or public APIs change.
- Add or update tests with every bug fix and feature. Bug fixes must include a `*.regression.test.ts` case under `tests/regression/` or the affected package's `tests/` directory unless the PR explains why none is needed.
- See [`docs/quality-assurance.md`](./docs/quality-assurance.md) for the test layers and compatibility strategy.
- For security issues, follow `SECURITY.md` instead of opening a public PR.

## Module work

Modules must follow the current module contract in [`docs/modules.md`](./docs/modules.md) and the accepted ADRs in [`docs/architecture/adr/`](./docs/architecture/adr/): explicit dependencies, public interfaces, owned migrations, declared permissions, tests, and documentation. Do not couple a module to internals from another module or to demo application code.

## Style

- TypeScript strict mode; avoid `any` outside generated files.
- Biome is the formatter and linter. Run `pnpm format` if `pnpm lint` reports formatting issues.
- Use short, specific commit messages such as `feat: add config schema` or `fix: tighten cookie defaults`.

## Review expectations

A PR should state the problem, the change, tests run, documentation impact, security impact, and migration impact. Changes that affect security, public API, or database schema need extra review before merge.
