import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Result } from '../../shared/result';
import {
  ITransactionRepository,
  SaveIngestaInput,
  SaveIngestaResult,
} from '../../application/ports/transaction-repository.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

/**
 * InMemoryTransactionRepository — adapter de persistencia in-memory.
 *
 * Usado en tests unitarios y e2e que no requieren una DB real.
 * En producción se reemplaza por PrismaTransactionRepository sin tocar el port.
 */
@Injectable()
export class InMemoryTransactionRepository implements ITransactionRepository {
  private readonly store: TransaccionAlmacenada[] = [];

  saveIngesta(
    input: SaveIngestaInput,
  ): Promise<Result<SaveIngestaResult, Error>> {
    const ingestaId = randomUUID();
    const almacenadas: TransaccionAlmacenada[] = input.transacciones.map(
      (t) => ({
        ...t,
        id: randomUUID(),
        ingestaId,
        banco: input.banco,
        tipoCuenta: input.tipoCuenta,
        numeroCuenta: input.numeroCuenta,
      }),
    );
    this.store.push(...almacenadas);
    return Promise.resolve(
      Result.ok({ ingestaId, count: almacenadas.length }),
    );
  }

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    return Promise.resolve([...this.store]);
  }
}
