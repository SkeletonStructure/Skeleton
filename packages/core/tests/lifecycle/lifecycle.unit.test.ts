import { describe, expect, it, vi } from 'vitest';

import { createLifecycle, createShutdownCoordinator } from '../../src/lifecycle/index.js';

describe('process lifecycle (unit)', () => {
  it('reports each state with a safe readiness reason and never moves backwards', () => {
    const lifecycle = createLifecycle();

    expect(lifecycle.state).toBe('starting');
    expect(lifecycle.check()).toEqual({ status: 'error', reason: 'SERVICE_STARTING' });

    lifecycle.markReady();
    expect(lifecycle.check()).toEqual({ status: 'ok' });
    lifecycle.markReady();
    expect(lifecycle.state).toBe('ready');

    lifecycle.markDraining();
    expect(lifecycle.check()).toEqual({ status: 'error', reason: 'SERVICE_DRAINING' });
    lifecycle.markReady();
    expect(lifecycle.state).toBe('draining');

    lifecycle.markDraining();
    lifecycle.markClosed();
    lifecycle.markDraining();
    expect(lifecycle.state).toBe('closed');
    expect(lifecycle.check()).toEqual({ status: 'error', reason: 'SERVICE_CLOSED' });
  });

  it('flips readiness before closing, then re-raises the original signal once', async () => {
    const lifecycle = createLifecycle();
    lifecycle.markReady();
    const observed: string[] = [];
    const kill = vi.fn();
    let release: (() => void) | undefined;
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          observed.push(lifecycle.state);
          release = resolve;
        }),
    );
    const coordinator = createShutdownCoordinator({
      lifecycle,
      close,
      kill,
      signals: [],
      timeoutMs: 1_000,
    });

    const pending = coordinator.shutdown('SIGTERM');
    expect(coordinator.shuttingDown).toBe(true);
    expect(observed).toEqual(['draining']);
    release?.();

    await pending;
    await coordinator.shutdown('SIGINT');
    expect(close).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGTERM');
    expect(lifecycle.check()).toEqual({ status: 'error', reason: 'SERVICE_CLOSED' });
  });

  it('closes after the timeout and kills the process when cleanup hangs', async () => {
    const lifecycle = createLifecycle();
    lifecycle.markReady();
    const kill = vi.fn();
    const coordinator = createShutdownCoordinator({
      lifecycle,
      close: () => new Promise<void>(() => undefined),
      kill,
      signals: [],
      timeoutMs: 10,
    });

    await coordinator.shutdown('SIGTERM');

    expect(kill).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGKILL');
    expect(lifecycle.check()).toEqual({ status: 'error', reason: 'SERVICE_CLOSED' });
  });

  it('installs and removes signal handlers without leaking listeners', () => {
    const lifecycle = createLifecycle();
    const before = process.listenerCount('SIGUSR1');
    const coordinator = createShutdownCoordinator({
      lifecycle,
      close: async () => undefined,
      kill: vi.fn(),
      signals: ['SIGUSR1'],
    });

    coordinator.install();
    expect(process.listenerCount('SIGUSR1')).toBe(before + 1);
    coordinator.uninstall();
    expect(process.listenerCount('SIGUSR1')).toBe(before);
  });
});
