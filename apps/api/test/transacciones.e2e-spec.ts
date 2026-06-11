import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'path';
import { AppModule } from '../src/app.module';

describe('TransaccionesController (e2e) — GET /api/transacciones', () => {
  let app: INestApplication<App>;

  const fixturesDir = join(__dirname, 'fixtures');
  const xlsxFixture = join(fixturesDir, 'movimientos.xlsx'); // BCI

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('retorna lista vacía cuando no se ha subido nada', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/transacciones')
      .expect(200);

    expect(response.body).toEqual({ total: 0, transacciones: [] });
  });

  it('retorna las transacciones persistidas tras un POST /api/ingestas', async () => {
    const ingestaResponse = await request(app.getHttpServer())
      .post('/api/ingestas')
      .attach('file', xlsxFixture)
      .expect(201);

    const expectedTotal = ingestaResponse.body.transacciones.total as number;
    const ingestaId = ingestaResponse.body.ingestaId as string;

    const response = await request(app.getHttpServer())
      .get('/api/transacciones')
      .expect(200);

    expect(response.body.total).toBe(expectedTotal);
    expect(response.body.transacciones).toHaveLength(expectedTotal);

    const first = response.body.transacciones[0];
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.ingestaId).toBe(ingestaId);
    expect(first.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    expect(typeof first.descripcion).toBe('string');
    expect(typeof first.cargo).toBe('number');
    expect(typeof first.abono).toBe('number');
    expect(first.banco).toBe('BCI');
    expect(first.tipoCuenta).toBe('Cuenta Corriente');
    expect(first.categoria.nombre).toEqual(expect.any(String));
    expect(['Necesidades', 'Gustos', 'Ahorro', 'SinCategorizar']).toContain(
      first.categoria.grupo,
    );
  });

  it('cada transacción cae en uno de los 4 grupos (incluyendo SinCategorizar)', async () => {
    await request(app.getHttpServer())
      .post('/api/ingestas')
      .attach('file', xlsxFixture)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/transacciones')
      .expect(200);

    const grupos = new Set(
      response.body.transacciones.map(
        (t: { categoria: { grupo: string } }) => t.categoria.grupo,
      ),
    );
    for (const grupo of grupos) {
      expect(['Necesidades', 'Gustos', 'Ahorro', 'SinCategorizar']).toContain(grupo);
    }
  });
});
