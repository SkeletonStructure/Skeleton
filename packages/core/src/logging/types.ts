export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'pretty';

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  /** `message` is a stable event name; arbitrary text is replaced before emission. */
  log(level: LogLevel, message: string, fields?: LogFields): void;
  trace(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly format: LogFormat;
  readonly redact: readonly string[];
  /** Test/embedding seam. Receives a complete line without a trailing newline. */
  readonly sink?: (line: string, level: LogLevel) => void;
  readonly now?: () => Date;
}
