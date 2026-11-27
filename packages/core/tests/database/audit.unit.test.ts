import { describe, expect, it } from 'vitest';

import type { AuditEvent, AuditSink, Database } from '../../src/database/index.js';
import {
  AuditError,
  type AuditExecutor,
  createDatabaseAuditSink,
} from '../../src/database/index.js';

const REQUEST_ID = `req_${'a'.repeat(32)}`;

interface RecordedRow {
  readonly action: string;
  readonly outcome: string;
  readonly requestId: string | null;
  readonly actorId: string | null;
  readonly subjectId: string | null;
  readonly metadata: Record<string, unknown>;
}

function fakeSink() {
  const rows: RecordedRow[] = [];
  const calls: Array<{ readonly executor: AuditExecutor | undefined }> = [];
  const database = {
    db: {
      insert: () => ({
        values: async (row: RecordedRow) => {
          rows.push(row);
        },
      }),
      select: () => ({ from: () => ({ limit: async () => rows }) }),
    },
    health: async () => ({ status: 'ok' as const }),
  } as unknown as Database;
  const executor = {
    insert: () => ({
      values: async (row: RecordedRow) => {
        rows.push(row);
        calls.push({ executor });
      },
    }),
  } as unknown as AuditExecutor;

  return { sink: createDatabaseAuditSink(database), rows, calls, executor };
}

describe('database audit sink (unit)', () => {
  it('writes validated primitives and nulls for omitted identities', async () => {
    const { sink, rows } = fakeSink();

    await sink.record({
      action: 'auth.login',
      outcome: 'failure',
      requestId: REQUEST_ID,
      metadata: { status: 401, retryable: false, reason: null },
    });

    expect(rows).toEqual([
      {
        action: 'auth.login',
        outcome: 'failure',
        requestId: REQUEST_ID,
        actorId: null,
        subjectId: null,
        metadata: { status: 401, retryable: false, reason: null },
      },
    ]);
  });

  it('uses the supplied executor so events can share the domain transaction', async () => {
    const { sink, calls, executor } = fakeSink();

    await sink.record(
      { action: 'users.role.assign', outcome: 'success', subjectId: 'user_1' },
      executor,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.executor).toBe(executor);
  });

  it.each([
    ['unknown action', { action: 'auth.unknown', outcome: 'success' }],
    ['unknown outcome', { action: 'auth.login', outcome: 'partial' }],
    ['invalid request id', { action: 'auth.login', outcome: 'success', requestId: 'req_x' }],
    ['unsafe actor id', { action: 'auth.login', outcome: 'success', actorId: 'user\n1' }],
    [
      'secret metadata key',
      { action: 'auth.login', outcome: 'success', metadata: { password: 'x' } },
    ],
    [
      'control character',
      { action: 'auth.login', outcome: 'success', metadata: { note: 'a\u0000b' } },
    ],
    [
      'non-primitive metadata',
      { action: 'auth.login', outcome: 'success', metadata: { nested: {} as never } },
    ],
  ])('rejects %s', async (_label, event) => {
    const { sink, rows } = fakeSink();
    await expect(sink.record(event as unknown as AuditEvent)).rejects.toBeInstanceOf(AuditError);
    expect(rows).toEqual([]);
  });

  it('rejects oversized metadata', async () => {
    const { sink, rows } = fakeSink();
    const metadata = Object.fromEntries(
      Array.from({ length: 9 }, (_unused, index) => [`field${index}`, index]),
    );

    await expect(
      sink.record({ action: 'auth.login', outcome: 'success', metadata }),
    ).rejects.toBeInstanceOf(AuditError);
    expect(rows).toEqual([]);
  });

  it('health checks the audit table rather than only the pool', async () => {
    const missingTable = {
      db: {
        select: () => ({
          from: () => ({ limit: async () => Promise.reject(new Error('missing table')) }),
        }),
      },
      health: async () => ({ status: 'ok' as const }),
    } as unknown as Database;

    const sink: AuditSink = createDatabaseAuditSink(missingTable);
    if (sink.health === undefined) throw new Error('Audit sink has no health check.');
    await expect(sink.health()).resolves.toEqual({
      status: 'error',
      reason: 'AUDIT_STORE_UNAVAILABLE',
    });
  });
});
