import { esMontoStringValido } from './formatear-monto';

/**
 * US-050 (design §1.2): the old single `BUCKETS_GASTO` allowlist was split
 * into two constants so the compiler forces every call site to declare which
 * set it meant (no alias — deleting the old name makes `tsc` fail loudly
 * instead of silently keeping a stale membership). Convergence back to
 * apps/web/src/domain/distribucion-gasto.ts, which was originally a port OF
 * this file.
 *
 * `BUCKETS_5030` — the three spending buckets, canonical display order (the
 * legend's `leyendaPrincipal` filters the 4-item ring down to this set for
 * display, WITHOUT renormalizing — see design §1.4).
 */
export const BUCKETS_5030 = ['Necesidades', 'Deseos', 'Ahorro'] as const;

/**
 * `BUCKETS_ANILLO` — the four ring members (US-047 WG5-13): the three spend
 * buckets plus `SinCategoria`, in ring order. `calcularDistribucionGasto`
 * apportions over these 4 items, so an uncategorized amount DILUTES the
 * three spend-bucket ring percentages instead of being excluded from the
 * denominator.
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
 * Belt-and-suspenders money guard (US-050, design §1.2 — ported from
 * apps/web/src/domain/distribucion-gasto.ts). Money is validated at the
 * fetch boundary (`api/client.ts`/`esMontoStringValido`, D-14), so this
 * should never see a malformed string in practice — but there is no
 * ErrorBoundary in this app, so an unvalidated bad string reaching a bare
 * `BigInt(...)` here would throw a raw `SyntaxError` mid-render. Degrades an
 * invalid/empty total to `0n` instead of throwing.
 */
function montoSeguro(montoStr: string): bigint {
  return esMontoStringValido(montoStr) ? BigInt(montoStr) : 0n;
}

/**
 * Computes each spending bucket's SHARE OF TOTAL SPENDING (not share of
 * income — that is `porcentajeBp`, the 50/30/20 reading). Money totals are
 * BigInt-parsed decimal strings (MOB-05: never `parseFloat`/`Number` on an
 * amount), so buckets above 2^53 keep full precision in the ratio.
 *
 * Integer percentages are apportioned with the largest-remainder method so the
 * displayed numbers always sum to exactly 100 — never 99 or 101. When there is
 * no spending, returns `[]` so the caller can render an empty-pie placeholder
 * instead of dividing by zero.
 *
 * Apportions over `BUCKETS_ANILLO` (4 items) — mobile does NOT port web's
 * trailing optional `bucketsIncluidos` parameter (design §1.2 D-08): every
 * mobile call site wants the full 4-item ring, and the legend filters
 * (never renormalizes) for display.
 */
export function calcularDistribucionGasto(
  buckets: readonly EntradaBucket[],
): TajadaGasto[] {
  const porNombre = new Map(buckets.map((b) => [b.bucket, b.total]));

  const incluidos = BUCKETS_ANILLO.filter((nombre) =>
    porNombre.has(nombre),
  ).map((nombre) => ({
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
function apportionarLargestRemainder(fracciones: readonly number[]): number[] {
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
