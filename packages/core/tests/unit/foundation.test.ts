import { describe, expect, it } from 'vitest';

import { FOUNDATION_NAME, foundationIdentity } from '../../src/index.js';

describe('foundation placeholder', () => {
  it('exposes the foundation name', () => {
    expect(FOUNDATION_NAME).toBe('SkeletonStructure');
  });

  it('returns an immutable identity object', () => {
    expect(foundationIdentity()).toEqual({ name: 'SkeletonStructure' });
  });
});
