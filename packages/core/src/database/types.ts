import type { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import type { AppConfig } from '../config/index.js';

export type DatabaseConfig = AppConfig['database'];

export type DrizzleDatabase = NodePgDatabase<Record<string, never>>;

export type DatabaseTransaction = PgTransaction<
  NodePgQueryResultHKT,
  Record<string, never>,
  Record<string, never>
>;

export interface PoolClientLike {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
  release(): void;
}

export interface PoolLike {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
}

export type DatabaseHealthStatus = 'ok' | 'error';

export type DatabaseHealthReason = 'DATABASE_UNAVAILABLE' | 'DATABASE_NOT_INITIALIZED';

export interface DatabaseHealthResult {
  readonly status: DatabaseHealthStatus;
  readonly reason?: DatabaseHealthReason;
}

export interface MigrateOptions {
  readonly migrationsFolder?: string;
}

export interface MigrationReport {
  readonly appliedCount: number;
  readonly upToDate: boolean;
}

export interface Database {
  readonly db: DrizzleDatabase;
  transaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
  health(): Promise<DatabaseHealthResult>;
  migrate(options?: MigrateOptions): Promise<MigrationReport>;
  close(): Promise<void>;
}
