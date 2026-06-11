import { Injectable, Logger } from '@nestjs/common';
import { IngestaStatus, TipoTransaccion } from '@prisma/client';
import { Result } from '../../shared/result';
import {
  ITransactionRepository,
  SaveIngestaInput,
  SaveIngestaResult,
} from '../../application/ports/transaction-repository.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';
import { PrismaService } from './prisma.service';

// Nombres de bucket = strings de GrupoPresupuesto (SinCategorizar, Necesidades,
// Gustos, Ahorro, Ingresos). La capa de UI mapea cada uno a su label visible.
const DEFAULT_BUCKET_NAME = 'SinCategorizar';

/**
 * PrismaTransactionRepository — persistencia real contra Postgres (Supabase).
 *
 * Resuelve el mapeo entre el modelo de dominio (Transaccion + contexto de
 * ingesta) y el modelo relacional:
 *   - upsert del Account por (bank, accountType, accountNumber)
 *   - creación de Ingesta con status='processed'
 *   - resolución/creación del bucket por defecto (transacciones.bucket_id NOT NULL)
 *   - inserción bulk de Transaccion con skipDuplicates para respetar
 *     UNIQUE(date, description, amount, account_id)
 */
@Injectable()
export class PrismaTransactionRepository implements ITransactionRepository {
  private readonly logger = new Logger(PrismaTransactionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveIngesta(
    input: SaveIngestaInput,
  ): Promise<Result<SaveIngestaResult, Error>> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const account = await this.upsertAccount(tx, input);
        const bucket = await this.upsertDefaultBucket(tx);

        const ingesta = await tx.ingesta.create({
          data: {
            accountId: account.id,
            status: IngestaStatus.processed,
            filename: input.filename,
            processedAt: new Date(),
          },
        });

        const rows = input.transacciones.map((t) => ({
          ingestaId: ingesta.id,
          accountId: account.id,
          bucketId: bucket.id,
          date: t.fecha,
          description: t.descripcion,
          amount: t.cargo > 0 ? t.cargo : t.abono,
          type: t.cargo > 0 ? TipoTransaccion.cargo : TipoTransaccion.abono,
        }));

        if (rows.length > 0) {
          await tx.transaccion.createMany({
            data: rows,
            skipDuplicates: true,
          });
        }

        return ingesta.id;
      });

      return Result.ok({
        ingestaId: result.toString(),
        count: input.transacciones.length,
      });
    } catch (error) {
      this.logger.error('Error persistiendo ingesta', error as Error);
      return Result.fail(error as Error);
    }
  }

  async findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    const rows = await this.prisma.transaccion.findMany({
      include: { account: true, bucket: true },
      orderBy: { date: 'desc' },
    });

    return rows.map((r) => {
      const amount = Number(r.amount);
      const isCargo = r.type === TipoTransaccion.cargo;
      return {
        id: r.id.toString(),
        ingestaId: r.ingestaId !== null ? r.ingestaId.toString() : '',
        fecha: r.date,
        descripcion: r.description,
        cargo: isCargo ? amount : 0,
        abono: isCargo ? 0 : amount,
        banco: (r.account?.bank ?? '') as BancoConocido,
        tipoCuenta: (r.account?.accountType ?? '') as TipoCuentaConocido,
        numeroCuenta: r.account?.accountNumber ?? '',
        bucketName: r.bucket.name,
      };
    });
  }

  async updateBucket(
    transactionId: string,
    bucketName: string,
  ): Promise<Result<void, Error>> {
    try {
      const id = BigInt(transactionId);
      await this.prisma.$transaction(async (tx) => {
        const bucket = await tx.bucketPresupuesto.upsert({
          where: { name: bucketName },
          create: { name: bucketName },
          update: {},
        });
        await tx.transaccion.update({
          where: { id },
          data: { bucketId: bucket.id },
        });
      });
      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Error actualizando bucket', error as Error);
      return Result.fail(error as Error);
    }
  }

  private async upsertAccount(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    input: SaveIngestaInput,
  ) {
    const existing = await tx.account.findFirst({
      where: {
        bank: input.banco,
        accountType: input.tipoCuenta,
        accountNumber: input.numeroCuenta,
      },
    });
    if (existing) return existing;

    return tx.account.create({
      data: {
        bank: input.banco,
        accountType: input.tipoCuenta,
        accountNumber: input.numeroCuenta,
      },
    });
  }

  private async upsertDefaultBucket(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ) {
    return tx.bucketPresupuesto.upsert({
      where: { name: DEFAULT_BUCKET_NAME },
      create: { name: DEFAULT_BUCKET_NAME },
      update: {},
    });
  }
}
