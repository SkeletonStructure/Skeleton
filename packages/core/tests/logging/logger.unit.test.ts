import { describe, expect, it, vi } from 'vitest';

import { createLogger, createNoopLogger, redactFields } from '../../src/logging/index.js';

const NOW = new Date('2026-11-27T12:00:00.000Z');

function capture(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'trace') {
  const lines: string[] = [];
  const logger = createLogger({
    level,
    format: 'json',
    redact: ['password', 'token', 'cookie', 'authorization', 'databaseUrl'],
    sink: (line) => lines.push(line),
    now: () => NOW,
  });
  return { logger, lines };
}

describe('structured logging (unit)', () => {
  it('emits JSON with a bounded, redacted field set', () => {
    const { logger, lines } = capture();
    const secretUrl = 'postgres://user:password@db.example.com/app';

    logger.info('security.event', {
      password: 'hunter2',
      nested: { database: { url: secretUrl } },
      token: 'session-token',
      safe: 42,
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      timestamp: NOW.toISOString(),
      level: 'info',
      message: 'security.event',
      fields: {
        password: '[REDACTED]',
        nested: { database: { url: '[REDACTED]' } },
        token: '[REDACTED]',
        safe: 42,
      },
    });
    expect(lines[0]).not.toContain(secretUrl);
    expect(lines[0]).not.toContain('hunter2');
  });

  it('filters by level and preserves child request bindings', () => {
    const { logger, lines } = capture('info');
    const child = logger.child({ requestId: 'req_abc' });

    child.debug('hidden');
    child.warn('visible', { statusCode: 403 });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'warn',
      message: 'visible',
      fields: { requestId: 'req_abc', statusCode: 403 },
    });
  });

  it('formats pretty lines without throwing on a broken sink', () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: 'info',
      format: 'pretty',
      redact: [],
      sink: (line) => {
        lines.push(line);
        throw new Error('transport failed');
      },
      now: () => NOW,
    });

    expect(() => logger.info('started')).not.toThrow();
    expect(lines[0]).toBe(`${NOW.toISOString()} INFO  started`);
  });

  it('redacts secret-valued config wrappers and controls unsafe values', () => {
    const fields = redactFields(
      {
        secret: { kind: 'secret', key: 'DATABASE_URL', value: 'postgres://secret' },
        circular: {} as Record<string, unknown>,
        message: `${'x'.repeat(600)}`,
        nested: { authorization: 'Bearer token', count: Number.NaN },
      },
      ['authorization'],
    );
    (fields.circular as Record<string, unknown>).self = fields.circular;

    expect(fields.secret).toBe('[REDACTED]');
    expect(fields.message).toHaveLength(515);
    expect(fields.nested).toEqual({ authorization: '[REDACTED]', count: null });
    expect(() => JSON.stringify(redactFields({ fields }, ['authorization']))).not.toThrow();
  });

  it('provides a no-op logger that never invokes a sink', () => {
    expect(() => {
      const logger = createNoopLogger();
      logger.trace('trace');
      logger.error('error', { token: 'ignored' });
    }).not.toThrow();
  });

  it('accepts a configurable sink event for observability tests', () => {
    const sink = vi.fn();
    const logger = createLogger({ level: 'info', format: 'json', redact: [], sink });
    logger.info('event');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[1]).toBe('info');
  });
});
