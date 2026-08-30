import type { MesIngreso } from './variacion-ingreso';

/**
 * Income sparkline view-model (income card redesign, 2026-08-30): the last
 * up to 7 months ending at the current periodo, each mapped to a height
 * fraction of the window max. The FRACTION is presentation geometry (the
 * pie-slice precedent), but totals are compared and scaled in BigInt first
 * (per-mille, then /1000) so beyond-safe-integer amounts never round before
 * the final ratio. Empty months keep a minimal stub height so the rhythm of
 * the window stays readable (a hole would read as missing data, not zero).
 *
 * Deliberately duplicated in `apps/mobile/src/domain/sparkline-ingreso.ts`
 * (ADR-008/024) — keep both in sync.
 *
 * Empty result (no sparkline, honest degradation) when: the current periodo
 * is not in the data, the window holds fewer than 2 months (nothing to
 * compare), or every month in the window is zero.
 */
export interface BarraIngreso {
  readonly periodo: string;
  /** Height fraction in (0, 1]; empty months are clamped to the stub. */
  readonly fraccion: number;
  readonly esActual: boolean;
}

const VENTANA_MESES = 7;
const FRACCION_MINIMA = 0.08;
const ENTERO_NO_NEGATIVO = /^\d+$/;

export function calcularBarrasIngreso(
  periodo: string,
  meses: ReadonlyArray<MesIngreso>,
): ReadonlyArray<BarraIngreso> {
  const indice = meses.findIndex((mes) => mes.periodo === periodo);
  if (indice < 0) {
    return [];
  }

  const ventana = meses.slice(
    Math.max(0, indice - (VENTANA_MESES - 1)),
    indice + 1,
  );
  if (ventana.length < 2) {
    return [];
  }

  const totales = ventana.map((mes) =>
    !mes.sinIngreso && ENTERO_NO_NEGATIVO.test(mes.totalIngreso)
      ? BigInt(mes.totalIngreso)
      : 0n,
  );
  const maximo = totales.reduce(
    (max, total) => (total > max ? total : max),
    0n,
  );
  if (maximo === 0n) {
    return [];
  }

  return ventana.map((mes, i) => ({
    periodo: mes.periodo,
    fraccion: Math.max(
      Number((totales[i] * 1000n) / maximo) / 1000,
      FRACCION_MINIMA,
    ),
    esActual: mes.periodo === periodo,
  }));
}
