import { Result } from '../../shared/result';
import {
  IBankDetector,
  DetectedBank,
  BankDetectionError,
} from '../../application/ports/bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { extractPdfPages } from './pdfjs-text-extractor';
import { BancoEstadoPdfStrategy } from './strategies/banco-estado-pdf.strategy';
import { BancoChilePdfStrategy } from './strategies/banco-chile-pdf.strategy';
import { SantanderPdfStrategy } from './strategies/santander-pdf.strategy';
import { BciPdfStrategy } from './strategies/bci-pdf.strategy';
import { PdfBankStrategy } from './strategies/pdf-bank-strategy';

/**
 * Implementación de IBankDetector para cartolas PDF.
 *
 * Carga la página 1 con pdfjs-dist, agrupa items por Y, y aplica cada
 * strategy en orden. Errores diferenciados: PdfInvalido (no abre),
 * PdfSinTexto (escaneado), BancoNoReconocido (ninguna strategy hace match).
 *
 * Ver ADR-009.
 */
export class PdfjsBankDetectorService implements IBankDetector {
  // Orden: más específico → más genérico. BancoChile va último porque su patrón
  // ("Estado de Cuenta" + "CUENTA CORRIENTE") es relativamente amplio y otros
  // bancos pueden tener "CUENTA CORRIENTE" en algún subtítulo.
  private readonly strategies: PdfBankStrategy[] = [
    new BancoEstadoPdfStrategy(),
    new SantanderPdfStrategy(),
    new BciPdfStrategy(),
    new BancoChilePdfStrategy(),
  ];

  async detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BankDetectionError>> {
    let pages;
    try {
      pages = await extractPdfPages(buffer, originalName);
    } catch (error) {
      if (error instanceof PdfInvalidoError) return Result.fail(error);
      throw error;
    }

    const firstPage = pages[0];
    if (!firstPage || firstPage.rows.length === 0) {
      return Result.fail(new PdfSinTextoError(originalName));
    }

    for (const strategy of this.strategies) {
      if (strategy.matches(firstPage)) {
        return Result.ok(strategy.extract(firstPage));
      }
    }

    return Result.fail(new BancoNoReconocidoError(originalName));
  }
}
