import { describe, expect, it } from 'vitest';
import { CLASE_BOTON_ICONO } from './estilos';

/**
 * estilos.ts (moved one level up from `categorias/estilos.ts`, US-063 D-06:
 * `ConfiguracionLayout` is one level above `categorias/`, and US-043's own
 * D-09 already ruled that a shared-level file importing INTO a section
 * folder "would signal ownership that is not real"). `size-6` = 24×24 CSS
 * px, the WCAG 2.2 AA SC 2.5.8 minimum (ADR-018). This is the ONLY layer
 * jsdom can assert directly — real geometry and per-usage coverage are the
 * other two layers of the guarantee (RTL usage checks in each consumer's
 * own test file + a recorded manual pass).
 */
describe('CLASE_BOTON_ICONO', () => {
  it('contiene size-6 (24×24 CSS px, WCAG 2.2 AA SC 2.5.8) — si alguien lo reduce, este test falla', () => {
    expect(CLASE_BOTON_ICONO).toContain('size-6');
  });
});
