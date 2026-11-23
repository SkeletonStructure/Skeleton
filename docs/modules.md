# Module registry guide

M4 introduces the module contract, a static composition helper, dependency/port validation, lifecycle ordering, and a redacted activation report. It does not add Fastify, HTTP listening, application modules, or domain functionality.

## Contract

Every optional module exports one `ModuleDefinition` from its `contract.ts`:

| Field          | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `id`           | Stable lowercase kebab-case identifier.                           |
| `version`      | Positive integer contract version.                                |
| `stability`    | `experimental`, `stable`, or `deprecated`.                        |
| `requires`     | Hard module dependencies; must be enabled and initialized first.  |
| `enhances`     | Optional modules used only when also enabled.                     |
| `provides`     | Ports exposed as `{ id, version }`; each port needs a public API. |
| `consumes`     | Required or optional ports with `{ id, version, optional? }`.     |
| `configSchema` | Zod schema for `config.modules[id]`.                              |
| `permissions`  | Permission keys registered before any module's `register()` runs. |
| `register`     | Startup hook that receives the controlled `ModuleContext`.        |
| `publicApi`    | In-process API returned by `ctx.use()` or a resolved port.        |

`README.md` and module migrations, events, health contributors, and route handlers remain module-owned concerns in later milestones.

## Enablement and composition

All optional modules are disabled unless their entry under `config.modules` has `enabled: true`. Modules are never discovered from disk. An application owns a checked-in composition file:

```ts
import { composeModuleRegistry } from '@skeletonstructure/core/modules';

const registry = composeModuleRegistry({
  appConfig: config,
  database, // optional when the shared M3 database has already been initialized
  modules: [usersModule, catalogModule],
});

const report = await registry.activate();
```

`composeModuleRegistry()` delegates to `createModuleRegistry()` and `register()` for each explicit definition. A configured module that is enabled but not registered, duplicate definitions, and invalid definitions fail before activation. Disabled entries from M2 defaults are ignored.

## Activation lifecycle

1. Validate the module configuration map.
2. Select enabled modules from configuration.
3. Parse each enabled module's `config.modules[id]` with its schema.
4. Assert hard dependencies are registered and enabled.
5. Resolve ports, including ambiguity, missing providers, and version mismatches.
6. Build a deterministic topological order using `requires`, enabled `enhances`, and port providers.
7. Register declared permissions for every enabled module.
8. Call each enabled module's `register(context)` in that order.
9. Verify every route permission was registered.
10. Return the redacted activation report.

Circular dependencies through hard dependencies, optional enhancements, or port providers fail startup. Failures never leave the registry marked as activated.

## Controlled context

Modules receive a frozen context with exactly:

- `config`: the parsed `config.modules[id]` value.
- `appConfig`: the validated M2 application configuration.
- `db`: the shared M3 `Database` interface.
- `permissions`: module-scoped permission registration.
- `http`: in-memory route registration for M4 contract validation.
- `use(id)`: public API access only for declared hard dependencies.
- `port({ id, version })`: resolved public API for a declared consumed port.

There is no pool, config loader, module map, raw Fastify instance, or path to another module's internals. The shared database is the M3 interface only; modules must not create pools.

## Activation report

`ActivationReport` contains:

- `enabled`: summaries in activation order, with id, version, stability, and declared edges.
- `disabled`: summaries in registration order.
- `order`: enabled module ids in activation order.
- `permissions`: registered permission keys and descriptions.
- `routes`: registered method, path, permission, and owning module id.
- `ports`: port id, version, provider, and consumers.

The report deliberately excludes module config values, environment values, database URLs, credentials, and public API objects. `activationReport()` returns a copy on each call.

## Failure codes

`ModuleRegistryError` carries a stable `code` and, where applicable, `moduleId`. Key cases include `MODULE_MISSING_DEPENDENCY`, `MODULE_CIRCULAR_DEPENDENCY`, `MODULE_PORT_MISSING`, `MODULE_PORT_AMBIGUOUS`, `MODULE_PORT_VERSION_MISMATCH`, `MODULE_CONFIG_INVALID`, `MODULE_PERMISSION_DUPLICATE`, `MODULE_ROUTE_PERMISSION_UNKNOWN`, and `MODULE_INITIALIZATION_FAILED`. Messages are developer-facing and contain no secrets or raw error text.

## Testing notes

The registry suite in `packages/core/tests/modules/registry.test.ts` is a unit suite: configuration is loaded from in-memory values and the database is an injected fake. The PostgreSQL Testcontainers suite remains the only integration suite and is labeled accordingly.
