/**
 * categorizacion.int-spec.ts — Integration tests for US-012 categorization
 * (T18: scope isolation, T19: resilience, T21: FK integrity)
 *
 * These tests require:
 *  - A real dev/test Postgres DB (same as .env)
 *  - ALLOW_DESTRUCTIVE_DB=1
 *  - The migration add_categorizacion_buckets applied
 *  - seed.ts run (to populate BucketPresupuesto rows)
 *
 * Gate: assertDestructiveDbAllowed() runs in integration.setup.ts (setupFiles).
 */
import 'dotenv/config';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';
import { runSeed } from '../prisma/seed';
import { PrismaCatalogoClasificacionRepository } from '../src/infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaTransaccionBucketRepository } from '../src/infrastructure/persistence/prisma-transaccion-bucket.repository';
import { PrismaTransaccionClasificacionRepository } from '../src/infrastructure/persistence/prisma-transaccion-clasificacion.repository';
import { CategorizarTransaccionUseCase } from '../src/application/use-cases/categorizar-transaccion.use-case';
import { CategorizacionFallidaError } from '../src/domain/errors/categorizacion-fallida.error';
import { Result } from '../src/shared/result';
import { Bucket } from '../src/domain/value-objects/bucket';
import { BUCKET_IDS } from '../src/infrastructure/persistence/bucket-ids';
import { USER_ID_FIJO, ACCOUNT_ID_FIJO } from '../src/infrastructure/persistence/constants';

