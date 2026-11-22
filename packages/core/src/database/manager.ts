import { DatabaseError } from './errors.js';
import { createPostgresDatabase, type PostgresDatabaseDependencies } from './postgres.js';
import type {
  Database,
  DatabaseConfig,
  DatabaseHealthResult,
  MigrateOptions,
  MigrationReport,
} from './types.js';

let database: Database | undefined;
let initialization: Promise<Database> | undefined;

export interface InitializeDatabaseOptions extends PostgresDatabaseDependencies {}

export async function initializeDatabase(
  config: DatabaseConfig,
  options: InitializeDatabaseOptions = {},
): Promise<Database> {
  if (database !== undefined) {
    throw new DatabaseError(
      'DATABASE_ALREADY_INITIALIZED',
      'Database has already been initialized.',
    );
  }

  if (initialization !== undefined) return initialization;

  initialization = (async () => {
    const instance = createPostgresDatabase(config, options);
    await instance.initialize();
    database = instance;
    return instance;
  })();

  try {
    return await initialization;
  } finally {
    initialization = undefined;
  }
}

export function getDatabase(): Database {
  if (database === undefined) {
    throw new DatabaseError('DATABASE_NOT_INITIALIZED', 'Database has not been initialized.');
  }
  return database;
}

export function isDatabaseInitialized(): boolean {
  return database !== undefined;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (database === undefined) {
    return { status: 'error', reason: 'DATABASE_NOT_INITIALIZED' };
  }
  return database.health();
}

export async function runDatabaseMigrations(options?: MigrateOptions): Promise<MigrationReport> {
  return getDatabase().migrate(options);
}

export async function closeDatabase(): Promise<void> {
  if (initialization !== undefined) {
    try {
      await initialization;
    } catch {
      // Initialization failures are reported to the original caller.
    }
  }

  const instance = database;
  database = undefined;
  await instance?.close();
}
