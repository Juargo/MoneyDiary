import { Result } from '../../shared/result';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

/**
 * ITransactionRepository — port de persistencia para transacciones.
 *
 * La implementación concreta vive en infrastructure/persistence/.
 * En el MVP usamos InMemoryTransactionRepository; luego se reemplaza
 * por una implementación basada en Prisma + Supabase sin tocar este contrato.
 */
export interface ITransactionRepository {
  saveMany(
    transactions: ReadonlyArray<TransaccionAlmacenada>,
  ): Promise<Result<number, Error>>;

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>>;
}