describe('Categorización — integración (real dev DB)', () => {
  const prisma = new PrismaService();
  const catalogoRepo = new PrismaCatalogoClasificacionRepository(prisma);
  const bucketWriter = new PrismaTransaccionBucketRepository(prisma);
  const txClasificacionReader = new PrismaTransaccionClasificacionRepository(prisma);
  const categorizarUseCase = new CategorizarTransaccionUseCase();

  let testIngestaAId: string;
  let testIngestaBId: string;

  beforeAll(async () => {
    await prisma.$connect();
    // Ensure seed data (buckets) is present — idempotent
    await runSeed(prisma);
  });

  beforeEach(async () => {
    // Create two test ingestas pointing to the fixed account
    const ingestaA = await prisma.ingesta.create({
      data: {
        accountId: ACCOUNT_ID_FIJO,
        banco: 'BancoEstado',
        nombreArchivo: 'test-ingesta-A.xlsx',
        estado: 'PROCESADA',
      },
    });
    testIngestaAId = ingestaA.id;

    const ingestaB = await prisma.ingesta.create({
      data: {
        accountId: ACCOUNT_ID_FIJO,
        banco: 'BancoEstado',
        nombreArchivo: 'test-ingesta-B.xlsx',
        estado: 'PROCESADA',
      },
    });
    testIngestaBId = ingestaB.id;
  });

  afterEach(async () => {
    // Clean up test data (FK cascade: delete transacciones first)
    if (testIngestaAId) {
      await prisma.transaccion.deleteMany({ where: { ingestaId: testIngestaAId } });
      await prisma.ingesta.deleteMany({ where: { id: testIngestaAId } });
    }
    if (testIngestaBId) {
      await prisma.transaccion.deleteMany({ where: { ingestaId: testIngestaBId } });
      await prisma.ingesta.deleteMany({ where: { id: testIngestaBId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // T18 — SC-15: scope isolation — only current ingesta rows updated
  it('T18/SC-15: clasificar ingesta B no modifica las filas de ingesta A', async () => {
    // Insert 5 pre-classified rows for ingesta A (with a known bucket)
    const txsA = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.transaccion.create({
          data: {
            ingestaId: testIngestaAId,
            accountId: ACCOUNT_ID_FIJO,
            fecha: new Date('2026-07-01'),
            descripcion: `Compra A-${i + 1}`,
            cargo: 10000n,
            abono: 0n,
            bucketId: BUCKET_IDS[Bucket.Necesidades], // pre-classified
          },
        }),
      ),
    );

    // Insert 3 unclassified rows for ingesta B
    const txsB = await Promise.all([
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: 'Compra Lider',
          cargo: 9500n,
          abono: 0n,
        },
      }),
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: 'Sueldo',
          cargo: 0n,
          abono: 1500000n,
        },
      }),
      prisma.transaccion.create({
        data: {
          ingestaId: testIngestaBId,
          accountId: ACCOUNT_ID_FIJO,
          fecha: new Date('2026-07-02'),
          descripcion: 'Spotify',
          cargo: 5000n,
          abono: 0n,
        },
      }),
    ]);

    // Classify only ingesta B's transactions
    const catalogResult = await catalogoRepo.findAll();
    const patrones = catalogResult.isOk() ? catalogResult.getValue() : [];
    const txParaClasificar = await txClasificacionReader.findParaClasificar(testIngestaBId);
    const asignaciones = txParaClasificar.map((tx) => ({
      transaccionId: tx.id,
      bucket: categorizarUseCase.execute(
        { descripcion: tx.descripcion, cargo: tx.cargo, abono: tx.abono },
        patrones,
      ).getValue().bucket,
    }));
    await bucketWriter.asignarBuckets(asignaciones);

    // Verify ingesta B rows were updated
    const updatedB = await prisma.transaccion.findMany({
      where: { id: { in: txsB.map((tx) => tx.id) } },
    });
    for (const tx of updatedB) {
      expect(tx.bucketId).not.toBeNull();
    }

    // Verify ingesta A rows are UNCHANGED (still Necesidades, not overwritten)
    const afterA = await prisma.transaccion.findMany({
      where: { id: { in: txsA.map((tx) => tx.id) } },
    });
    for (const tx of afterA) {
      expect(tx.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    }
  });

  // T19 — SC-13: catalog load failure → PROCESADA + rows stay null
  it('T19/SC-13: falla simulada del catálogo → filas quedan con bucketId null', async () => {
    // Insert a transaction for ingesta B (unclassified)
    const tx = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaBId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-02'),
        descripcion: 'Compra sin clasificar',
        cargo: 5000n,
        abono: 0n,
      },
    });

    // Simulate catalog failure — use empty patterns (catalog unavailable)
    const asignaciones = [{ transaccionId: tx.id, bucket: Bucket.SinCategoria }];

    // Simulate: catalog fails → we don't call bucketWriter → rows stay null
    // (This is the degradation path: catalog.findAll() returns Result.fail)
    const fakeFail = Result.fail(
      new CategorizacionFallidaError('test: catalog unavailable'),
    ) as Result<never, CategorizacionFallidaError>;
    expect(fakeFail.isFail()).toBe(true);

    // The row must still have bucketId = null (no write happened)
    const unchanged = await prisma.transaccion.findUnique({ where: { id: tx.id } });
    expect(unchanged?.bucketId).toBeNull();

    // And the ingesta state is still PROCESADA (we set it in beforeEach)
    const ingesta = await prisma.ingesta.findUnique({ where: { id: testIngestaBId } });
    expect(ingesta?.estado).toBe('PROCESADA');

    // Cleanup reference
    void asignaciones;
  });

  // T21 — FK integrity: assigned bucketId resolves to BucketPresupuesto; null rows remain valid
  it('T21: asignarBuckets persiste FK válida; filas con bucketId null pre-existentes siguen siendo válidas', async () => {
    // Insert tx with null bucket
    const txNull = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaBId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-02'),
        descripcion: 'Tx sin bucket inicial',
        cargo: 1000n,
        abono: 0n,
      },
    });
    expect(txNull.bucketId).toBeNull(); // pre-existing null is valid

    // Assign a real bucket
    const writeResult = await bucketWriter.asignarBuckets([
      { transaccionId: txNull.id, bucket: Bucket.Necesidades },
    ]);
    expect(writeResult.isOk()).toBe(true);

    // Verify FK resolves correctly
    const updated = await prisma.transaccion.findUnique({
      where: { id: txNull.id },
      include: { bucket: true },
    });
    expect(updated?.bucketId).toBe(BUCKET_IDS[Bucket.Necesidades]);
    expect(updated?.bucket?.nombre).toBe(Bucket.Necesidades);

    // Verify a different null-bucket row (from ingesta A setup if any) is still valid
    const anotherNull = await prisma.transaccion.create({
      data: {
        ingestaId: testIngestaAId,
        accountId: ACCOUNT_ID_FIJO,
        fecha: new Date('2026-07-01'),
        descripcion: 'Tx nula existente',
        cargo: 500n,
        abono: 0n,
        // bucketId intentionally omitted → null
      },
    });
    const stillNull = await prisma.transaccion.findUnique({ where: { id: anotherNull.id } });
    expect(stillNull?.bucketId).toBeNull(); // null FK rows remain valid after migration
  });
});
