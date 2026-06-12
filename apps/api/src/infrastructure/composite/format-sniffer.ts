/**
 * Detecta el formato del archivo por su firma binaria (magic number).
 *
 *   PDF   → "%PDF-"
 *   XLSX  → "PK\x03\x04" (ZIP — XLSX es un ZIP de XMLs)
 *
 * Usado por los composites para despachar al adapter Excel o PDF sin
 * necesidad de pasar la extensión por el port.
 */
export type FormatoArchivo = 'xlsx' | 'pdf' | 'desconocido';

const FIRMA_PDF = Buffer.from('%PDF-', 'ascii');
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

export function detectarFormato(buffer: Buffer): FormatoArchivo {
  if (buffer.length >= FIRMA_PDF.length && buffer.subarray(0, FIRMA_PDF.length).equals(FIRMA_PDF)) {
    return 'pdf';
  }
  if (buffer.length >= FIRMA_ZIP.length && buffer.subarray(0, FIRMA_ZIP.length).equals(FIRMA_ZIP)) {
    return 'xlsx';
  }
  return 'desconocido';
}
