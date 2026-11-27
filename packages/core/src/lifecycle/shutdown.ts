import type { Logger } from '../logging/index.js';
import type { Lifecycle } from './lifecycle.js';

export interface ShutdownCoordinatorOptions {
  readonly lifecycle: Lifecycle;
  /** Closes HTTP, providers, and the database in the application's order. */
  close(): Promise<void>;
  readonly signals?: readonly NodeJS.Signals[];
  readonly timeoutMs?: number;
  readonly logger?: Logger;
  /** Injectable for tests; defaults to signalling the current process. */
  readonly kill?: (pid: number, signal: NodeJS.Signals) => void;
}

export interface ShutdownCoordinator {
  readonly shuttingDown: boolean;
  shutdown(signal: NodeJS.Signals): Promise<void>;
  install(): void;
  uninstall(): void;
}

/**
 * One-shot signal coordinator. Readiness flips to draining before any resource
 * is closed, and the original signal is re-raised after cleanup completes.
 */
export function createShutdownCoordinator(
  options: ShutdownCoordinatorOptions,
): ShutdownCoordinator {
  const signals = options.signals ?? ['SIGINT', 'SIGTERM'];
  const timeoutMs = options.timeoutMs ?? 10_000;
  const kill = options.kill ?? ((pid: number, signal: NodeJS.Signals) => process.kill(pid, signal));
  const handlers = new Map<NodeJS.Signals, () => void>();
  let pending: Promise<void> | undefined;

  function uninstall(): void {
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
    handlers.clear();
  }

  function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (pending !== undefined) return pending;

    pending = (async () => {
      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;
      options.lifecycle.markDraining();
      options.logger?.info('lifecycle.shutdown_started', { signal });

      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          options.logger?.error('lifecycle.shutdown_timeout', { signal, timeoutMs });
          kill(process.pid, 'SIGKILL');
          resolve();
        }, timeoutMs);
      });

      try {
        const closing = (async () => options.close())();
        await Promise.race([closing, timeout]);
        options.lifecycle.markClosed();
        options.logger?.info('lifecycle.shutdown_complete', { signal });
      } catch {
        options.lifecycle.markClosed();
        options.logger?.error('lifecycle.shutdown_failed', { signal });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        uninstall();
      }

      if (!timedOut) kill(process.pid, signal);
    })();

    return pending;
  }

  return {
    get shuttingDown() {
      return pending !== undefined;
    },
    shutdown,
    install() {
      if (handlers.size > 0) return;
      for (const signal of signals) {
        const handler = () => void shutdown(signal);
        handlers.set(signal, handler);
        process.once(signal, handler);
      }
    },
    uninstall,
  };
}
