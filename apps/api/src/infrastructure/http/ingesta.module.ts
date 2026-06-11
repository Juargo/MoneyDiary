import { Module } from '@nestjs/common';
import { IngestaController } from './ingesta.controller';
import { IngestFileUseCase } from '../../application/use-cases/ingest-file.use-case';
import { DetectBankUseCase } from '../../application/use-cases/detect-bank.use-case';
import { ValidateStructureUseCase } from '../../application/use-cases/validate-structure.use-case';
import { NormalizeTransactionsUseCase } from '../../application/use-cases/normalize-transactions.use-case';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { ExcelBankDetectorService } from '../excel/excel-bank-detector.service';
import { ExcelStructureValidatorService } from '../excel/excel-structure-validator.service';
import { ExcelTransactionNormalizerService } from '../excel/excel-transaction-normalizer.service';
import { InMemoryTransactionRepository } from '../persistence/in-memory-transaction.repository';

/**
 * Tokens para inyectar implementaciones de puertos (las interfaces no
 * existen en runtime). Cuando se reemplace InMemoryTransactionRepository
 * por una implementación basada en Prisma, solo cambia el `useClass`
 * en el binding de TRANSACTION_REPOSITORY.
 */
export const BANK_DETECTOR = Symbol.for('IBankDetector');
export const STRUCTURE_VALIDATOR = Symbol.for('IStructureValidator');
export const TRANSACTION_NORMALIZER = Symbol.for('ITransactionNormalizer');
export const TRANSACTION_REPOSITORY = Symbol.for('ITransactionRepository');

/**
 * IngestaModule — Composition Root del módulo de Ingesta.
 *
 * Las clases del dominio y application son agnósticas a NestJS.
 * Aquí ensamblamos los use cases con sus dependencias usando `useFactory`
 * para mantener esa separación.
 */
@Module({
  controllers: [IngestaController],
  providers: [
    // Adapters de infrastructure (implementaciones concretas)
    { provide: BANK_DETECTOR, useClass: ExcelBankDetectorService },
    { provide: STRUCTURE_VALIDATOR, useClass: ExcelStructureValidatorService },
    { provide: TRANSACTION_NORMALIZER, useClass: ExcelTransactionNormalizerService },
    { provide: TRANSACTION_REPOSITORY, useClass: InMemoryTransactionRepository },

    // Use cases: armados con sus puertos
    IngestFileUseCase,
    {
      provide: DetectBankUseCase,
      useFactory: (detector) => new DetectBankUseCase(detector),
      inject: [BANK_DETECTOR],
    },
    {
      provide: ValidateStructureUseCase,
      useFactory: (validator) => new ValidateStructureUseCase(validator),
      inject: [STRUCTURE_VALIDATOR],
    },
    {
      provide: NormalizeTransactionsUseCase,
      useFactory: (normalizer) => new NormalizeTransactionsUseCase(normalizer),
      inject: [TRANSACTION_NORMALIZER],
    },
    {
      provide: ProcessIngestaUseCase,
      useFactory: (
        ingestFile: IngestFileUseCase,
        detectBank: DetectBankUseCase,
        validateStructure: ValidateStructureUseCase,
        normalizeTransactions: NormalizeTransactionsUseCase,
        repository,
      ) =>
        new ProcessIngestaUseCase(
          ingestFile,
          detectBank,
          validateStructure,
          normalizeTransactions,
          repository,
        ),
      inject: [
        IngestFileUseCase,
        DetectBankUseCase,
        ValidateStructureUseCase,
        NormalizeTransactionsUseCase,
        TRANSACTION_REPOSITORY,
      ],
    },
  ],
  exports: [TRANSACTION_REPOSITORY],
})
export class IngestaModule {}
