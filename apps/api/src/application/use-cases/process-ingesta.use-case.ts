import { Result } from '../../shared/result';
import { IFileReader } from '../ports/file-reader.port';
import { ITransactionRepository } from '../ports/transaction-repository.port';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';

export interface ProcessIngestaResult {
  ingestaId: string;
  archivo: {
    nombre: string;
    extension: string;
    tamanoBytes: number;
  };
  banco: {
    banco: BancoConocido;
    tipoCuenta: TipoCuentaConocido;
    numeroCuenta: string;
  };
  transacciones: {
    total: number;
    cargos: number;
    abonos: number;
    totalCargos: number;
    totalAbonos: number;
  };
}

/**
 * ProcessIngestaUseCase — orquesta el pipeline completo de ingesta + persistencia.
 *
 * Pipeline:
 *   1. IngestFileUseCase           — valida extensión (.xlsx)
 *   2. DetectBankUseCase           — identifica banco, tipo y número de cuenta
 *   3. ValidateStructureUseCase    — valida encabezados y columnas
 *   4. NormalizeTransactionsUseCase → esquema canónico
 *   5. ITransactionRepository.saveIngesta — persiste el contexto + transacciones
 *
 * El `ingestaId` lo genera el storage (BigInt → string). El use case ya no
 * fabrica UUIDs propios.
 */
export class ProcessIngestaUseCase {
  constructor(
    private readonly ingestFile: IngestFileUseCase,
    private readonly detectBank: DetectBankUseCase,
    private readonly validateStructure: ValidateStructureUseCase,
    private readonly normalizeTransactions: NormalizeTransactionsUseCase,
    private readonly repository: ITransactionRepository,
  ) {}

  async execute(
    fileReader: IFileReader,
  ): Promise<Result<ProcessIngestaResult, Error>> {
    const ingestResult = this.ingestFile.execute(fileReader);
    if (ingestResult.isFail()) return Result.fail(ingestResult.getError());

    const fileData = ingestResult.getValue();

    const detectResult = await this.detectBank.execute(
      fileData.buffer,
      fileData.originalName,
    );
    if (detectResult.isFail()) return Result.fail(detectResult.getError());

    const bankData = detectResult.getValue();

    const validateResult = await this.validateStructure.execute(
      fileData.buffer,
      bankData.banco,
    );
    if (validateResult.isFail()) return Result.fail(validateResult.getError());

    const normalizeResult = await this.normalizeTransactions.execute(
      fileData.buffer,
      bankData.banco,
    );
    if (normalizeResult.isFail())
      return Result.fail(normalizeResult.getError());

    const transacciones = normalizeResult.getValue();

    const saveResult = await this.repository.saveIngesta({
      filename: fileData.originalName,
      banco: bankData.banco,
      tipoCuenta: bankData.tipoCuenta,
      numeroCuenta: bankData.numeroCuenta,
      transacciones,
    });
    if (saveResult.isFail()) return Result.fail(saveResult.getError());

    const { ingestaId } = saveResult.getValue();

    const totalCargos = transacciones.reduce((s, t) => s + t.cargo, 0);
    const totalAbonos = transacciones.reduce((s, t) => s + t.abono, 0);
    const cantCargos = transacciones.filter((t) => t.cargo > 0).length;
    const cantAbonos = transacciones.filter((t) => t.abono > 0).length;

    return Result.ok({
      ingestaId,
      archivo: {
        nombre: fileData.originalName,
        extension: fileData.extension,
        tamanoBytes: fileData.sizeInBytes,
      },
      banco: bankData,
      transacciones: {
        total: transacciones.length,
        cargos: cantCargos,
        abonos: cantAbonos,
        totalCargos,
        totalAbonos,
      },
    });
  }
}
