import { describe, expect, it } from 'vitest';
import { BUCKETS_ASIGNABLES, MATCH_TYPES } from './catalogo-constantes';

describe('BUCKETS_ASIGNABLES', () => {
  it('lists the three assignable buckets in the frames’ group order', () => {
    expect(BUCKETS_ASIGNABLES).toEqual(['Necesidades', 'Deseos', 'Ahorro']);
  });
});

describe('MATCH_TYPES', () => {
  it('lists the three match types in dropdown order', () => {
    expect(MATCH_TYPES).toEqual(['CONTAINS', 'STARTS_WITH', 'REGEX']);
  });
});
