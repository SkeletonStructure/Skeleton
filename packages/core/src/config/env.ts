import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';

export type Environment = Readonly<Record<string, string | undefined>>;

export type SecretEnvKey = 'DATABASE_URL' | 'SESSION_SECRET';

export const SECRET_ENV_KEYS: readonly SecretEnvKey[] = ['DATABASE_URL', 'SESSION_SECRET'];

const SECRET_ENV_KEY_SET: ReadonlySet<string> = new Set(SECRET_ENV_KEYS);

export interface SecretValue {
  readonly kind: 'secret';
  readonly key: string;
  readonly value: string | undefined;
}

export interface EnvIssue {
  readonly path: string;
  readonly message: string;
  readonly source: 'env';
}

let activeEnvironment: Environment = process.env;
let activeIssues: EnvIssue[] = [];

function isSecretEnvKey(key: string): key is SecretEnvKey {
  return SECRET_ENV_KEY_SET.has(key);
}

export function setActiveEnvironment(environment: Environment): void {
  activeEnvironment = environment;
}

export function resetActiveEnvironment(): void {
  activeEnvironment = process.env;
  activeIssues = [];
}

export function drainEnvIssues(): EnvIssue[] {
  const issues = activeIssues;
  activeIssues = [];
  return issues;
}

function addEnvIssue(key: string, message: string): void {
  activeIssues.push({ path: key, message, source: 'env' });
}

async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    return parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    throw new Error(`Unable to read environment file ${filePath}`, { cause: error });
  }
}

export interface LoadEnvironmentOptions {
  readonly cwd?: string;
  readonly environment?: Environment;
  readonly envFiles?: boolean;
}

/**
 * Loads environment files with process environment as the highest precedence.
 * Files are read from the provided cwd: `.env` then `.env.local`.
 */
export async function loadEnvironment(options: LoadEnvironmentOptions = {}): Promise<Environment> {
  const cwd = options.cwd ?? process.cwd();
  let fileValues: Record<string, string> = {};

  if (options.envFiles !== false) {
    const base = await readEnvFile(`${cwd}/.env`);
    const local = await readEnvFile(`${cwd}/.env.local`);
    fileValues = { ...base, ...local };
  }

  return { ...fileValues, ...(options.environment ?? process.env) };
}

export function env(key: SecretEnvKey): SecretValue;
export function env(key: string, fallback?: string): string;
export function env(key: string, fallback?: string): string | SecretValue {
  if (isSecretEnvKey(key)) {
    return { kind: 'secret', key, value: activeEnvironment[key] };
  }

  const value = activeEnvironment[key];
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;

  addEnvIssue(key, `Environment variable ${key} is required`);
  return '';
}

export function envBool(key: string, fallback: boolean): boolean {
  const raw = activeEnvironment[key];
  if (raw === undefined) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  addEnvIssue(key, `Environment variable ${key} must be a boolean`);
  return fallback;
}

export function envInt(key: string, fallback: number): number {
  const raw = activeEnvironment[key];
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    addEnvIssue(key, `Environment variable ${key} must be an integer`);
    return fallback;
  }

  return parsed;
}

export function envList(key: string, fallback: readonly string[] = []): string[] {
  const raw = activeEnvironment[key];
  if (raw === undefined || raw.trim() === '') return [...fallback];

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
