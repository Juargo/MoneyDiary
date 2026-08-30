/**
 * Income trend vs the previous month (income card redesign, 2026-08-30):
 * the "+12% vs mes anterior" pill is derived CLIENT-side from the annual
 * `meses` payload the dashboard already fetches (`GET /api/resumen/anual`) —
 * a presentation-level percentage over two backend-served totals, same
 * discipline as `porcentaje.ts` (never recomputing money, never parseFloat:
 * the delta is exact BigInt arithmetic on the raw decimal strings, rounded
 * half away from zero to an integer percent).
 *
 * Deliberately duplicated in `apps/mobile/src/domain/variacion-ingreso.ts`
 * (ADR-008/024: no shared package) — keep both in sync, mirror of the
 * `veredicto-semaforo` pair.
 *
 * Structural input (`MesIngreso`) instead of the DTO type: web `domain/`
 * stays free of `api/` imports (see `api/types.ts`'s own note); the caller
 * adapts. Null (no pill, the honest degradation) whenever the comparison
 * has no base: current periodo missing from the window, current periodo is
 * the window's first month, either month empty (`sinIngreso`), previous
 * total zero, or a malformed amount.
 */
export interface MesIngreso {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
}

export interface VariacionIngreso {
  readonly etiqueta: string;
  readonly direccion: 'sube' | 'baja' | 'igual';
}

// Income totals are non-negative decimal strings (money contract W1-01);
// anything else is treated as not computable, never coerced.
const ENTERO_NO_NEGATIVO = /^\d+$/;

function totalComoBigInt(total: string): bigint | null {
  return ENTERO_NO_NEGATIVO.test(total) ? BigInt(total) : null;
}

export function calcularVariacionIngreso(
  periodo: string,
  meses: ReadonlyArray<MesIngreso>,
): VariacionIngreso | null {
  const indice = meses.findIndex((mes) => mes.periodo === periodo);
  if (indice <= 0) {
    return null;
  }

  const actual = meses[indice];
  const anterior = meses[indice - 1];
  if (actual.sinIngreso || anterior.sinIngreso) {
    return null;
  }

  const totalActual = totalComoBigInt(actual.totalIngreso);
  const totalAnterior = totalComoBigInt(anterior.totalIngreso);
  if (totalActual === null || totalAnterior === null || totalAnterior === 0n) {
    return null;
  }

  // Integer percent, rounded half away from zero: q + carry when the
  // remainder is at least half the (positive) divisor.
  const diferencia = (totalActual - totalAnterior) * 100n;
  let porcentaje = diferencia / totalAnterior;
  const resto = diferencia % totalAnterior;
  const restoAbsoluto = resto < 0n ? -resto : resto;
  if (restoAbsoluto * 2n >= totalAnterior) {
    porcentaje += diferencia < 0n ? -1n : 1n;
  }

  if (porcentaje === 0n) {
    return { etiqueta: 'Sin cambio vs mes anterior', direccion: 'igual' };
  }
  if (porcentaje > 0n) {
    return {
      etiqueta: `+${porcentaje}% vs mes anterior`,
      direccion: 'sube',
    };
  }
  return { etiqueta: `${porcentaje}% vs mes anterior`, direccion: 'baja' };
}
