import { esMontoStringValido } from './formatear-monto';

/**
 * DOM port of `apps/mobile/src/domain/distribucion-gasto.ts` (verbatim: pure
 * BigInt math, no platform dependency).
 *
 * US-047 (design D-05): the old single `BUCKETS_GASTO` allowlist was split
 * into two constants so the compiler forces every call site to declare which
 * set it meant (no alias — deleting the old name makes `tsc` fail loudly
 * instead of silently keeping a stale membership).
 *
 * `BUCKETS_5030` — the three spending buckets, canonical display order. Still
 * the IDEAL 50/30/20 inset's set (`DistribucionPie`'s `slicesIdeales`): the
 * inset indexes `targets`, which has no `SinCategoria` key, so it must NOT
 * grow to the 4-item ring set.
 */
export const BUCKETS_5030 = ['Necesidades', 'Deseos', 'Ahorro'] as const;

/**
 * `BUCKETS_ANILLO` — the four ring members (WG5-01/WG5-13): the three spend
 * buckets plus `SinCategoria`, in ring order. `calcularDistribucionGasto`
 * apportions over these 4 items, so an uncategorized amount now dilutes the
 * three spend-bucket ring percentages instead of being excluded from the
 * denominator — the semantic core of US-047, not a regression.
 */
export const BUCKETS_ANILLO = [...BUCKETS_5030, 'SinCategoria'] as const;

const PRECISION = 1_000_000n;

export interface TajadaGasto {
  readonly bucket: string;
  /** Integer percentage. Across all tajadas these ALWAYS sum to exactly 100. */
  readonly porcentaje: number;
  /** Precise 0..1 share, for the pie arc angle. */
  readonly fraccion: number;
}

interface EntradaBucket {
  readonly bucket: string;
  readonly total: string;
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
 * Computes each spending bucket's SHARE OF TOTAL SPENDING (not share of
 * income — that is `porcentajeBp`, the 50/30/20 reading). Money totals are
 * BigInt-parsed decimal strings (never `parseFloat`/`Number` on an amount), so
 * buckets above 2^53 keep full precision in the ratio.
 *
 * Integer percentages are apportioned with the largest-remainder method so the
 * displayed numbers always sum to exactly 100 — never 99 or 101. When there is
 * no spending, returns `[]` so the caller can render an empty-pie placeholder
 * instead of dividing by zero.
 *
 * `bucketsIncluidos` (US-047 PR1 shim, judgment-day round 2 CRITICAL fix): a
 * trailing optional param, `BUCKETS_ANILLO` by default (byte-identical to the
 * pre-fix signature). Passing `BUCKETS_5030` apportions ONLY over the 3 spend
 * buckets — SinCategoria drops out of BOTH the numerator set and the
 * denominator, so the returned percentages sum to exactly 100 again. Without
 * this, a caller that filtered the 4-item `BUCKETS_ANILLO` result down to 3
 * items post-hoc would keep the DILUTED percentages (e.g. 40/25/25 instead of
 * 44/28/28), which don't sum to 100 — and `calcularAngulos`'s forced-360
 * closure would silently stretch the last wedge to absorb the missing share.
 */
export function calcularDistribucionGasto(
  buckets: ReadonlyArray<EntradaBucket>,
  bucketsIncluidos: ReadonlyArray<string> = BUCKETS_ANILLO,
): TajadaGasto[] {
  const porNombre = new Map(buckets.map((b) => [b.bucket, b.total]));

  const incluidos = bucketsIncluidos
    .filter((nombre) => porNombre.has(nombre))
    .map((nombre) => ({
      bucket: nombre,
      monto: montoSeguro(porNombre.get(nombre) as string),
    }));

  const total = incluidos.reduce((suma, b) => suma + b.monto, 0n);
  if (total <= 0n) {
    return [];
  }

  const fracciones = incluidos.map(
    (b) => Number((b.monto * PRECISION) / total) / 1_000_000,
  );

  const porcentajes = apportionarLargestRemainder(fracciones);

  return incluidos.map((b, i) => ({
    bucket: b.bucket,
    porcentaje: porcentajes[i],
    fraccion: fracciones[i],
  }));
}

/**
 * Largest-remainder apportionment: floor each `fraccion*100`, then hand the
 * leftover points (100 − sum of floors) one at a time to the buckets with the
 * biggest fractional remainder. Guarantees the integers sum to 100.
 */
function apportionarLargestRemainder(
  fracciones: ReadonlyArray<number>,
): number[] {
  const exactos = fracciones.map((f) => f * 100);
  const pisos = exactos.map(Math.floor);
  const asignados = pisos.reduce((a, b) => a + b, 0);
  let resto = 100 - asignados;

  const porcentajes = [...pisos];
  const porRemanente = exactos
    .map((e, i) => ({ i, remanente: e - pisos[i] }))
    .sort((a, b) => b.remanente - a.remanente);

  for (let k = 0; k < porRemanente.length && resto > 0; k++, resto--) {
    porcentajes[porRemanente[k].i] += 1;
  }
  return porcentajes;
}
