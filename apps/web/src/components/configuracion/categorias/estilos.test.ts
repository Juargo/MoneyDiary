import { describe, expect, it } from 'vitest';
import { CLASE_BOTON_ICONO } from './estilos';

/**
 * estilos.ts (US-043, design.md §1/Q10c, WCTG-13 guarantee 3): the pinned
 * class layer of the three-layer 24×24 CSS px tap-target guarantee. `size-6`
 * = 24×24 CSS px, the WCAG 2.2 AA SC 2.5.8 minimum (ADR-018). This is the
 * ONLY layer jsdom can assert directly — geometry and per-usage coverage are
 * the other two layers (RTL usage checks + a recorded manual pass, PR #5).
 */
describe('CLASE_BOTON_ICONO', () => {
  it('contiene size-6 (24×24 CSS px, WCAG 2.2 AA SC 2.5.8) — si alguien lo reduce, este test falla', () => {
    expect(CLASE_BOTON_ICONO).toContain('size-6');
  });
});
