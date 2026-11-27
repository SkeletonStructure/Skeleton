import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type AuditSink,
  auditEvents,
  closeDatabase,
  createDatabaseAuditSink,
  type Database,
  initializeDatabase,
} from '../../src/database/index.js';

let container: StartedPostgreSqlContainer | undefined;
let database: Database;

function requestId(): string {
  return `req_${randomUUID().replaceAll('-', '')}`;
}

async function health(sink: AuditSink) {
  if (sink.health === undefined) throw new Error('Audit sink has no health check.');
  return sink.health();
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  database = await initializeDatabase({
    url: container.getConnectionUri(),
    ssl: false,
    pool: { max: 5, idleTimeoutMs: 30_000, connectTimeoutMs: 10_000 },
  });
}, 180_000);

afterAll(async () => {
  await closeDatabase();
  await container?.stop();
}, 60_000);

describe('persistent audit log (integration)', () => {
  it('reports unready before the audit migration and ready after it', async () => {
    const sink = createDatabaseAuditSink(database);

    expect(await health(sink)).toEqual({
      status: 'error',
      reason: 'AUDIT_STORE_UNAVAILABLE',
    });

    await database.migrate();

    expect(await health(sink)).toEqual({ status: 'ok' });
  }, 120_000);

  it('appends events and rejects updates and deletes with database triggers', async () => {
    const id = requestId();
    const sink = createDatabaseAuditSink(database);

    await sink.record({
      action: 'auth.login',
      outcome: 'success',
      requestId: id,
      actorId: 'user_1',
      subjectId: 'user_1',
      metadata: { status: 200 },
    });

    const rows = await database.db
      .select({
        action: auditEvents.action,
        outcome: auditEvents.outcome,
        requestId: auditEvents.requestId,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(eq(auditEvents.requestId, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'auth.login',
      outcome: 'success',
      metadata: { status: 200 },
    });

    await expect(
      database.db
        .update(auditEvents)
        .set({ outcome: 'failure' })
        .where(eq(auditEvents.requestId, id)),
    ).rejects.toThrow();

    await expect(
      database.db.delete(auditEvents).where(eq(auditEvents.requestId, id)),
    ).rejects.toThrow();

    const unchanged = await database.db
      .select({ outcome: auditEvents.outcome })
      .from(auditEvents)
      .where(eq(auditEvents.requestId, id));
    expect(unchanged).toEqual([{ outcome: 'success' }]);
  }, 120_000);

  it('rolls back an audit event with its domain transaction', async () => {
    const id = requestId();
    const sink = createDatabaseAuditSink(database);

    await expect(
      database.transaction(async (tx) => {
        await sink.record({ action: 'auth.logout', outcome: 'success', requestId: id }, tx);
        throw new Error('rollback-domain-change');
      }),
    ).rejects.toThrow('rollback-domain-change');

    const rows = await database.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.requestId, id));
    expect(rows).toEqual([]);
  }, 120_000);
});
