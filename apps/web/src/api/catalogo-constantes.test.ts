import { describe, expect, it } from 'vitest';
import {
  BUCKETS_ASIGNABLES,
  ICONOS_CATEGORIA,
  MATCH_TYPES,
} from './catalogo-constantes';

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

// categoria-iconografia CATICO-01/07: exact-value pin, complementary to the
// backend-source drift guard in catalogo-constantes.mirror.spec.ts.
describe('ICONOS_CATEGORIA', () => {
  it('has exactly 24 unique kebab-case lucide names, in picker order', () => {
    expect(ICONOS_CATEGORIA).toHaveLength(24);
    expect(new Set(ICONOS_CATEGORIA).size).toBe(24);
    expect(ICONOS_CATEGORIA).toEqual([
      'shopping-cart',
      'fuel',
      'pill',
      'heart-pulse',
      'bus',
      'house',
      'zap',
      'wifi',
      'smartphone',
      'graduation-cap',
      'shield',
      'car',
      'paw-print',
      'tv',
      'bike',
      'utensils',
      'shirt',
      'plane',
      'gamepad-2',
      'gift',
      'dumbbell',
      'piggy-bank',
      'trending-up',
      'credit-card',
    ]);
  });
});
