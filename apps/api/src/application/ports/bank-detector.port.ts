import { Result } from '../../shared/result';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { PdfSinTextoError } from '../../domain/errors/pdf-sin-texto.error';
import { PdfInvalidoError } from '../../domain/errors/pdf-invalido.error';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';

/** Resultado de la detección de banco. */
export interface DetectedBank {
  banco: BancoConocido;
  tipoCuenta: TipoCuentaConocido;
  numeroCuenta: string;
}

/**
 * Errores posibles al detectar el banco. La implementación Excel solo retorna
 * BancoNoReconocidoError; la implementación PDF puede también retornar
 * PdfSinTextoError o PdfInvalidoError. Ver ADR-009.
 */
export type BankDetectionError =
  | BancoNoReconocidoError
  | PdfSinTextoError
  | PdfInvalidoError;

/**
 * IBankDetector — port de aplicación.
 *
 * La implementación concreta vive en infrastructure/ (excel/ o pdf/)
 * y no es conocida por el use case. API asíncrona porque tanto ExcelJS
 * como pdfjs-dist son Promise-based. Ver ADR-007 y ADR-009.
 */
export interface IBankDetector {
  detect(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BankDetectionError>>;
}
