import { describe, expect, it } from 'vitest';
import { CLASE_SEPARADOR_PIE, claseEtiquetaPie } from './pie-colors';

// Brote re-tint (2026-09-12): Sin categoría's new fill (#686663) is too dark
// for the shared dark on-wedge label (2.99:1) — the label choice is
// per-bucket instead of a single constant, mirroring
// `construirOpcionesBucket` in `bucket-colors.ts`.
//
// D3 (design.md, web-theme-switch), PR4: these token-backed class helpers
// are the ONLY resolution path now — the literal-hex `colorEtiquetaPie`/
// `PIE_LABEL_FILL`/`PIE_LABEL_FILL_LIGHT` this module used to export were
// retired once their last consumer (`DistribucionPie`) switched to
// `claseEtiquetaPie`.
describe('claseEtiquetaPie', () => {
  it('returns the token-backed label fill class for each known bucket', () => {
    expect(claseEtiquetaPie('Necesidades')).toBe(
      'fill-pie-etiqueta-necesidades',
    );
    expect(claseEtiquetaPie('Deseos')).toBe('fill-pie-etiqueta-gustos');
    expect(claseEtiquetaPie('Ahorro')).toBe('fill-pie-etiqueta-ahorro');
  });

  // Issue #778 tramo5b PR1: the ring no longer renders a SinCategoria
  // wedge, and the dedicated light-label entry for it is removed — it now
  // falls back like any other unrecognized bucket key.
  it('defaults to the Necesidades label class for an unknown bucket key, including SinCategoria (issue #778)', () => {
    expect(claseEtiquetaPie('OtroBucket')).toBe(
      'fill-pie-etiqueta-necesidades',
    );
    expect(claseEtiquetaPie('SinCategoria')).toBe(
      'fill-pie-etiqueta-necesidades',
    );
  });
});

describe('CLASE_SEPARADOR_PIE', () => {
  it('is the static stroke class for the wedge separator token', () => {
    expect(CLASE_SEPARADOR_PIE).toBe('stroke-pie-separador');
  });
});
