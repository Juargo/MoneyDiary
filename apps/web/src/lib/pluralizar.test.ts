import { describe, expect, it } from 'vitest';
import { pluralizar } from './pluralizar';

describe('pluralizar', () => {
  it('returns the singular form for n === 1', () => {
    expect(pluralizar(1, 'cartola', 'cartolas')).toBe('1 cartola');
  });

  it('returns the plural form for n === 0', () => {
    expect(pluralizar(0, 'cartola', 'cartolas')).toBe('0 cartolas');
  });

  it('returns the plural form for n > 1', () => {
    expect(pluralizar(2, 'cartola', 'cartolas')).toBe('2 cartolas');
  });
});
