/**
 * The three spending buckets that make up the "Distribución del gasto" pie,
 * in the canonical display order. `SinCategoria` is deliberately excluded —
 * the mockup's pie is the split across these three, and an uncategorized
 * amount is neither a need, a want, nor savings.
 */
const BUCKETS_GASTO = ['Necesidades', 'Deseos', 'Ahorro'] as const;

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
 * Computes each spending bucket's SHARE OF TOTAL SPENDING (not share of
 * income — that is `porcentajeBp`, the 50/30/20 reading). Money totals are
 * BigInt-parsed decimal strings (MOB-05: never `parseFloat`/`Number` on an
 * amount), so buckets above 2^53 keep full precision in the ratio.
 *
 * Integer percentages are apportioned with the largest-remainder method so the
 * displayed numbers always sum to exactly 100 — never 99 or 101. When there is
 * no spending, returns `[]` so the caller can render an empty-pie placeholder
 * instead of dividing by zero.
 */
export function calcularDistribucionGasto(
  buckets: ReadonlyArray<EntradaBucket>,
): TajadaGasto[] {
  const porNombre = new Map(buckets.map((b) => [b.bucket, b.total]));

  const incluidos = BUCKETS_GASTO.filter((nombre) => porNombre.has(nombre)).map(
    (nombre) => ({ bucket: nombre, monto: BigInt(porNombre.get(nombre) as string) }),
  );

  const total = incluidos.reduce((suma, b) => suma + b.monto, 0n);
  if (total <= 0n) {
    return [];
  }

  const fracciones = incluidos.map((b) => Number((b.monto * PRECISION) / total) / 1_000_000);

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
function apportionarLargestRemainder(fracciones: ReadonlyArray<number>): number[] {
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
