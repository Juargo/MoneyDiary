import { formatearMontoCLP } from './formatear-monto';
import { aPorcentajeLabel } from './porcentaje';
import type {
  SemaforoBucketDetalleDto,
  SemaforoDetalleDto,
} from '../api/types';

/**
 * Escala completa del semáforo en basis points (0 = 0%, 10000 = 100%). NO es
 * un umbral de clasificación de bucket (a diferencia de 5000/6000/3000/4000/
 * 2000/1000) — es la constante de escala del propio eje, la misma para
 * cualquier bucket (R2's "no threshold literal" guard no aplica a esta
 * constante).
 */
const ESCALA_BP = 10000;

export type EstadoSegmento = 'verde' | 'amarillo' | 'rojo';

/**
 * SegmentoZona — un tramo coloreado de la barra de zona, geometría pura
 * (US-049, design §1.7): `desdePct`/`anchoPct` en 0..100, siempre derivados
 * de `bandas` (nunca de un literal hardcodeado — R2 mitigation, pinned por
 * T6.8).
 */
export interface SegmentoZona {
  readonly estado: EstadoSegmento;
  readonly desdePct: number;
  readonly anchoPct: number;
  /** Texto visible del rango, p.ej. '0–50%' — nunca solo color (WSEM-08). */
  readonly etiqueta: string;
}

export interface ConsejoViewModel {
  readonly direccion: 'reducir' | 'aumentar';
  /** `mensaje` con `{monto}` ya sustituido por `formatearMontoCLP` (D-05/SEM-10). */
  readonly texto: string;
}

export interface BucketSemaforoViewModel {
  readonly bucket: string;
  readonly porcentajeLabel: string;
  readonly estadoSemaforo: string | null;
  /** p.ej. 'Meta: 50%', derivado de `metaBp`. */
  readonly metaLabel: string;
  /** Posición del marcador en 0..100, clamp de `porcentajeBp/100`. `null` cuando `porcentajeBp` es `null` (sinIngreso). */
  readonly markerPct: number | null;
  readonly segmentos: ReadonlyArray<SegmentoZona>;
  readonly consejo: ConsejoViewModel | null;
}

export interface SemaforoDetalleViewModel {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly estadoGlobal: string | null;
  readonly diagnostico: string;
  readonly bucketsCriticos: ReadonlyArray<string>;
  readonly buckets: ReadonlyArray<BucketSemaforoViewModel>;
  readonly sinCategoria: { readonly cantidad: number; readonly total: string };
}

function construirSegmentos(
  boundsBp: readonly number[],
  estados: readonly EstadoSegmento[],
): SegmentoZona[] {
  return estados.map((estado, i) => {
    const desdePct = boundsBp[i] / 100;
    const hastaPct = boundsBp[i + 1] / 100;
    return {
      estado,
      desdePct,
      anchoPct: hastaPct - desdePct,
      etiqueta: `${desdePct}–${hastaPct}%`,
    };
  });
}

/**
 * Deriva los segmentos de la barra de zona ÚNICAMENTE desde `bandas` (nunca
 * un umbral hardcodeado): buckets unilaterales (`verdeMin === null`) →
 * 3 segmentos (verde/amarillo/rojo, banda verde empieza en 0). Buckets
 * bilaterales (Ahorro) → 5 segmentos (rojo/amarillo/verde/amarillo/rojo).
 */
function segmentosDesdeBandas(
  bandas: SemaforoBucketDetalleDto['bandas'],
): SegmentoZona[] {
  if (bandas.verdeMin === null) {
    return construirSegmentos(
      [0, bandas.verdeMax, bandas.amarilloMax, ESCALA_BP],
      ['verde', 'amarillo', 'rojo'],
    );
  }
  // Contrato SEM-02: en un bucket bilateral, verdeMin y amarilloMin viajan
  // juntos — el `?? bandas.verdeMin` es solo defensivo, nunca debería
  // activarse con un payload válido.
  const amarilloMin = bandas.amarilloMin ?? bandas.verdeMin;
  return construirSegmentos(
    [
      0,
      amarilloMin,
      bandas.verdeMin,
      bandas.verdeMax,
      bandas.amarilloMax,
      ESCALA_BP,
    ],
    ['rojo', 'amarillo', 'verde', 'amarillo', 'rojo'],
  );
}

function markerPct(porcentajeBp: number | null): number | null {
  if (porcentajeBp === null) {
    return null;
  }
  return Math.min(Math.max(porcentajeBp / 100, 0), ESCALA_BP / 100);
}

/**
 * Sustituye el placeholder `{monto}` por el monto formateado en CLP
 * (D-05/SEM-10). Un mensaje sin el placeholder se renderiza verbatim
 * (defensivo — nunca debería ocurrir con un payload válido, per SEM-10's
 * "exactamente una vez").
 */
function aConsejoViewModel(
  consejo: SemaforoBucketDetalleDto['consejo'],
): ConsejoViewModel | null {
  if (consejo === null) {
    return null;
  }
  const montoFormateado = formatearMontoCLP(consejo.monto);
  const texto = consejo.mensaje.includes('{monto}')
    ? consejo.mensaje.replace('{monto}', montoFormateado)
    : consejo.mensaje;
  return { direccion: consejo.direccion, texto };
}

function aBucketSemaforoViewModel(
  bucket: SemaforoBucketDetalleDto,
): BucketSemaforoViewModel {
  return {
    bucket: bucket.bucket,
    porcentajeLabel: aPorcentajeLabel(bucket.porcentajeBp),
    estadoSemaforo: bucket.estadoSemaforo,
    metaLabel: `Meta: ${bucket.metaBp / 100}%`,
    markerPct: markerPct(bucket.porcentajeBp),
    segmentos: segmentosDesdeBandas(bucket.bandas),
    consejo: aConsejoViewModel(bucket.consejo),
  };
}

/**
 * Mapea el DTO HTTP (`SemaforoDetalleDto`) al view model de la página
 * `/semaforo` (US-049, design §1.7). Pura: sin React, sin fetch.
 * `estadoSemaforo`/`estadoGlobal`/`diagnostico`/`bucketsCriticos` pasan
 * verbatim — nunca se recomputan en el cliente (mismo principio que
 * `aResumenViewModel`, spec W2-01/WSEM-01).
 */
export function aSemaforoDetalleViewModel(
  dto: SemaforoDetalleDto,
): SemaforoDetalleViewModel {
  return {
    periodo: dto.periodo,
    totalIngreso: formatearMontoCLP(dto.totalIngreso),
    sinIngreso: dto.sinIngreso,
    estadoGlobal: dto.estadoGlobal,
    diagnostico: dto.diagnostico,
    bucketsCriticos: dto.bucketsCriticos,
    buckets: dto.buckets.map(aBucketSemaforoViewModel),
    sinCategoria: {
      cantidad: dto.sinCategoria.cantidad,
      total: formatearMontoCLP(dto.sinCategoria.total),
    },
  };
}
