import type { QueryClient } from '@tanstack/react-query';
import { CATEGORIAS_QUERY_KEY } from './use-categorias';

/**
 * categorias-invalidacion.ts — la matriz de invalidación como código
 * (US-043 design.md §1/Q5, WCTG-09). Dos perfiles, dos funciones
 * exportadas — cada hook de mutación de esta feature llama a UNA de las
 * dos en su `onSuccess` (seis hooks, dos comportamientos, un solo lugar
 * para cambiar cualquiera de los dos, `dry`; la elección queda visible en
 * cada call site, `kiss`).
 *
 * El estilo exacto de clave del narrow (`use-reclasificar-categoria.ts`) no
 * sirve acá y la razón es mecánica, no de estilo: ese hook recibe `periodo`
 * y `bucket` como argumentos porque su caller ya los conoce.
 * Configuración no conoce ninguno de los dos, así que ambas funciones usan
 * claves de PREFIJO (sin período ni bucket), el mismo idioma que
 * `use-eliminar-ingesta.ts:39-44`.
 */

/**
 * Perfil A — SOLO catálogo. Las tres mutaciones de PATRÓN
 * (crear/editar/borrar). `PatronClasificacion.coincide()` corre únicamente
 * dentro de `ProcessIngestaUseCase` al importar: crear/editar/borrar un
 * patrón NO toca ninguna transacción persistida ni ningún total del
 * dashboard. La EXCLUSIÓN de `['resumen']`/`['resumen-anual']`/
 * `['detalle-bucket-mes']` es deliberada y está cubierta por su propio test
 * dedicado (`categorias-invalidacion.test.ts`, no negociable #4).
 */
export function invalidarCatalogo(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: CATEGORIAS_QUERY_KEY });
}

/**
 * Perfil B — catálogo + las cuatro claves AMPLIAS del dashboard. Las tres
 * mutaciones de CATEGORÍA (crear/renombrar/re-bucketear/borrar). Claves de
 * PREFIJO (sin período ni bucket): esta pantalla no sabe qué períodos tiene
 * cacheados el dashboard, y un cambio de bucket re-estampa TODO el
 * historial (`CAT038-03`). Un rename-only también necesita las 5 —
 * `['detalle-bucket-mes']` en particular no es sobre-invalidación en ese caso:
 * el endpoint agrupado de drill-down agrupa por `tx.categoria?.nombre`
 * (design.md §1/Q5b). `['ingresos-mes']` se añade en US-055 D-09: un
 * re-bucketear puede afectar los totales de ingresos del mes.
 */
export function invalidarCatalogoYDashboard(qc: QueryClient): void {
  invalidarCatalogo(qc);
  void qc.invalidateQueries({ queryKey: ['resumen'] });
  void qc.invalidateQueries({ queryKey: ['resumen-anual'] });
  void qc.invalidateQueries({ queryKey: ['detalle-bucket-mes'] });
  void qc.invalidateQueries({ queryKey: ['ingresos-mes'] });
}
