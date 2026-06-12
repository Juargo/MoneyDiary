import { DetectedBank } from '../../../application/ports/bank-detector.port';
import { PdfPage } from '../pdfjs-text-extractor';
import { EstructuraBancoPdf } from './estructura-banco-pdf';

/**
 * Contrato común para estrategias PDF por banco. Cada strategy:
 *   - Decide si un PDF le pertenece (matches).
 *   - Extrae banco/cuenta de la página 1 (extract).
 *   - Expone su metadata estructural para US-009 y US-010 (getEstructura).
 */
export interface PdfBankStrategy {
  matches(firstPage: PdfPage): boolean;
  extract(firstPage: PdfPage): DetectedBank;
  getEstructura(): EstructuraBancoPdf;
}
