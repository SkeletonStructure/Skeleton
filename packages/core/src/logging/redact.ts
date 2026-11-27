import type { LogFields } from './types.js';

export const REDACTED = '[REDACTED]' as const;

const MAX_DEPTH = 6;
const MAX_ENTRIES = 50;
const MAX_STRING_LENGTH = 512;

function isSecretValue(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === 'secret'
  );
}

function isRedactedPath(path: readonly string[], needles: readonly string[]): boolean {
  const lastKey = (path.at(-1) ?? '').toLowerCase();
  const compactPath = path.join('').toLowerCase();
  return needles.some(
    (needle) => needle.length > 0 && (compactPath.includes(needle) || lastKey.includes(needle)),
  );
}

function safeMessage(message: string): string {
  return message.length > MAX_STRING_LENGTH ? `${message.slice(0, MAX_STRING_LENGTH)}...` : message;
}

function sanitize(
  value: unknown,
  needles: readonly string[],
  depth: number,
  ancestors: ReadonlySet<object>,
  path: readonly string[],
): unknown {
  if (value === null) return null;
  if (typeof value === 'string') return safeMessage(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { name: value.name };
  if (typeof value !== 'object') return `[${typeof value}]`;
  if (ancestors.has(value)) return '[Circular]';
  if (isSecretValue(value)) return REDACTED;
  if (depth >= MAX_DEPTH) return '[DepthLimit]';

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ENTRIES)
      .map((entry) => sanitize(entry, needles, depth + 1, nextAncestors, [...path, '[]']));
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value).slice(0, MAX_ENTRIES);
  for (const [key, entry] of entries) {
    const entryPath = [...path, key];
    result[key] =
      isRedactedPath(entryPath, needles) || isSecretValue(entry)
        ? REDACTED
        : sanitize(entry, needles, depth + 1, nextAncestors, entryPath);
  }
  return result;
}

/** Produces a bounded, JSON-safe copy with configured secret keys removed. */
export function redactFields(
  fields: LogFields,
  redactKeys: readonly string[],
): Record<string, unknown> {
  const needles = redactKeys.map((key) => key.toLowerCase());
  return sanitize(fields, needles, 0, new Set(), []) as Record<string, unknown>;
}
