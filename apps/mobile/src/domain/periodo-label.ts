const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/**
 * Formats a backend `periodo` ('YYYY-MM') into the header label the mockup
 * shows ("Junio 2026"). Pure and total: an unparseable value is returned
 * verbatim rather than throwing — the header must never crash the screen over
 * a formatting concern (the periodo is already backend-validated on the happy
 * path; this only guards the impossible case).
 */
export function formatearPeriodoLabel(periodo: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!match) {
    return periodo;
  }
  const anio = match[1];
  const mesIndex = Number(match[2]) - 1;
  const mes = MESES_ES[mesIndex];
  if (!mes) {
    return periodo;
  }
  return `${mes} ${anio}`;
}
