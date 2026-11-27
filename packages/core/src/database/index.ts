export {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditContext,
  AuditError,
  type AuditEvent,
  type AuditExecutor,
  type AuditMetadata,
  type AuditMetadataValue,
  type AuditOutcome,
  type AuditSink,
  createDatabaseAuditSink,
} from './audit.js';
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
export { auditEvents } from './schema.js';
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
