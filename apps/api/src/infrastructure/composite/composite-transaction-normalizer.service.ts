import { Result } from '../../shared/result';
import { ITransactionNormalizer } from '../../application/ports/transaction-normalizer.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { ExcelTransactionNormalizerService } from '../excel/excel-transaction-normalizer.service';
import { PdfjsTransactionNormalizerService } from '../pdf/pdfjs-transaction-normalizer.service';
import { detectarFormato } from './format-sniffer';

/**
 * ITransactionNormalizer que despacha al normalizador Excel o PDF según firma binaria.
 * Ambas implementaciones retornan la misma forma (Transaccion[]), no hace falta wrapping.
 */
export class CompositeTransactionNormalizerService implements ITransactionNormalizer {
  constructor(
    private readonly excel: ExcelTransactionNormalizerService = new ExcelTransactionNormalizerService(),
    private readonly pdf: PdfjsTransactionNormalizerService = new PdfjsTransactionNormalizerService(),
  ) {}

  async normalize(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>> {
    if (detectarFormato(buffer) === 'pdf') {
      return this.pdf.normalize(buffer, banco);
    }
    return this.excel.normalize(buffer, banco);
  }
}
