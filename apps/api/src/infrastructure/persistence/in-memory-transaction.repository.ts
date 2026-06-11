import { Injectable } from '@nestjs/common';
import { Result } from '../../shared/result';
import { ITransactionRepository } from '../../application/ports/transaction-repository.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

/**
 * InMemoryTransactionRepository — adapter de persistencia in-memory.
 *
 * Almacena transacciones en un arreglo del propio proceso.
 * Útil para el MVP y los tests; se reemplaza por una implementación basada
 * en Prisma/Supabase sin modificar el puerto ni los use cases.
 *
 * Importante: como NestJS instancia providers como singletons por defecto,
 * el estado persiste entre requests dentro de la misma vida del proceso.
 */
@Injectable()
export class InMemoryTransactionRepository implements ITransactionRepository {
  private readonly store: TransaccionAlmacenada[] = [];

  saveMany(
    transactions: ReadonlyArray<TransaccionAlmacenada>,
  ): Promise<Result<number, Error>> {
    this.store.push(...transactions);
    return Promise.resolve(Result.ok(transactions.length));
  }

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    return Promise.resolve([...this.store]);
  }
}
