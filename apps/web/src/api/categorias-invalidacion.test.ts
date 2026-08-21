import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidarCatalogo,
  invalidarCatalogoYDashboard,
} from './categorias-invalidacion';

/**
 * categorias-invalidacion.test.ts — US-043 design.md §1/Q5c, WCTG-09.
 *
 * `claves()` extracts the actual `queryKey` argument of every
 * `invalidateQueries` call. Exact array equality on `claves()` — never the
 * weaker `not.toHaveBeenCalledWith(['resumen'])`, which compares against the
 * wrong shape (the real call argument is `{queryKey: [...]}`, not the bare
 * array) and would pass vacuously regardless of behaviour (design.md Q5c).
 */
function crearQueryClientEspiado() {
  const queryClient = new QueryClient();
  const espia = vi.spyOn(queryClient, 'invalidateQueries');
  const claves = () => espia.mock.calls.map(([arg]) => arg?.queryKey);
  return { queryClient, claves };
}

describe('invalidarCatalogo — perfil A (mutaciones de patrón)', () => {
  it('invalida el catálogo — WCTG-09 escenario "invalidates only the catalog" (mitad inclusión)', () => {
    const { queryClient } = crearQueryClientEspiado();

    invalidarCatalogo(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['categorias'],
    });
  });

  it('LA EXCLUSIÓN — WCTG-09 escenario dedicado: no invalida NINGUNA de las tres claves del dashboard (no negociable #4)', () => {
    const { queryClient, claves } = crearQueryClientEspiado();

    invalidarCatalogo(queryClient);

    // Exact array equality: una TERCERA clave (p.ej. ['resumen']) rompe esta
    // aserción — no se infiere por ausencia en el test de arriba.
    expect(claves()).toEqual([['categorias']]);
    // WDM-09: explicit negation (spec: assert explicitly, not infer from absence).
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['ingresos-mes'],
    });
  });
});

describe('invalidarCatalogoYDashboard — perfil B (mutaciones de categoría)', () => {
  it('invalida EXACTAMENTE las 5 claves, en orden: categorias, resumen, resumen-anual, detalle-bucket-mes, ingresos-mes (WDM-09)', () => {
    const { queryClient, claves } = crearQueryClientEspiado();

    invalidarCatalogoYDashboard(queryClient);

    expect(claves()).toEqual([
      ['categorias'],
      ['resumen'],
      ['resumen-anual'],
      ['detalle-bucket-mes'],
      ['ingresos-mes'],
    ]);
  });
});
