import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import { composeModuleRegistry, type ModuleConfigSource } from '@skeletonstructure/core/modules';
import { createUsersModule } from '@skeletonstructure/module-users';
import type { EmailProvider } from './email.js';
import { createAuthModule } from './index.js';

export interface AuthUsersCompositionOptions {
  readonly appConfig: AppConfig;
  readonly database: Database;
  readonly emailProvider?: EmailProvider;
  readonly moduleConfig?: ModuleConfigSource;
}

export interface AuthUsersComposition {
  readonly registry: ReturnType<typeof composeModuleRegistry>;
  readonly activationReport: Awaited<
    ReturnType<ReturnType<typeof composeModuleRegistry>['activate']>
  >;
  readonly routeHandlers: readonly ReturnType<typeof createAuthModule>['routeHandlers'][number][];
  readonly authenticator: ReturnType<typeof createAuthModule>['api']['authenticator'];
  readonly csrfGuard: ReturnType<typeof createAuthModule>['api']['csrfGuard'];
  readonly auth: ReturnType<typeof createAuthModule>['api'];
  readonly users: ReturnType<typeof createUsersModule>['api'];
}

/**
 * Static composition for the M6 modules. Applications can replace this with
 * their own explicit list; core never discovers modules dynamically.
 */
export async function createAuthUsersComposition(
  options: AuthUsersCompositionOptions,
): Promise<AuthUsersComposition> {
  const usersModule = createUsersModule({
    appConfig: options.appConfig,
    database: options.database,
  });
  const authModule = createAuthModule({
    appConfig: options.appConfig,
    database: options.database,
    users: usersModule.api,
    ...(options.emailProvider === undefined ? {} : { emailProvider: options.emailProvider }),
  });

  const registry = composeModuleRegistry({
    appConfig: options.appConfig,
    database: options.database,
    modules: [usersModule.definition, authModule.definition],
  });
  const activationReport = await registry.activate(
    options.moduleConfig === undefined ? {} : { moduleConfig: options.moduleConfig },
  );

  const declared = new Set(activationReport.routes.map((route) => `${route.method} ${route.path}`));
  const routeHandlers = [...usersModule.routeHandlers, ...authModule.routeHandlers].filter(
    (route) => declared.has(`${route.method} ${route.path}`),
  );

  return {
    registry,
    activationReport,
    routeHandlers,
    authenticator: authModule.api.authenticator,
    csrfGuard: authModule.api.csrfGuard,
    auth: authModule.api,
    users: usersModule.api,
  };
}
