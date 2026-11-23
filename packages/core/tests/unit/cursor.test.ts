import { describe, expect, it } from 'vitest';

import { isCursorPage, pageResult } from '../../src/api/schemas.js';

describe('generic cursor page helpers', () => {
  it('omits nextCursor when there is no next page', () => {
    const result = pageResult({ items: [1, 2] });
    expect(result).toEqual({ data: { items: [1, 2] } });
    expect(isCursorPage(result)).toBe(true);
  });

  it('carries an opaque nextCursor when supplied', () => {
    const result = pageResult({ items: [1] }, 'next-page');
    expect(result.nextCursor).toBe('next-page');
    expect(isCursorPage(result)).toBe(true);
  });

  it('rejects values that are not cursor pages', () => {
    expect(isCursorPage(undefined)).toBe(false);
    expect(isCursorPage({ nextCursor: 'orphan' })).toBe(false);
    expect(isCursorPage({ data: [], nextCursor: 42 })).toBe(false);
    expect(isCursorPage({ data: [], nextCursor: 'valid' })).toBe(true);
  });
});
