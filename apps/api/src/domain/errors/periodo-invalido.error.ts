/**
 * PeriodoInvalidoError — error de dominio.
 *
 * Se produce cuando el período proporcionado no sigue el formato YYYY-MM
 * o está fuera del rango de meses válidos (1-12).
 * Es un error de dominio porque la validación del período es una regla
 * de negocio central de la consulta de movimientos consolidados.
 */
export class PeriodoInvalidoError extends Error {
  constructor(raw: string) {
    super(
      `El período "${raw}" no es válido. Formato esperado: YYYY-MM (ej: 2026-07).`,
    );
    this.name = 'PeriodoInvalidoError';
  }
}
