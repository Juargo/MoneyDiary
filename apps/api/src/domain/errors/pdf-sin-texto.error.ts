/**
 * PdfSinTextoError — el PDF no contiene una capa de texto extraíble.
 * Suele ocurrir con cartolas escaneadas (imagen). MoneyDiary no aplica OCR.
 */
export class PdfSinTextoError extends Error {
  constructor(nombreArchivo: string) {
    super(
      `El PDF "${nombreArchivo}" no contiene texto extraíble. ` +
        `Probablemente es un documento escaneado. Descarga la cartola en formato digital desde el portal del banco.`,
    );
    this.name = 'PdfSinTextoError';
  }
}
