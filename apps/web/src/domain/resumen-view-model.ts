import {
  formatearMontoCLP,
  formatearMontoConSigno,
  esMontoStringValido,
} from './formatear-monto';
import {
  BUCKETS_5030,
  calcularDistribucionGasto,
  type TajadaGasto,
} from './distribucion-gasto';
import type { BucketResumenDto, ResumenMesDto } from '../api/types';

/**
 * Etiqueta explícita para "sin porcentaje": un `porcentajeBp: null` (camino
 * sinIngreso) NUNCA debe renderizarse como "0%" — se distingue con este
 * valor centinela para que el componente lo distinga de un 0 real (spec
 * W1-02, MOB-06 en mobile).
 */
export const SIN_PORCENTAJE_LABEL = '—';

/**
 * ItemLeyenda — US-047 (design D-03): a 3-kind discriminated union, not two
 * kinds with an optional field. The wireframe pins Sin categoría's row shape
 * as `name · N tx · −CLP amount` (no `%`) while the three spend buckets show
 * `name · % · CLP amount` — a real shape difference. Making `porcentaje`/
 * `cantidadLabel` optional on a shared kind would let a caller construct a
 * `'gasto'` item with a `cantidadLabel`, or omit `porcentaje` from Sin
 * categoría — states the type system should make unrepresentable. No
 * `esClickeable` field either: interactivity is derived from `kind` in
 * presentation (`'gasto'`/`'sinCategoria'` → button + chevron, `'ingreso'` →
 * inert `<li>`) — a boolean with exactly one possible value per kind is a
 * flag that is never toggled.
 */
export type ItemLeyenda =
  | {
      readonly kind: 'gasto';
      readonly bucket: string;
      /** Ring share from `calcularDistribucionGasto`'s 4-item apportionment. */
      readonly porcentaje: number;
      readonly montoLabel: string;
    }
  | {
      readonly kind: 'sinCategoria';
      readonly bucket: string;
      readonly montoLabel: string;
      /** Always present, never optional — e.g. '0 tx', never omitted for a real zero. */
      readonly cantidadLabel: string;
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
  /**
   * The bucket with the largest total among all 4 buckets (including
   * SinCategoria) — the dashboard's default selection for the transactions
   * panel before the user picks one explicitly (US-030 Slice B, task 30.10).
   * `null` only if `buckets` is empty (FIX 4) — the backend contract
   * guarantees the 4 canonical buckets today, but this stays defensive.
   */
  readonly bucketPorDefecto: string | null;
  readonly targets: ResumenMesDto['targets'];
  readonly estadoGlobal: string | null;
  /** Necesidades, Deseos, Ahorro — always in that order, `kind: 'gasto'` (D-03). */
  readonly leyendaPrincipal: ReadonlyArray<ItemLeyenda>;
  /** Ingresos, Sin categoría — always in that order (D-03). */
  readonly leyendaComplemento: ReadonlyArray<ItemLeyenda>;
}

/**
 * Convierte `porcentajeBp` (basis points, entero seguro como number) a una
 * etiqueta de porcentaje. `null` (camino sinIngreso) mapea a
 * SIN_PORCENTAJE_LABEL, nunca a "0%" — un `0` verdadero sí mapea a "0%".
 * bp/100 es seguro como number: bp ≤ 10000, muy por debajo de 2^53.
 */
