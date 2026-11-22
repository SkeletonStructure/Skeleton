export { DATABASE_ERROR_CODES, DatabaseError, type DatabaseErrorCode } from './errors.js';
export {
  checkDatabaseHealth,
  closeDatabase,
  getDatabase,
  type InitializeDatabaseOptions,
  initializeDatabase,
  isDatabaseInitialized,
  runDatabaseMigrations,
} from './manager.js';
export { createPostgresDatabase, type PostgresDatabaseDependencies } from './postgres.js';
export type {
  Database,
  DatabaseConfig,
  DatabaseHealthReason,
  DatabaseHealthResult,
  DatabaseHealthStatus,
  DatabaseTransaction,
  DrizzleDatabase,
  MigrateOptions,
  MigrationReport,
  PoolClientLike,
  PoolLike,
} from './types.js';
