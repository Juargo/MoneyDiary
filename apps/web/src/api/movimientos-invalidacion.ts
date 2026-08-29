import type { QueryClient } from '@tanstack/react-query';

/**
 * movimientos-invalidacion.ts — SDD `correccion-movimientos-manuales` PR 3
 * (design D-03). `invalidarCachesMovimiento` is the exact 4-key invalidation
 * `useEliminarMovimiento` fires on success — verbatim the same set
 * `useRegistrarMovimiento` already invalidates inline (`resumen`,
 * `resumen-anual`, `detalle-bucket-mes`, `ingresos-mes`): deleting a manual
 * movement changes the same totals/lists creating one did. Extracted into
 * this file (rather than inlined in the hook, `use-eliminar-ingesta.ts`
 * precedent) because it is now the THIRD occurrence of this exact 4-key set
 * (`useRegistrarMovimiento`, `useEliminarMovimiento`, and any future manual-
 * movement mutation) — the DRY 3-strikes rule (`categorias.ts` docstring)
 * is met, unlike the still-unextracted 2nd-occurrence `origen` derivation
 * (agrupar-detalle-por-categoria.ts / obtener-ingresos-mes.use-case.ts).
 *
 * No `['ingestas']` key: a manual movement is not an ingesta row (D-02),
 * same reasoning `useRegistrarMovimiento`'s docstring already states.
 */
export function invalidarCachesMovimiento(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['resumen'] });
  void qc.invalidateQueries({ queryKey: ['resumen-anual'] });
  void qc.invalidateQueries({ queryKey: ['detalle-bucket-mes'] });
  void qc.invalidateQueries({ queryKey: ['ingresos-mes'] });
}
