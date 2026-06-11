import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { TRANSACTION_REPOSITORY } from '../src/infrastructure/http/ingesta.module';
import { ITransactionRepository } from '../src/application/ports/transaction-repository.port';
import { InMemoryTransactionRepository } from '../src/infrastructure/persistence/in-memory-transaction.repository';

describe('IngestaController (e2e) — POST /api/ingestas', () => {
  let app: INestApplication<App>;
  let repository: ITransactionRepository;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos.xlsx'); // BCI
  const xlsFixture = join(fixturesDir, 'cartola.xls');

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TRANSACTION_REPOSITORY)
      .useClass(InMemoryTransactionRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    repository = moduleFixture.get<ITransactionRepository>(TRANSACTION_REPOSITORY);
  });

  afterEach(async () => {
    await app.close();
  });

  it('procesa un archivo .xlsx, persiste las transacciones y retorna 201 con el resumen', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
      .attach('file', xlsxFixture)
      .expect(201);

    expect(response.body.message).toBe('Archivo procesado correctamente.');
    expect(response.body.ingestaId).toMatch(/^[0-9a-f-]{36}$/);

    expect(response.body.archivo).toEqual({
      nombre: 'movimientos.xlsx',
      extension: '.xlsx',
      tamanoBytes: expect.any(Number),
    });

    expect(response.body.banco.banco).toBe('BCI');
    expect(response.body.banco.tipoCuenta).toBeDefined();

    const { total, cargos, abonos, totalCargos, totalAbonos } = response.body.transacciones;
    expect(total).toBeGreaterThan(0);
    expect(cargos + abonos).toBeGreaterThan(0);
    expect(totalCargos).toBeGreaterThanOrEqual(0);
    expect(totalAbonos).toBeGreaterThanOrEqual(0);

    const stored = await repository.findAll();
    expect(stored).toHaveLength(total);
    expect(stored[0].ingestaId).toBe(response.body.ingestaId);
    expect(stored[0].banco).toBe('BCI');
  });

  it('rechaza un archivo .xls con 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
      .attach('file', xlsFixture)
      .expect(400);

    expect(response.body.message).toMatch(/\.xls/i);
  });

  it('retorna 400 cuando no se envía archivo', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ingestas')
      .expect(400);

    expect(response.body.message).toMatch(/archivo/i);
  });
});