function aPorcentajeLabel(porcentajeBp: number | null): string {
  if (porcentajeBp === null) {
    return SIN_PORCENTAJE_LABEL;
  }
  return `${porcentajeBp / 100}%`;
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
 * Belt-and-suspenders money guard (FIX 6): money is validated at the fetch
 * boundary (`client.ts`/`esMontoStringValido`), so this should never see a
 * malformed string in practice — but there is no ErrorBoundary in the app,
 * so an unvalidated bad string reaching a bare `BigInt(...)` here would
 * throw a raw `SyntaxError` mid-render (the exact past "money guard crash"
 * class). Degrades an invalid/empty total to `0n` instead of throwing.
 */
function montoSeguro(montoStr: string): bigint {
  return esMontoStringValido(montoStr) ? BigInt(montoStr) : 0n;
}

/**
 * The bucket with the largest raw money total, BigInt-compared (never
 * `Number`/`parseFloat` on a money string — same discipline as
 * `calcularDistribucionGasto`). The backend contract guarantees `buckets` is
 * always the 4 canonical buckets, but `Array.reduce` with no seed throws on
 * an empty array (FIX 4) — this returns `null` instead. On a tie (equal max
 * totals), the FIRST bucket in DTO order wins (strict `>` never replaces the
 * running max on equality).
 */
export function bucketConMayorTotal(
  buckets: ReadonlyArray<BucketResumenDto>,
): string | null {
  if (buckets.length === 0) {
    return null;
  }
  return buckets.reduce((mayor, actual) =>
    montoSeguro(actual.total) > montoSeguro(mayor.total) ? actual : mayor,
  ).bucket;
}

/**
 * Money-safety join (I-2): `TajadaGasto` carries no money — the legend's
 * `montoLabel` is a separate projection built here by joining the ring's
 * bucket name against `dto.buckets`'s raw totals. Same belt-and-suspenders
 * discipline as `montoSeguro`/`bucketConMayorTotal`: a bucket absent from
 * the DTO (should not happen per the backend's 4-canonical-buckets
 * contract, but this stays defensive) degrades to `'0'` instead of
 * crashing the join.
 */
function totalPorBucket(
  buckets: ReadonlyArray<BucketResumenDto>,
  bucket: string,
): string {
  return buckets.find((b) => b.bucket === bucket)?.total ?? '0';
}

/**
 * `leyendaPrincipal` — the three 50/30/20 items, `kind: 'gasto'` (D-03).
 * Sourced directly from the real 4-item `distribucionGasto` (`BUCKETS_ANILLO`,
 * T2), filtered to `BUCKETS_5030` membership — the PR1 renormalization shim
 * (`distribucionGastoInterina`) is gone as of T11/PR3. WG5-03: "the legend
 * performs no independent percentage computation of its own; it reuses the
 * ring's own value" — no renormalization here means the 3 spend-bucket
 * percentages numerically shrink whenever SinCategoria carries a nonzero
 * total, exactly like the ring's own wedges (WG5-13's dilution, now
 * user-visible in both places at once, by construction). Filtering (not
 * renormalizing) is safe here specifically because this function only reads
 * `porcentaje` for display — it does not drive any angle math, so there is
 * no forced-360-closure risk the way there would be if the PIE itself were
 * filtered post-hoc (that failure mode is why PR1's shim existed at all;
 * the pie now renders the unfiltered 4-item ring directly, see
 * `ResumenScreen.tsx`). Filtering preserves `BUCKETS_ANILLO`'s own canonical
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
 * `leyendaComplemento` — always `[ingreso(+), sinCategoria(-, cantidadLabel)]`
 * in that order (D-03), regardless of spending: Ingresos must stay visible
 * even when `leyendaPrincipal` is empty (design §3 edge case), and a real
 * `cantidadSinCategoria: 0` maps to a genuine, rendered `'0 tx'` row — never
 * an omission (WG5-05).
 */
function aLeyendaComplemento(dto: ResumenMesDto): ItemLeyenda[] {
  return [
    {
      kind: 'ingreso',
      montoLabel: formatearMontoConSigno(dto.totalIngreso, '+'),
    },
    {
      kind: 'sinCategoria',
      bucket: 'SinCategoria',
      montoLabel: formatearMontoConSigno(
        totalPorBucket(dto.buckets, 'SinCategoria'),
        '-',
      ),
      cantidadLabel: `${dto.cantidadSinCategoria} tx`,
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
    bucketPorDefecto: bucketConMayorTotal(dto.buckets),
    targets: dto.targets,
    estadoGlobal: dto.estadoGlobal,
    leyendaPrincipal: aLeyendaPrincipal(distribucionGasto, dto.buckets),
    leyendaComplemento: aLeyendaComplemento(dto),
  };
}
