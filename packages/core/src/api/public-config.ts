import type { AppConfig } from '../config/index.js';
import type { ActivationReport } from '../modules/index.js';
import type { PublicConfig } from './types.js';

/** Explicit allowlist; module versions, environment values, and URLs never cross this boundary. */
export function buildPublicConfig(
  appConfig: AppConfig,
  activationReport: ActivationReport,
): PublicConfig {
  return {
    appName: appConfig.app.name,
    apiBaseUrl: '/v1',
    authMode: 'session',
    publicModules: activationReport.enabled.map((module) => module.id),
  };
}
