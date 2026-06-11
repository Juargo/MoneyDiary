import { ITransactionRepository } from '../ports/transaction-repository.port';
import { ICategoryRuleProvider } from '../ports/category-rule-provider.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';
import { Categoria } from '../../domain/value-objects/categoria';
import { categorizar } from '../../domain/value-objects/regla-categorizacion';

export interface TransaccionCategorizada extends TransaccionAlmacenada {
  categoria: Categoria;
}

/**
 * ListTransactionsUseCase — devuelve todas las transacciones almacenadas
 * ya categorizadas en el momento de la lectura.
 *
 * Categorizar en read-time (en vez de ingest-time) permite que cuando el
 * usuario agregue nuevas reglas personales, el histórico se re-clasifique
 * automáticamente sin tocar el storage.
 */
export class ListTransactionsUseCase {
  constructor(
    private readonly repository: ITransactionRepository,
    private readonly ruleProvider: ICategoryRuleProvider,
  ) {}

  async execute(): Promise<ReadonlyArray<TransaccionCategorizada>> {
    const transacciones = await this.repository.findAll();
    const reglas = this.ruleProvider.getReglas();
    return transacciones.map((t) => ({
      ...t,
      categoria: categorizar(t, reglas),
    }));
  }
}
