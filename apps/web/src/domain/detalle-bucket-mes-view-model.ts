import { formatearMontoCLP } from './formatear-monto';
import type {
  DetalleBucketMesDto,
  GrupoDetalleBucketMesDto,
  TransaccionDetalleBucketMesDto,
} from '../api/types';

export interface TransaccionDetalleMesViewModel {
  readonly id: string;
  /** ISO-8601 UTC verbatim — la cadena viaja como llega del wire (WDM-03). */
  readonly fecha: string;
  readonly descripcion: string;
  /** Origen verbatim — nombre de banco o `'Manual'` (D-02). Señal esManual
   *  para el control de borrado por fila (WEB-DEL-01, PR3) — este slice
   *  solo la transporta, sin renderizarla todavía. */
  readonly origen: string;
  readonly montoLabel: string;
}

export interface GrupoDetalleMesViewModel {
  readonly categoriaId: string | null;
  readonly nombre: string;
  /** `formatearMontoCLP(subtotal)` — BigInt-exact, nunca `Number()`/`parseFloat()` (WCAT-02). */
  readonly subtotalLabel: string;
  readonly conteo: number;
  /**
   * categoria-iconografia (WDM-03, CATICO-06): nombre lucide del icono del
   * grupo, o `null` para "sin icono" — SIEMPRE `null` en el grupo sintético
   * Sin categoría (MBD-02). Normalizado con `?? null` porque el campo es
   * `.optional()` en el tipo generado (D-11), aunque el servidor SIEMPRE
   * emite la clave en runtime.
   */
  readonly icono: string | null;
  readonly transacciones: ReadonlyArray<TransaccionDetalleMesViewModel>;
}

export interface DetalleBucketMesViewModel {
  readonly periodo: string;
  readonly bucket: string;
  /** `formatearMontoCLP(total)` — línea de totales del header. */
  readonly totalLabel: string;
  readonly totalTransacciones: number;
  readonly totalCategorias: number;
  /** Los grupos del servidor, verbatim — sin re-sort ni re-agrupación (WDM-03). */
  readonly grupos: ReadonlyArray<GrupoDetalleMesViewModel>;
}

function aTransaccionViewModel(
  tx: TransaccionDetalleBucketMesDto,
): TransaccionDetalleMesViewModel {
  return {
    id: tx.id,
    fecha: tx.fecha,
    descripcion: tx.descripcion,
    origen: tx.origen,
    montoLabel: formatearMontoCLP(tx.monto),
  };
}

function aGrupoViewModel(
  grupo: GrupoDetalleBucketMesDto,
): GrupoDetalleMesViewModel {
  return {
    categoriaId: grupo.categoriaId,
    nombre: grupo.nombre,
    subtotalLabel: formatearMontoCLP(grupo.subtotal),
    conteo: grupo.conteo,
    icono: grupo.icono ?? null,
    transacciones: grupo.transacciones.map(aTransaccionViewModel),
  };
}

/**
 * Mapea el DTO HTTP (`DetalleBucketMesDto`, GET /api/buckets/:bucket/detalle)
 * al view model de la página `/buckets/:bucket` (US-053). Pura: sin React,
 * sin fetch. Principios (design.md §1.2/§1.3):
 *
 * - WDM-03: `grupos` pasa verbatim, en el orden exacto del servidor (es-CL
 *   alfabético, "Sin categoría" al final, MBD-02) — el cliente nunca
 *   re-ordena ni re-agrupa.
 * - `fecha` viaja verbatim (sin `aFechaLabel` — esa función muere con la
 *   cadena flat, D-08; el slice posicional no se porta).
 *
 * ⚠️ bucket-detalle-lista-rediseño (Cambio 1c): `porcentajeLabel`, `metaLabel`,
 * `sinMeta`, `sinPorcentaje`, `marcaPorcentajePct` y `marcaMetaPct` — el %/meta
 * TAG y la barra de uso que consumían estos campos (ADR-024/WDM-08, D-02) —
 * fueron RETIRADOS: `BucketDetalleMesPage` dejó de renderizar ambos a favor
 * de la franja de totales nueva (Cambio 2). `dto.porcentajeBp`/`dto.metaBp`
 * siguen llegando del wire pero ya no se mapean — el DTO en sí no cambió,
 * solo el view model dejó de derivar esos campos.
 */
export function aDetalleBucketMesViewModel(
  dto: DetalleBucketMesDto,
): DetalleBucketMesViewModel {
  return {
    periodo: dto.periodo,
    bucket: dto.bucket,
    totalLabel: formatearMontoCLP(dto.total),
    totalTransacciones: dto.totalTransacciones,
    totalCategorias: dto.totalCategorias,
    grupos: dto.grupos.map(aGrupoViewModel),
  };
}
