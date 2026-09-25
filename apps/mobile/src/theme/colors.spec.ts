import { COLOR_BUCKET, COLOR_GLIFO_BUCKET, COLORS } from './colors';

/**
 * COLOR_GLIFO_BUCKET (categoria-iconografia, ADR-045 D-08) — glyph ink per
 * bucket fill for the category icon badge. Values pinned per design.md
 * "Contrast" measurements: Necesidades 8.5:1 (white), Gustos 10.1:1
 * (heading), Ahorro 3.5:1 (white).
 */
describe('COLOR_GLIFO_BUCKET (categoria-iconografia, design.md "Contrast")', () => {
  it('assigns white ink to the darker bucket fills (Necesidades, Ahorro)', () => {
    expect(COLOR_GLIFO_BUCKET.Necesidades).toBe('#FFFFFF');
    expect(COLOR_GLIFO_BUCKET.Ahorro).toBe('#FFFFFF');
  });

  it('assigns the heading dark ink to the paler bucket fill (Deseos)', () => {
    expect(COLOR_GLIFO_BUCKET.Deseos).toBe(COLORS.heading);
  });

  // Issue #778 tramo5b PR2: SinCategoria has no dedicated entry anymore in
  // either map — any caller (`IconoCategoriaBadge.tsx`) falls back to a
  // generic color instead of a bucket-specific one.
  it('has no dedicated SinCategoria entry — callers fall back to a generic color (issue #778)', () => {
    expect(COLOR_GLIFO_BUCKET.SinCategoria).toBeUndefined();
    expect(COLOR_BUCKET.SinCategoria).toBeUndefined();
  });
});
