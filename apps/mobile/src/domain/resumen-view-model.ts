import { formatearMontoCLP, formatearMontoConSigno } from './formatear-monto';
import {
  BUCKETS_5030,
  calcularDistribucionGasto,
  type TajadaGasto,
} from './distribucion-gasto';
import { mesAbreviado, mesCompletoLabel } from './periodo-anual';
import {
  SIN_PORCENTAJE_LABEL as _SIN_PORCENTAJE_LABEL,
  aPorcentajeLabel as _aPorcentajeLabel,
} from './porcentaje';
import type {
  BucketResumenDto,
  ResumenAnualDto,
  ResumenMesDto,
} from './resumen.types';

/**
 * Etiqueta explícita para "sin porcentaje" (MOB-06): un `porcentajeBp: null`
 * (camino sinIngreso) NUNCA debe renderizarse como "0%" — se distingue con
 * este valor centinela para que el componente lo distinga de un 0 real.
 *
 * Re-exported from porcentaje.ts (US-056, D-14): the canonical definition moved
 * there so detalle-mes view-models can use it without importing resumen-view-model.
 * This re-export keeps all existing call sites unchanged (zero churn).
 */
export const SIN_PORCENTAJE_LABEL = _SIN_PORCENTAJE_LABEL;

/**
 * ItemLeyenda — US-050 (design §1.4a), angostado a 2 kinds en issue #778
 * tramo5b PR2: el kind `'sinCategoria'` (fila del bucket SinCategoria,
 * `name · N tx · monto`) queda RETIRADO — la leyenda mobile deja de depender
 * del bucket SinCategoria por completo, mirroring apps/web's PR1. El
 * wireframe original fijaba formas de fila genuinamente distintas — un solo
 * kind con campos opcionales dejaría representables filas ilegales (p. ej.
 * un `'gasto'` con `cantidadLabel`).
 */
export type ItemLeyenda =
  | {
      readonly kind: 'gasto';
      readonly bucket: string;
      /** Share del anillo de `calcularDistribucionGasto`. */
      readonly porcentaje: number;
      readonly montoLabel: string;
    }
  | {
      readonly kind: 'ingreso';
      readonly montoLabel: string;
    };

export interface BucketViewModel {
  readonly bucket: string;
  readonly total: string;
  readonly porcentajeLabel: string;
  readonly estadoSemaforo: string | null;
}

export interface ResumenViewModel {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly buckets: readonly BucketViewModel[];
  /** Share-of-spending split for the pie + legend (77/12/11-style). */
  readonly distribucionGasto: readonly TajadaGasto[];
  readonly estadoGlobal: string | null;
  /** Necesidades, Deseos, Ahorro — siempre en ese orden, `kind: 'gasto'` (D-03). */
  readonly leyendaPrincipal: readonly ItemLeyenda[];
  /** Solo Ingresos (issue #778 tramo5b PR2 retiró la fila Sin categoría). */
  readonly leyendaComplemento: readonly ItemLeyenda[];
}

/** Una fila de la grilla anual (design §1.4c) — un mes ya proyectado a vista. */
export interface MesAnualViewModel {
  readonly periodo: string;
  /** '2026-07' → 'JUL' */
  readonly etiqueta: string;
  /** '2026-07' → 'julio 2026', para el nombre accesible ("Ver julio 2026"). */
  readonly nombreAccesible: string;
  /** `!sinIngreso` del mes. */
  readonly tieneDatos: boolean;
  /** Anillo del mes para la mini-torta. */
  readonly tajadas: readonly TajadaGasto[];
}

export interface ResumenAnualViewModel {
  readonly anio: number;
  readonly meses: readonly MesAnualViewModel[];
  /** true solo cuando los 12 meses tienen `sinIngreso`. */
  readonly sinDatosEnElAnio: boolean;
}

/**
 * Alias over the shared `aPorcentajeLabel` from porcentaje.ts (US-056, D-14).
 * The function was extracted there so detalle-mes view-models can reuse it
 * without a cross-module dependency on resumen-view-model. The private alias
 * here avoids touching any of the call sites in this file.
 */
const aPorcentajeLabel = _aPorcentajeLabel;

function aBucketViewModel(bucket: BucketResumenDto): BucketViewModel {
  return {
    bucket: bucket.bucket,
    total: formatearMontoCLP(bucket.total),
    porcentajeLabel: aPorcentajeLabel(bucket.porcentajeBp),
    estadoSemaforo: bucket.estadoSemaforo,
  };
}

/**
 * Money-safety join (design §1.4b, portado de apps/web): `TajadaGasto` no
 * carga dinero — `montoLabel` de la leyenda es una proyección separada
 * construida acá cruzando el nombre del bucket del anillo contra los
 * totales crudos de `dto.buckets`. Un bucket ausente del DTO (no debería
 * pasar dado el contrato de 4 buckets canónicos del backend, pero esto se
 * queda defensivo) degrada a `'0'` en vez de romper el cruce.
 */
