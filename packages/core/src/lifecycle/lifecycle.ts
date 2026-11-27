export type LifecycleState = 'starting' | 'ready' | 'draining' | 'closed';
export type LifecycleHealthReason = 'SERVICE_STARTING' | 'SERVICE_DRAINING' | 'SERVICE_CLOSED';

export type LifecycleHealthResult =
  | { readonly status: 'ok' }
  | { readonly status: 'error'; readonly reason: LifecycleHealthReason };

export interface Lifecycle {
  readonly state: LifecycleState;
  markReady(): void;
  markDraining(): void;
  markClosed(): void;
  check(): LifecycleHealthResult;
}

/** Explicit process state shared by readiness and graceful shutdown. */
export function createLifecycle(): Lifecycle {
  let state: LifecycleState = 'starting';

  return {
    get state() {
      return state;
    },
    markReady() {
      if (state === 'starting') state = 'ready';
    },
    markDraining() {
      if (state !== 'closed') state = 'draining';
    },
    markClosed() {
      state = 'closed';
    },
    check() {
      if (state === 'ready') return { status: 'ok' };
      if (state === 'starting') return { status: 'error', reason: 'SERVICE_STARTING' };
      if (state === 'draining') return { status: 'error', reason: 'SERVICE_DRAINING' };
      return { status: 'error', reason: 'SERVICE_CLOSED' };
    },
  };
}
