import { redactFields } from './redact.js';
import type { LogFields, Logger, LoggerOptions, LogLevel } from './types.js';

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

function defaultSink(line: string, level: LogLevel): void {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

function formatLine(
  timestamp: string,
  level: LogLevel,
  message: string,
  fields: Record<string, unknown>,
  format: LoggerOptions['format'],
): string {
  if (format === 'pretty') {
    const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;
  }
  return JSON.stringify({ timestamp, level, message, fields });
}

/**
 * Minimal structured logger. It intentionally owns no transports or
 * dependencies: applications can supply a sink, while default output stays
 * JSON-safe and redacted.
 */
/** Discards all output while preserving the logger port for tests and embeddings. */
export function createNoopLogger(): Logger {
  return createLogger({ level: 'error', format: 'json', redact: [], sink: () => undefined });
}

export function createLogger(options: LoggerOptions, inherited: LogFields = {}): Logger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());

  function write(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[options.level]) return;
    const combined: LogFields = { ...inherited, ...fields };
    const safeFields = redactFields(combined, options.redact);
    try {
      sink(formatLine(now().toISOString(), level, message, safeFields, options.format), level);
    } catch {
      // A broken transport must never turn a completed operation into a failure.
    }
  }

  return {
    log: write,
    trace: (message, fields) => write('trace', message, fields),
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child(bindings: LogFields): Logger {
      const safeBindings = redactFields({ ...inherited, ...bindings }, options.redact);
      return createLogger(options, safeBindings);
    },
  };
}
