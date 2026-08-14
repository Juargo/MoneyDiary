import { formatearMontoCLP } from './formatear-monto';
import { aFilaViewModel } from './detalle-bucket-view-model';
import type { DetalleBucketRowViewModel } from './detalle-bucket-view-model';
import type { DetalleBucketTransaccionDto } from '../api/types';

const BUCKET_INGRESO = 'Ingreso';
const NOMBRE_SIN_CATEGORIA = 'Sin categoría';
const CLAVE_SIN_CATEGORIA = 'sin-categoria';

export interface GrupoCategoriaViewModel {
  readonly categoriaId: string | null;
  readonly nombre: string;
  readonly subtotalLabel: string;
  readonly conteo: number;
  readonly filas: ReadonlyArray<DetalleBucketRowViewModel>;
}

interface GrupoAcumulador {
  readonly categoriaId: string | null;
  readonly nombre: string;
  subtotal: bigint;
  readonly filas: DetalleBucketRowViewModel[];
}

/**
 * Lado del monto relevante para el subtotal del grupo — espeja la disciplina
 * de `calcular-resumen-mes.use-case.ts` en el backend: el bucket Ingreso suma
 * `abono`, todo otro bucket (Necesidades/Deseos/Ahorro/SinCategoria) suma
 * `cargo`. `Ingreso` no es un bucket seleccionable hoy desde la UI (el pie
 * solo ofrece los 3 buckets de gasto + SinCategoria vía leyenda), pero la
 * función se mantiene correcta/defensiva para cualquier bucket, no solo los
 * alcanzables — evita una regla de negocio implícita sobre qué buckets
 * "nunca llegan aquí".
 */
function montoRelevante(
  tx: DetalleBucketTransaccionDto,
  bucket: string,
): string {
  return bucket === BUCKET_INGRESO ? tx.abono : tx.cargo;
}

/**
 * Orden alfabético es-CL, con "Sin categoría" SIEMPRE al final. Reemplaza el
 * orden fijo de las 8 categorías semilla (ADR-036/037: el catálogo es un set
 * de filas por usuario, no un enum cerrado — ya no existe un orden canónico
 * que espejar). El locale es EXPLÍCITO: los nombres creados por el usuario
 * llevan tildes y ñ, y la colación por defecto depende del ICU disponible en
 * el runtime, así que sin `'es-CL'` el orden cambiaría entre Node y
 * navegador (design.md §1/Q7b).
 */
function compararGrupos(a: string, b: string): number {
  if (a === NOMBRE_SIN_CATEGORIA) return b === NOMBRE_SIN_CATEGORIA ? 0 : 1;
  if (b === NOMBRE_SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es-CL');
}

/**
 * agruparDetallePorCategoria — agrupa las transacciones de UN bucket (ya
 * filtrado por el caller, US-017) por `categoria` (WCAT-02). Pura: sin
 * React, sin fetch. El subtotal de cada grupo se calcula en `BigInt` a
 * partir del string decimal exacto (nunca `Number()`/`parseFloat()` —
 * ADR-015), preservando cada dígito incluso más allá de
 * `Number.MAX_SAFE_INTEGER`.
 *
 * Las filas con `categoria === null` (SinCategoria bucket, o una fila no
 * matcheada en un bucket de gasto) caen en un grupo sintético
 * "Sin categoría" (`categoriaId: null`). Los grupos se ordenan
 * alfabéticamente (locale `es-CL`, WCAT-02 delta), con "Sin categoría"
 * siempre al final, independiente de su conteo. Solo se producen grupos para
 * categorías realmente presentes en `transacciones` (nunca grupos vacíos).
 */
export function agruparDetallePorCategoria(
  transacciones: ReadonlyArray<DetalleBucketTransaccionDto>,
  bucket: string,
): ReadonlyArray<GrupoCategoriaViewModel> {
  const grupos = new Map<string, GrupoAcumulador>();

  for (const tx of transacciones) {
    const clave = tx.categoria?.id ?? CLAVE_SIN_CATEGORIA;
    const monto = BigInt(montoRelevante(tx, bucket));
    const fila = aFilaViewModel(tx);

    const existente = grupos.get(clave);
    if (existente) {
      existente.subtotal += monto;
      existente.filas.push(fila);
      continue;
    }
    grupos.set(clave, {
      categoriaId: tx.categoria?.id ?? null,
      nombre: tx.categoria?.nombre ?? NOMBRE_SIN_CATEGORIA,
      subtotal: monto,
      filas: [fila],
    });
  }

  return Array.from(grupos.values())
    .sort((a, b) => compararGrupos(a.nombre, b.nombre))
    .map((grupo) => ({
      categoriaId: grupo.categoriaId,
      nombre: grupo.nombre,
      subtotalLabel: formatearMontoCLP(grupo.subtotal.toString()),
      conteo: grupo.filas.length,
      filas: grupo.filas,
    }));
}
