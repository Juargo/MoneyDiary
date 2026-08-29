import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidarCachesMovimiento } from './movimientos-invalidacion';

/**
 * movimientos-invalidacion.test.ts — SDD `correccion-movimientos-manuales`
 * PR 3 (design D-03). Exact array equality on `claves()` — never the weaker
 * `not.toHaveBeenCalledWith`, which compares against the wrong call shape
 * (`{queryKey: [...]}`, not the bare array) and would pass vacuously
 * regardless of behaviour (categorias-invalidacion.test.ts precedent).
 */
function crearQueryClientEspiado() {
  const queryClient = new QueryClient();
  const espia = vi.spyOn(queryClient, 'invalidateQueries');
  const claves = () => espia.mock.calls.map(([arg]) => arg?.queryKey);
  return { queryClient, claves };
}

describe('invalidarCachesMovimiento', () => {
  it('invalida EXACTAMENTE las 4 claves, en orden: resumen, resumen-anual, detalle-bucket-mes, ingresos-mes — mismo set que useRegistrarMovimiento', () => {
    const { queryClient, claves } = crearQueryClientEspiado();

    invalidarCachesMovimiento(queryClient);

    expect(claves()).toEqual([
      ['resumen'],
      ['resumen-anual'],
      ['detalle-bucket-mes'],
      ['ingresos-mes'],
    ]);
  });
});
