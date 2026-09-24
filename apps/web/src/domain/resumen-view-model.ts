import { formatearMontoCLP, formatearMontoConSigno } from './formatear-monto';
import {
  BUCKETS_5030,
  calcularDistribucionGasto,
  type TajadaGasto,
} from './distribucion-gasto';
import { aPorcentajeLabel } from './porcentaje';
import type { BucketResumenDto, ResumenMesDto } from '../api/types';

/**
 * Re-exportado desde `porcentaje.ts` (US-049, design §1.7's extraction) — los
 * importadores existentes de este módulo quedan intactos.
 */
export { SIN_PORCENTAJE_LABEL } from './porcentaje';

/**
 * ItemLeyenda — US-047 (design D-03), narrowed to 2 kinds in issue #778
 * tramo5b PR1: the `'sinCategoria'` kind (SinCategoria bucket row, `name ·
 * N tx · −CLP amount`) is REMOVED — the web legend no longer depends on the
 * SinCategoria bucket at all. No `esClickeable` field: interactivity is
 * derived from `kind` in presentation (`'gasto'` → button + chevron,
 * `'ingreso'` → its own button) — a boolean with exactly one possible value
 * per kind is a flag that is never toggled.
 */
export type ItemLeyenda =
  | {
      readonly kind: 'gasto';
      readonly bucket: string;
      /** Ring share from `calcularDistribucionGasto`'s apportionment. */
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

/**
 * Lean por diseño (design.md, decisión de scope): sin `periodoLabel` — no hay
 * header en esta pantalla (US-030 Slice B agrega `distribucionGasto`, antes
 * diferido; los demás campos derivados se agregan solo cuando un componente
 * concreto los necesite, YAGNI).
 *
 * `distribucionGasto` es puro dominio (`bucket`/`porcentaje`/`fraccion`) — el
 * color hex y la etiqueta UI ("Gustos" para "Deseos") se resuelven en la capa
 * de presentación (`DistribucionPie`/`LeyendaGasto` vía `lib/bucket-colors`),
 * igual que en mobile (`theme/colors.ts`). El dominio nunca importa `lib/`.
 */
export interface ResumenViewModel {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly buckets: ReadonlyArray<BucketViewModel>;
  /** Share-of-spending split for the pie + legend (77/12/11-style). */
  readonly distribucionGasto: ReadonlyArray<TajadaGasto>;
  readonly targets: ResumenMesDto['targets'];
  readonly estadoGlobal: string | null;
  /** Necesidades, Deseos, Ahorro — always in that order, `kind: 'gasto'` (D-03). */
  readonly leyendaPrincipal: ReadonlyArray<ItemLeyenda>;
  /** Just Ingresos (issue #778 tramo5b PR1 retired the Sin categoría row). */
  readonly leyendaComplemento: ReadonlyArray<ItemLeyenda>;
}

function aBucketViewModel(bucket: BucketResumenDto): BucketViewModel {
  return {
    bucket: bucket.bucket,
    total: formatearMontoCLP(bucket.total),
    porcentajeLabel: aPorcentajeLabel(bucket.porcentajeBp),
    estadoSemaforo: bucket.estadoSemaforo,
  };
}

/**
 * Money-safety join (I-2): `TajadaGasto` carries no money — the legend's
 * `montoLabel` is a separate projection built here by joining the ring's
 * bucket name against `dto.buckets`'s raw totals. Same belt-and-suspenders
 * money discipline: a bucket absent from the DTO (should not happen per the
 * backend's 4-canonical-buckets contract, but this stays defensive) degrades
 * to `'0'` instead of crashing the join.
 */
function totalPorBucket(
  buckets: ReadonlyArray<BucketResumenDto>,
  bucket: string,
): string {
  return buckets.find((b) => b.bucket === bucket)?.total ?? '0';
}

/**
 * `leyendaPrincipal` — the three 50/30/20 items, `kind: 'gasto'` (D-03).
 * Sourced directly from `distribucionGasto` (T2), filtered to `BUCKETS_5030`
 * membership. WG5-03: "the legend performs no independent percentage
 * computation of its own; it reuses the ring's own value".
 *
 * Issue #778 tramo5b PR1: `distribucionGasto` (via `calcularDistribucionGasto`'s
 * `BUCKETS_ANILLO` default) no longer includes a SinCategoria entry at all —
 * `BUCKETS_ANILLO` and `BUCKETS_5030` are now the same 3-item set, so this
 * filter is redundant with the upstream ring math today. It stays as a
 * defensive, belt-and-suspenders guard (same discipline as `totalPorBucket`'s
 * `?? '0'` fallback and `montoSeguro`'s money guard) rather than trusting the
 * ring's membership implicitly — a cheap safeguard if a future caller ever
 * passes a custom `bucketsIncluidos` here. Filtering preserves canonical
 * order (Necesidades, Deseos, Ahorro) and naturally empties when there is no
 * spending (design §3 edge case).
 */
function aLeyendaPrincipal(
  distribucionGasto: ReadonlyArray<TajadaGasto>,
  buckets: ReadonlyArray<BucketResumenDto>,
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
 * `leyendaComplemento` — just `[ingreso(+)]` (issue #778 tramo5b PR1 retired
 * the `sinCategoria` row this used to also carry, built from
 * `dto.cantidadSinCategoria`/the SinCategoria entry of `dto.buckets`; the API
 * still sends both, the web now simply never reads them here). Ingresos
 * stays visible even when `leyendaPrincipal` is empty (design §3 edge case).
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
 * sin React, sin fetch. Resuelve todo el formateo de dinero (BigInt-string-
 * safe vía formatearMontoCLP) y la regla null-vs-0% para que el componente
 * solo tenga que renderizar strings ya resueltas. `estadoSemaforo`/
 * `estadoGlobal` pasan verbatim — nunca se recomputan en el cliente (spec
 * W2-01).
 */
export function aResumenViewModel(dto: ResumenMesDto): ResumenViewModel {
  const distribucionGasto = calcularDistribucionGasto(dto.buckets);
  return {
    periodo: dto.periodo,
    totalIngreso: formatearMontoCLP(dto.totalIngreso),
    sinIngreso: dto.sinIngreso,
    buckets: dto.buckets.map(aBucketViewModel),
    distribucionGasto,
    targets: dto.targets,
    estadoGlobal: dto.estadoGlobal,
    leyendaPrincipal: aLeyendaPrincipal(distribucionGasto, dto.buckets),
    leyendaComplemento: aLeyendaComplemento(dto.totalIngreso),
  };
}
