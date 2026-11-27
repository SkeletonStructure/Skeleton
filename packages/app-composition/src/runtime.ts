import {
  type ApiRouteDefinition,
  type Authenticator,
  type CsrfGuard,
  createServer,
  type RateLimitStoreProvider,
  type ReadinessCheck,
} from '@skeletonstructure/core/api';
import { type AppConfig, loadConfig } from '@skeletonstructure/core/config';
import {
  type AuditSink,
  closeDatabase,
  createDatabaseAuditSink,
  createMigrationReadinessCheck,
  type Database,
  initializeDatabase,
} from '@skeletonstructure/core/database';
import {
  createLifecycle,
  createShutdownCoordinator,
  type Lifecycle,
  type ShutdownCoordinator,
} from '@skeletonstructure/core/lifecycle';
import { createLogger, type Logger } from '@skeletonstructure/core/logging';
import type {
  ActivationReport,
  ModuleConfigSource,
  ModuleDefinition,
} from '@skeletonstructure/core/modules';
import type { EmailProvider } from '@skeletonstructure/module-auth';

/** The minimum composition result required to create one core API server. */
export interface ApplicationComposition {
  readonly activationReport: ActivationReport;
  readonly routeHandlers: readonly ApiRouteDefinition[];
  readonly authenticator: Authenticator;
  readonly csrfGuard: CsrfGuard;
}

export interface ApplicationCompositionContext {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly audit: AuditSink;
  readonly logger: Logger;
  readonly lifecycle: Lifecycle;
  readonly emailProvider?: EmailProvider;
  readonly moduleConfig?: ModuleConfigSource;
  readonly additionalModules?: readonly ModuleDefinition[];
}

export type ApplicationComposer<
  TComposition extends ApplicationComposition = ApplicationComposition,
> = (context: ApplicationCompositionContext) => TComposition | Promise<TComposition>;

export interface ApplicationRuntimeOptions<
  TComposition extends ApplicationComposition = ApplicationComposition,
> {
  /** Directory searched for config and env files; defaults to `process.cwd()`. */
  readonly cwd?: string;
  readonly compose: ApplicationComposer<TComposition>;
  readonly logger?: Logger;
  readonly lifecycle?: Lifecycle;
  readonly rateLimitStore?: RateLimitStoreProvider;
  readonly emailProvider?: EmailProvider;
  readonly audit?: AuditSink;
  readonly moduleConfig?: ModuleConfigSource;
  readonly additionalModules?: readonly ModuleDefinition[];
  readonly readinessChecks?: readonly ReadinessCheck[];
  /** Explicit migration check supplied by the application; takes precedence over folders. */
  readonly migrationCheck?: ReadinessCheck;
  /** Builds an opt-in migration readiness check from explicit migration folders. */
  readonly migrationFolders?: readonly string[];
}

export interface ApplicationRuntime<TComposition extends ApplicationComposition> {
  readonly app: Awaited<ReturnType<typeof createServer>>;
  readonly config: AppConfig;
  readonly composition: TComposition;
  readonly logger: Logger;
  readonly lifecycle: Lifecycle;
  /** Closes HTTP and database resources without re-raising a process signal. */
  close(): Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shared startup sequence: config, logger, lifecycle, database, audit,
 * composition, API server, shutdown coordinator, listen, then ready.
 * Migration readiness is opt-in so existing startup behavior is unchanged.
 */
export async function startApplication<
  TComposition extends ApplicationComposition = ApplicationComposition,
>(options: ApplicationRuntimeOptions<TComposition>): Promise<ApplicationRuntime<TComposition>> {
  const appConfig = await loadConfig(options.cwd === undefined ? {} : { cwd: options.cwd });
  const logger = options.logger ?? createLogger(appConfig.logging);
  const lifecycle = options.lifecycle ?? createLifecycle();
  let coordinator: ShutdownCoordinator | undefined;

  try {
    const database = await initializeDatabase(appConfig.database);
    const auditSink = options.audit ?? createDatabaseAuditSink(database);
    const compositionContext: ApplicationCompositionContext = {
      appConfig,
      database,
      audit: auditSink,
      logger,
      lifecycle,
      ...(options.emailProvider === undefined ? {} : { emailProvider: options.emailProvider }),
      ...(options.moduleConfig === undefined ? {} : { moduleConfig: options.moduleConfig }),
      ...(options.additionalModules === undefined
        ? {}
        : { additionalModules: options.additionalModules }),
    };
    const composition = await options.compose(compositionContext);
    const migrationCheck =
      options.migrationCheck ??
      (options.migrationFolders === undefined
        ? undefined
        : createMigrationReadinessCheck({
            database,
            migrationsFolders: options.migrationFolders,
          }));

    const app = await createServer({
      appConfig,
      database,
      activationReport: composition.activationReport,
      routeHandlers: composition.routeHandlers,
      authenticator: composition.authenticator,
      csrfGuard: composition.csrfGuard,
      auditSink,
      logger,
      lifecycle,
      ...(options.rateLimitStore === undefined ? {} : { rateLimitStore: options.rateLimitStore }),
      ...(options.readinessChecks === undefined
        ? {}
        : { readinessChecks: options.readinessChecks }),
      ...(migrationCheck === undefined ? {} : { migrationCheck }),
    });

    let closePromise: Promise<void> | undefined;
    const closeApplication = (): Promise<void> => {
      closePromise ??= (async () => {
        coordinator?.uninstall();
        try {
          await app.close();
        } finally {
          await closeDatabase();
        }
      })();
      return closePromise;
    };

    coordinator = createShutdownCoordinator({
      lifecycle,
      logger,
      close: closeApplication,
    });
    coordinator.install();

    await app.listen({ host: appConfig.server.host, port: appConfig.server.port });
    lifecycle.markReady();
    logger.info('application.started', {
      host: appConfig.server.host,
      port: appConfig.server.port,
      env: appConfig.app.env,
    });

    return { app, config: appConfig, composition, logger, lifecycle, close: closeApplication };
  } catch (error) {
    coordinator?.uninstall();
    await closeDatabase();
    logger.error('application.start_failed', {
      errorName: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    });
    throw error;
  }
}

export interface ApplicationMigrationOptions<TReport> {
  /** Directory searched for config and env files; defaults to `process.cwd()`. */
  readonly cwd?: string;
  readonly migrate: (database: Database) => Promise<TReport>;
}

export interface ApplicationMigrationResult<TReport> {
  readonly report: TReport;
  readonly appliedCount: number;
  readonly upToDate: boolean;
}

function collectAppliedCounts(value: unknown, counts: number[]): void {
  if (!isObject(value)) return;
  if (typeof value.appliedCount === 'number') {
    counts.push(value.appliedCount);
    return;
  }
  for (const entry of Object.values(value)) collectAppliedCounts(entry, counts);
}

/** Shared migration CLI sequence: config, database, explicit migration runner, close. */
export async function runApplicationMigrations<TReport>(
  options: ApplicationMigrationOptions<TReport>,
): Promise<ApplicationMigrationResult<TReport>> {
  const config = await loadConfig(options.cwd === undefined ? {} : { cwd: options.cwd });

  try {
    const database = await initializeDatabase(config.database);
    const report = await options.migrate(database);
    const counts: number[] = [];
    collectAppliedCounts(report, counts);
    const appliedCount = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
    return { report, appliedCount, upToDate: appliedCount === 0 };
  } finally {
    await closeDatabase();
  }
}
