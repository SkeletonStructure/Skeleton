import { ModuleRegistryError } from './errors.js';
import type { ModuleDefinition, ModuleId, PortBinding } from './types.js';

export interface ActivationPlan {
  readonly order: readonly ModuleId[];
  readonly ports: readonly PortBinding[];
  readonly portProviders: ReadonlyMap<string, ModuleId>;
}

function portKey(id: string, version: number): string {
  return `${id}@${version}`;
}

function assertRequiredDependencies(
  enabledIds: readonly ModuleId[],
  definitions: ReadonlyMap<ModuleId, ModuleDefinition>,
): void {
  const enabled = new Set(enabledIds);

  for (const id of enabledIds) {
    const definition = definitions.get(id);
    if (definition === undefined) continue;

    for (const required of definition.requires ?? []) {
      if (enabled.has(required)) continue;
      const reason = definitions.has(required) ? 'is disabled' : 'is not registered';
      throw new ModuleRegistryError(
        'MODULE_MISSING_DEPENDENCY',
        `Module "${id}" requires "${required}", which ${reason}.`,
        { moduleId: id },
      );
    }
  }
}

function resolvePortBindings(
  enabledIds: readonly ModuleId[],
  definitions: ReadonlyMap<ModuleId, ModuleDefinition>,
): readonly PortBinding[] {
  const providers = new Map<string, ModuleId[]>();

  for (const id of enabledIds) {
    for (const port of definitions.get(id)?.provides ?? []) {
      const key = portKey(port.id, port.version);
      providers.set(key, [...(providers.get(key) ?? []), id]);
    }
  }

  const bindings = new Map<string, PortBinding>();

  for (const id of enabledIds) {
    const definition = definitions.get(id);
    if (definition === undefined) continue;

    for (const requirement of definition.consumes ?? []) {
      const key = portKey(requirement.id, requirement.version);
      const candidates = providers.get(key) ?? [];

      if (candidates.length === 0) {
        if (requirement.optional === true) continue;

        const availableVersions = [
          ...new Set(
            enabledIds.flatMap((providerId) =>
              (definitions.get(providerId)?.provides ?? [])
                .filter((port) => port.id === requirement.id)
                .map((port) => port.version),
            ),
          ),
        ].sort((left, right) => left - right);

        if (availableVersions.length > 0) {
          throw new ModuleRegistryError(
            'MODULE_PORT_VERSION_MISMATCH',
            `Module "${id}" requires port "${requirement.id}" version ${requirement.version}; available versions: ${availableVersions.join(', ')}.`,
            { moduleId: id },
          );
        }

        throw new ModuleRegistryError(
          'MODULE_PORT_MISSING',
          `Module "${id}" requires port "${requirement.id}" version ${requirement.version}, but no enabled module provides it.`,
          { moduleId: id },
        );
      }

      if (candidates.length > 1) {
        throw new ModuleRegistryError(
          'MODULE_PORT_AMBIGUOUS',
          `Port "${requirement.id}" version ${requirement.version} has multiple providers: ${candidates.join(', ')}.`,
          { moduleId: id },
        );
      }

      const provider = candidates[0];
      if (provider === undefined) continue;

      const existing = bindings.get(key);
      if (existing === undefined) {
        bindings.set(key, {
          id: requirement.id,
          version: requirement.version,
          provider,
          consumers: [id],
        });
      } else if (!existing.consumers.includes(id)) {
        bindings.set(key, { ...existing, consumers: [...existing.consumers, id] });
      }
    }
  }

  return [...bindings.values()].sort(
    (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
  );
}

function assertPortApis(
  ports: readonly PortBinding[],
  definitions: ReadonlyMap<ModuleId, ModuleDefinition>,
): void {
  for (const binding of ports) {
    const provider = definitions.get(binding.provider);
    if (provider?.publicApi === undefined) {
      throw new ModuleRegistryError(
        'MODULE_PORT_API_MISSING',
        `Module "${binding.provider}" provides port "${binding.id}" version ${binding.version} but exposes no public API.`,
        { moduleId: binding.provider },
      );
    }
  }
}

function resolveTopologicalOrder(
  enabledIds: readonly ModuleId[],
  definitions: ReadonlyMap<ModuleId, ModuleDefinition>,
  portProviders: ReadonlyMap<string, ModuleId>,
): readonly ModuleId[] {
  const enabled = new Set(enabledIds);
  const edges = new Map<ModuleId, readonly ModuleId[]>(
    enabledIds.map((id) => {
      const definition = definitions.get(id);
      if (definition === undefined) return [id, []];

      const dependencies = new Set<ModuleId>(definition.requires ?? []);
      for (const target of definition.enhances ?? []) {
        if (enabled.has(target)) dependencies.add(target);
      }
      for (const requirement of definition.consumes ?? []) {
        const provider = portProviders.get(portKey(requirement.id, requirement.version));
        if (provider !== undefined && enabled.has(provider)) dependencies.add(provider);
      }
      return [id, [...dependencies]];
    }),
  );

  const state = new Map<ModuleId, 'visiting' | 'done'>();
  const stack: ModuleId[] = [];
  const order: ModuleId[] = [];

  const visit = (id: ModuleId): void => {
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(Math.max(start, 0)), id].join(' -> ');
      throw new ModuleRegistryError(
        'MODULE_CIRCULAR_DEPENDENCY',
        `Circular module dependency detected: ${cycle}.`,
        { moduleId: id },
      );
    }

    state.set(id, 'visiting');
    stack.push(id);
    for (const dependency of edges.get(id) ?? []) visit(dependency);
    stack.pop();
    state.set(id, 'done');
    order.push(id);
  };

  for (const id of enabledIds) visit(id);
  return order;
}

export function buildActivationPlan(
  enabledIds: readonly ModuleId[],
  definitions: ReadonlyMap<ModuleId, ModuleDefinition>,
): ActivationPlan {
  assertRequiredDependencies(enabledIds, definitions);

  const ports = resolvePortBindings(enabledIds, definitions);
  assertPortApis(ports, definitions);

  const portProviders = new Map(
    ports.map((binding) => [portKey(binding.id, binding.version), binding.provider]),
  );
  const order = resolveTopologicalOrder(enabledIds, definitions, portProviders);

  return { order, ports, portProviders };
}
