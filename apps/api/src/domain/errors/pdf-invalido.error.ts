/**
 * PdfInvalidoError — el archivo no se pudo abrir como un PDF válido.
 * Cubre corrupción, archivos vacíos o cifrados.
 */
export class PdfInvalidoError extends Error {
  constructor(nombreArchivo: string, causa?: string) {
    super(
      `El archivo "${nombreArchivo}" no es un PDF válido o está corrupto` +
        (causa ? `: ${causa}` : '.'),
    );
    this.name = 'PdfInvalidoError';
  }
}
