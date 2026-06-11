import { randomUUID } from 'node:crypto';
import { Result } from '../../shared/result';
import { IFileReader } from '../ports/file-reader.port';
import { ITransactionRepository } from '../ports/transaction-repository.port';
import { IngestFileUseCase } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

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
 * Encadena los cuatro use cases existentes y, si todo va bien, persiste las
 * transacciones normalizadas en el repositorio. Cada transacción almacenada
 * se enriquece con id propio + ingestaId común para poder agruparlas.
 *
 * Pipeline:
 *   1. IngestFileUseCase           — valida extensión (.xlsx)
 *   2. DetectBankUseCase           — identifica banco, tipo y número de cuenta
 *   3. ValidateStructureUseCase    — valida encabezados y columnas
 *   4. NormalizeTransactionsUseCase → esquema canónico
 *   5. ITransactionRepository.saveMany — persiste
 *
 * No lanza excepciones — devuelve Result<T,E>. El tipo de error es genérico
 * (Error) porque cada paso puede fallar con un error distinto.
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
    const ingestaId = randomUUID();

    const almacenadas: TransaccionAlmacenada[] = transacciones.map((t) => ({
      ...t,
      id: randomUUID(),
      ingestaId,
      banco: bankData.banco,
      tipoCuenta: bankData.tipoCuenta,
      numeroCuenta: bankData.numeroCuenta,
    }));

    const saveResult = await this.repository.saveMany(almacenadas);
    if (saveResult.isFail()) return Result.fail(saveResult.getError());

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
