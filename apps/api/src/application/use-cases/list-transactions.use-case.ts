import { ITransactionRepository } from '../ports/transaction-repository.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

/**
 * ListTransactionsUseCase — devuelve todas las transacciones almacenadas.
 *
 * Por ahora retorna la colección completa porque el volumen del MVP es bajo
 * (decenas de transacciones por mes, in-memory). Cuando se migre a Supabase
 * y el dataset crezca, añadiremos filtros (mes, banco) y paginación al puerto.
 */
export class ListTransactionsUseCase {
  constructor(private readonly repository: ITransactionRepository) {}

  execute(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    return Promise.resolve(this.repository.findAll());
  }
}