function totalPorBucket(
  buckets: readonly BucketResumenDto[],
  bucket: string,
): string {
  return buckets.find((b) => b.bucket === bucket)?.total ?? '0';
}

/**
 * `leyendaPrincipal` — los tres items 50/30/20, `kind: 'gasto'` (D-03).
 * Sourced directamente del `distribucionGasto` real (`BUCKETS_ANILLO`),
 * filtrado a la membresía de `BUCKETS_5030`. WG5-03: "la leyenda no computa
 * su propio porcentaje; reutiliza el del anillo".
 *
 * Issue #778 tramo5b PR2: `distribucionGasto` (vía el default de
 * `BUCKETS_ANILLO` en `calcularDistribucionGasto`) ya no incluye una entrada
 * SinCategoria — `BUCKETS_ANILLO` y `BUCKETS_5030` son ahora el mismo set de
 * 3 items, así que este filtro queda redundante con la matemática del
 * anillo de aguas arriba. Se mantiene como guarda defensiva (misma
 * disciplina que el `?? '0'` de `totalPorBucket` y el guard de dinero de
 * `montoSeguro`) en vez de confiar implícitamente en la membresía del
 * anillo. Preserva el orden canónico (Necesidades, Deseos, Ahorro) y
 * naturalmente queda vacío cuando no hay gasto.
 */
function aLeyendaPrincipal(
  distribucionGasto: readonly TajadaGasto[],
  buckets: readonly BucketResumenDto[],
): ItemLeyenda[] {
  const bucketsGasto: ReadonlySet<string> = new Set(BUCKETS_5030);
  return distribucionGasto
    .filter((t) => bucketsGasto.has(t.bucket))
    .map((t) => ({
      kind: 'gasto' as const,
      bucket: t.bucket,
      porcentaje: t.porcentaje,
      montoLabel: formatearMontoConSigno(
        totalPorBucket(buckets, t.bucket),
        '-',
      ),
    }));
}

/**
 * `leyendaComplemento` — solo `[ingreso(+)]` (issue #778 tramo5b PR2 retiró
 * la fila `sinCategoria` que esta función también construía, a partir de
 * `dto.cantidadSinCategoria`/la entrada SinCategoria de `dto.buckets`; la
 * API sigue mandando ambos, mobile simplemente ya no los lee acá). Ingresos
 * se mantiene visible incluso cuando `leyendaPrincipal` está vacío (design
 * §3 edge case).
 */
function aLeyendaComplemento(totalIngreso: string): ItemLeyenda[] {
  return [
    {
      kind: 'ingreso',
      montoLabel: formatearMontoConSigno(totalIngreso, '+'),
    },
  ];
}

/**
 * Mapea el DTO HTTP (`ResumenMesDto`) al view model de la pantalla. Pura:
 * sin React Native, sin fetch. Resuelve todo el formateo de dinero
 * (BigInt-string-safe vía formatearMontoCLP) y las reglas null-vs-0%
 * (MOB-06) para que el componente solo tenga que renderizar strings ya
 * resueltas. `estadoSemaforo`/`estadoGlobal` pasan verbatim — nunca se
 * recomputan en el cliente (ADR-024).
 */
export function aResumenViewModel(dto: ResumenMesDto): ResumenViewModel {
  const distribucionGasto = calcularDistribucionGasto(dto.buckets);
  return {
    periodo: dto.periodo,
    totalIngreso: formatearMontoCLP(dto.totalIngreso),
    sinIngreso: dto.sinIngreso,
    buckets: dto.buckets.map(aBucketViewModel),
    distribucionGasto,
    estadoGlobal: dto.estadoGlobal,
    leyendaPrincipal: aLeyendaPrincipal(distribucionGasto, dto.buckets),
    leyendaComplemento: aLeyendaComplemento(dto.totalIngreso),
  };
}

/**
 * Mapea el DTO anual (`ResumenAnualDto`, GET /api/resumen/anual) a la vista
 * de la grilla de 12 meses (design §1.4c). Deriva el anillo de cada mes UNA
 * VEZ por fetch (no en cada render de celda) — lo que hace barata la
 * re-renderización de la grilla de 12 minis en cada tap de mes.
 */
export function aResumenAnualViewModel(
  dto: ResumenAnualDto,
): ResumenAnualViewModel {
  const meses: MesAnualViewModel[] = dto.meses.map((mes) => ({
    periodo: mes.periodo,
    etiqueta: mesAbreviado(mes.periodo),
    nombreAccesible: mesCompletoLabel(mes.periodo),
    tieneDatos: !mes.sinIngreso,
    tajadas: calcularDistribucionGasto(mes.buckets),
  }));
  return {
    anio: dto.anio,
    meses,
    sinDatosEnElAnio: meses.every((m) => !m.tieneDatos),
  };
}
