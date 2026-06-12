import { Result } from '../../shared/result';
import {
  IBankDetector,
  DetectedBank,
  BankDetectionError,
} from '../../application/ports/bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { ExcelBankDetectorService } from '../excel/excel-bank-detector.service';
import { PdfjsBankDetectorService } from '../pdf/pdfjs-bank-detector.service';
import { detectarFormato } from './format-sniffer';

/**
 * IBankDetector que despacha al detector Excel o PDF según la firma binaria del buffer.
 *
 * El nombre del archivo NO se usa para decidir formato (puede mentir). Confiamos
 * en la magic number del buffer: %PDF- vs PK\x03\x04.
 */
export class CompositeBankDetectorService implements IBankDetector {
  constructor(
    private readonly excel: ExcelBankDetectorService = new ExcelBankDetectorService(),
    private readonly pdf: PdfjsBankDetectorService = new PdfjsBankDetectorService(),
  ) {}

  async detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BankDetectionError>> {
    switch (detectarFormato(buffer)) {
      case 'xlsx':
        return this.excel.detect(buffer, originalName);
      case 'pdf':
        return this.pdf.detect(buffer, originalName);
      default:
        return Result.fail(new BancoNoReconocidoError(originalName));
    }
  }
}
