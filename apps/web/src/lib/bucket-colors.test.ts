import { describe, expect, it } from 'vitest';
import {
  claseFondoBucket,
  claseGlifoBucket,
  claseRellenoBucket,
} from './bucket-colors';

// D3 (design.md, web-theme-switch): pies/legend/categorías consume static
// Tailwind class names, never hex, so a fill/background flips with the theme
// automatically. Every branch below is a literal full class string — Tailwind
// 4 detects utilities by scanning source for complete class names, so no
// template literal or string concatenation is allowed here (constraint
// verified by `pnpm web build`'s emitted CSS, not by this unit test).
describe('claseRellenoBucket', () => {
  it('returns the SVG fill class for each known bucket', () => {
    expect(claseRellenoBucket('Necesidades')).toBe('fill-necesidades');
    expect(claseRellenoBucket('Deseos')).toBe('fill-gustos');
    expect(claseRellenoBucket('Ahorro')).toBe('fill-ahorro');
  });

  // Issue #778 tramo5b PR1: SinCategoria no longer has a dedicated entry —
  // it falls back exactly like any other unrecognized bucket key.
  it('falls back to fill-muted-foreground for an unknown bucket key, including SinCategoria (issue #778)', () => {
    expect(claseRellenoBucket('OtroBucket')).toBe('fill-muted-foreground');
    expect(claseRellenoBucket('SinCategoria')).toBe('fill-muted-foreground');
  });
});

// categoria-iconografia D-08: the icon badge glyph reuses the SAME measured
// on-fill ink tokens as the pie label text (`--color-pie-etiqueta-*`,
// index.css) — not a new token family. Mirrors `claseEtiquetaPie`
// (`lib/pie-colors.ts`) one-for-one, `text-` instead of `fill-`.
describe('claseGlifoBucket', () => {
  it('returns the pie-etiqueta text class for each known bucket', () => {
    expect(claseGlifoBucket('Necesidades')).toBe(
      'text-pie-etiqueta-necesidades',
    );
    expect(claseGlifoBucket('Deseos')).toBe('text-pie-etiqueta-gustos');
    expect(claseGlifoBucket('Ahorro')).toBe('text-pie-etiqueta-ahorro');
  });

  // Issue #778 tramo5b PR1: SinCategoria no longer has a dedicated entry.
  it('falls back to the Necesidades-family class for an unknown bucket key, including SinCategoria (issue #778)', () => {
    expect(claseGlifoBucket('OtroBucket')).toBe(
      'text-pie-etiqueta-necesidades',
    );
    expect(claseGlifoBucket('SinCategoria')).toBe(
      'text-pie-etiqueta-necesidades',
    );
  });
});

describe('claseFondoBucket', () => {
  it('returns the background class for each known bucket', () => {
    expect(claseFondoBucket('Necesidades')).toBe('bg-necesidades');
    expect(claseFondoBucket('Deseos')).toBe('bg-gustos');
    expect(claseFondoBucket('Ahorro')).toBe('bg-ahorro');
  });

  // Issue #778 tramo5b PR1: SinCategoria no longer has a dedicated entry.
  it('falls back to bg-muted-foreground for an unknown bucket key, including SinCategoria (issue #778)', () => {
    expect(claseFondoBucket('OtroBucket')).toBe('bg-muted-foreground');
    expect(claseFondoBucket('SinCategoria')).toBe('bg-muted-foreground');
  });
});
