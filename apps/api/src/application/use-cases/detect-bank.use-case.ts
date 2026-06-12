import { Result } from '../../shared/result';
import {
  IBankDetector,
  DetectedBank,
  BankDetectionError,
} from '../ports/bank-detector.port';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';

export { BancoNoReconocidoError };

export class DetectBankUseCase {
  constructor(private readonly bankDetector: IBankDetector) {}

  async execute(
    buffer: Buffer,
    originalName: string,
  ): Promise<Result<DetectedBank, BankDetectionError>> {
    return this.bankDetector.detect(buffer, originalName);
  }
}
