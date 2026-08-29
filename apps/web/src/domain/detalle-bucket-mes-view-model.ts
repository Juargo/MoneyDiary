import { formatearMontoCLP } from './formatear-monto';
import { aPorcentajeLabel } from './porcentaje';
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
  readonly transacciones: ReadonlyArray<TransaccionDetalleMesViewModel>;
}

export interface DetalleBucketMesViewModel {
  readonly periodo: string;
  readonly bucket: string;
  /** `formatearMontoCLP(total)` — línea de totales del header. */
  readonly totalLabel: string;
  readonly totalTransacciones: number;
  readonly totalCategorias: number;
  /** `aPorcentajeLabel(porcentajeBp)` — `SIN_PORCENTAJE_LABEL` para un mes sin ingreso (MBD-03). */
  readonly porcentajeLabel: string;
  /** `aPorcentajeLabel(metaBp)` — `SIN_PORCENTAJE_LABEL` cuando el bucket no tiene regla de meta. */
  readonly metaLabel: string;
  /** `metaBp === null` → el %/meta TAG no se renderiza (SinCategoria, D-02). */
  readonly sinMeta: boolean;
  /** `porcentajeBp === null` → la barra de uso no se renderiza (mes sin ingreso, D-02). */
  readonly sinPorcentaje: boolean;
  /** Posición del marcador del % en 0..100 — `clamp(bp/100, 0, 100)`, presentación pura (WDM-08). */
  readonly marcaPorcentajePct: number;
  /** Posición del marcador de la meta en 0..100 — `null` cuando `metaBp` es `null`. */
  readonly marcaMetaPct: number | null;
  /** Los grupos del servidor, verbatim — sin re-sort ni re-agrupación (WDM-03). */
  readonly grupos: ReadonlyArray<GrupoDetalleMesViewModel>;
}

/** `bp` es basis points ≤ 10000 → bp/100 cabe en number seguro; el clamp es defensivo (D-02). */
function clampBp(bp: number): number {
  return Math.min(Math.max(bp / 100, 0), 100);
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
    transacciones: grupo.transacciones.map(aTransaccionViewModel),
  };
}

/**
 * Mapea el DTO HTTP (`DetalleBucketMesDto`, GET /api/buckets/:bucket/detalle)
 * al view model de la página `/buckets/:bucket` (US-053). Pura: sin React,
 * sin fetch. Principios (design.md §1.2/§1.3):
 *
 * - ADR-024/WDM-08: la ÚNICA derivación bp → etiqueta es `aPorcentajeLabel`
 *   (`SIN_PORCENTAJE_LABEL` para `null`) — el cliente nunca re-computa un
 *   ratio ni aplica lógica de umbral. Las posiciones de marcadores son
 *   presentación pura del wire (`clamp(bp/100, 0, 100)`).
 * - WDM-03: `grupos` pasa verbatim, en el orden exacto del servidor (es-CL
 *   alfabético, "Sin categoría" al final, MBD-02) — el cliente nunca
 *   re-ordena ni re-agrupa.
 * - `fecha` viaja verbatim (sin `aFechaLabel` — esa función muere con la
 *   cadena flat, D-08; el slice posicional no se porta).
 * - D-02: `sinMeta`/`sinPorcentaje` exponen las dos reglas de ocultamiento
 *   del header (tag vs barra), derivadas de los `null` del wire — nunca de
 *   comparaciones de etiqueta.
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
    porcentajeLabel: aPorcentajeLabel(dto.porcentajeBp),
    metaLabel: aPorcentajeLabel(dto.metaBp),
    sinMeta: dto.metaBp === null,
    sinPorcentaje: dto.porcentajeBp === null,
    marcaPorcentajePct: clampBp(dto.porcentajeBp ?? 0),
    marcaMetaPct: dto.metaBp === null ? null : clampBp(dto.metaBp),
    grupos: dto.grupos.map(aGrupoViewModel),
  };
}
