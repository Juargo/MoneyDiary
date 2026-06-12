/**
 * Tipos de problemas que reporta la validación estructural de cartolas PDF.
 *
 *   TokenCabeceraFaltante  → un texto esperado (ej. "Fecha", "Saldo") no aparece en la página 1.
 *   RangoFechasInvalido    → no se pudo parsear DESDE/HASTA o equivalente desde la cabecera.
 *   TablaNoEncontrada      → no hay filas que parezcan datos en ninguna página.
 */
export type ProblemaPdf =
  | { tipo: 'TokenCabeceraFaltante'; tokenEsperado: string }
  | { tipo: 'RangoFechasInvalido'; detalle: string }
  | { tipo: 'TablaNoEncontrada' };

/**
 * Error de dominio: el PDF no cumple la estructura esperada para el banco.
 * Agrupa todos los problemas en una sola pasada (US-009 CA-06).
 */
export class EstructuraPdfInvalidaError extends Error {
  constructor(
    public readonly banco: string,
    public readonly problemas: ReadonlyArray<ProblemaPdf>,
  ) {
    super(EstructuraPdfInvalidaError.formatear(banco, problemas));
    this.name = 'EstructuraPdfInvalidaError';
  }

  private static formatear(
    banco: string,
    problemas: ReadonlyArray<ProblemaPdf>,
  ): string {
    const partes = problemas.map((p) => {
      switch (p.tipo) {
        case 'TokenCabeceraFaltante':
          return `Falta el texto esperado "${p.tokenEsperado}" en la cabecera del PDF.`;
        case 'RangoFechasInvalido':
          return `No se pudo determinar el rango de fechas del periodo: ${p.detalle}.`;
        case 'TablaNoEncontrada':
          return `No se encontraron filas de movimientos en el PDF.`;
      }
    });
    return `Estructura PDF inválida para ${banco}:\n  - ${partes.join('\n  - ')}`;
  }
}
