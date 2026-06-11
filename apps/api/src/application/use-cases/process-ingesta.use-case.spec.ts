import { ProcessIngestaUseCase } from './process-ingesta.use-case';
import { IngestFileUseCase, InvalidFileExtensionError } from './ingest-file.use-case';
import { DetectBankUseCase } from './detect-bank.use-case';
import { ValidateStructureUseCase } from './validate-structure.use-case';
import { NormalizeTransactionsUseCase } from './normalize-transactions.use-case';
import { Result } from '../../shared/result';
import { IFileReader } from '../ports/file-reader.port';
import {
  ITransactionRepository,
  SaveIngestaInput,
  SaveIngestaResult,
} from '../ports/transaction-repository.port';
import { randomUUID } from 'node:crypto';
import { IBankDetector, DetectedBank } from '../ports/bank-detector.port';
import {
  IStructureValidator,
  ValidatedStructure,
} from '../ports/structure-validator.port';
import { ITransactionNormalizer } from '../ports/transaction-normalizer.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';
import { BancoNoReconocidoError } from '../../domain/errors/banco-no-reconocido.error';
import { NormalizacionInvalidaError } from '../../domain/errors/normalizacion-invalida.error';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';

function makeFileReader(overrides: Partial<{
  buffer: Buffer;
  originalName: string;
  sizeInBytes: number;
}> = {}): IFileReader {
  return {
    getBuffer: () => overrides.buffer ?? Buffer.from('binary'),
    getOriginalName: () => overrides.originalName ?? 'cartola.xlsx',
    getSizeInBytes: () => overrides.sizeInBytes ?? 4096,
  };
}

function makeBankDetector(result: Result<DetectedBank, BancoNoReconocidoError>): IBankDetector {
  return { detect: () => Promise.resolve(result) };
}

function makeStructureValidator(
  result: Result<ValidatedStructure, EstructuraInvalidaError>,
): IStructureValidator {
  return { validate: () => Promise.resolve(result) };
}

function makeNormalizer(
  result: Result<ReadonlyArray<Transaccion>, NormalizacionInvalidaError>,
): ITransactionNormalizer {
  return { normalize: () => Promise.resolve(result) };
}

class FakeRepository implements ITransactionRepository {
  readonly saved: TransaccionAlmacenada[] = [];
  lastInput?: SaveIngestaInput;

  saveIngesta(input: SaveIngestaInput): Promise<Result<SaveIngestaResult, Error>> {
    this.lastInput = input;
    const ingestaId = randomUUID();
    const almacenadas: TransaccionAlmacenada[] = input.transacciones.map((t) => ({
      ...t,
      id: randomUUID(),
      ingestaId,
      banco: input.banco,
      tipoCuenta: input.tipoCuenta,
      numeroCuenta: input.numeroCuenta,
    }));
    this.saved.push(...almacenadas);
    return Promise.resolve(Result.ok({ ingestaId, count: almacenadas.length }));
  }

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    return Promise.resolve([...this.saved]);
  }
}

const detectedBank: DetectedBank = {
  banco: BancoConocido.BCI,
  tipoCuenta: TipoCuentaConocido.CuentaCorriente,
  numeroCuenta: '12345678',
};

const validatedStructure: ValidatedStructure = {
  banco: BancoConocido.BCI,
  filaEncabezados: 8,
  primeraFilaDatos: 9,
  totalFilasDatos: 2,
};

const transacciones: Transaccion[] = [
  { fecha: new Date('2026-05-14'), descripcion: 'Compra A', cargo: 8103, abono: 0 },
  { fecha: new Date('2026-05-15'), descripcion: 'Sueldo', cargo: 0, abono: 1_500_000 },
];

function buildUseCase(overrides: Partial<{
  bankDetector: IBankDetector;
  structureValidator: IStructureValidator;
  normalizer: ITransactionNormalizer;
  repository: ITransactionRepository;
}> = {}) {
  const bankDetector = overrides.bankDetector ?? makeBankDetector(Result.ok(detectedBank));
  const structureValidator =
    overrides.structureValidator ?? makeStructureValidator(Result.ok(validatedStructure));
  const normalizer = overrides.normalizer ?? makeNormalizer(Result.ok(transacciones));
  const repository = overrides.repository ?? new FakeRepository();

  return new ProcessIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(bankDetector),
    new ValidateStructureUseCase(structureValidator),
    new NormalizeTransactionsUseCase(normalizer),
    repository,
  );
}

describe('ProcessIngestaUseCase', () => {
  it('encadena los 4 pasos y persiste cuando todo va bien', async () => {
    const repo = new FakeRepository();
    const useCase = buildUseCase({ repository: repo });

    const result = await useCase.execute(makeFileReader());

    expect(result.isOk()).toBe(true);
    const data = result.getValue();
    expect(data.archivo.nombre).toBe('cartola.xlsx');
    expect(data.archivo.extension).toBe('.xlsx');
    expect(data.banco).toEqual(detectedBank);
    expect(data.transacciones.total).toBe(2);
    expect(data.transacciones.cargos).toBe(1);
    expect(data.transacciones.abonos).toBe(1);
    expect(data.transacciones.totalCargos).toBe(8103);
    expect(data.transacciones.totalAbonos).toBe(1_500_000);
    expect(repo.saved).toHaveLength(2);
  });

  it('enriquece cada transacción persistida con id, ingestaId y contexto del banco', async () => {
    const repo = new FakeRepository();
    const useCase = buildUseCase({ repository: repo });

    const result = await useCase.execute(makeFileReader());

    expect(result.isOk()).toBe(true);
    const ingestaId = result.getValue().ingestaId;
    expect(ingestaId).toMatch(/^[0-9a-f-]{36}$/);

    for (const tx of repo.saved) {
      expect(tx.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(tx.ingestaId).toBe(ingestaId);
      expect(tx.banco).toBe(BancoConocido.BCI);
      expect(tx.tipoCuenta).toBe(TipoCuentaConocido.CuentaCorriente);
      expect(tx.numeroCuenta).toBe('12345678');
    }

    const ids = repo.saved.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rechaza extensiones no permitidas antes de tocar el repositorio', async () => {
    const repo = new FakeRepository();
    const useCase = buildUseCase({ repository: repo });

    const result = await useCase.execute(makeFileReader({ originalName: 'cartola.csv' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InvalidFileExtensionError);
    expect(repo.saved).toHaveLength(0);
  });

  it('propaga el error si la detección de banco falla y no persiste nada', async () => {
    const repo = new FakeRepository();
    const error = new BancoNoReconocidoError('cartola.xlsx');
    const useCase = buildUseCase({
      bankDetector: makeBankDetector(Result.fail(error)),
      repository: repo,
    });

    const result = await useCase.execute(makeFileReader());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(repo.saved).toHaveLength(0);
  });

  it('propaga el error si la normalización falla y no persiste nada', async () => {
    const repo = new FakeRepository();
    const error = new NormalizacionInvalidaError(BancoConocido.BCI, [
      { tipo: 'FilaSinMontos', fila: 10 },
    ]);
    const useCase = buildUseCase({
      normalizer: makeNormalizer(Result.fail(error)),
      repository: repo,
    });

    const result = await useCase.execute(makeFileReader());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(repo.saved).toHaveLength(0);
  });
});
