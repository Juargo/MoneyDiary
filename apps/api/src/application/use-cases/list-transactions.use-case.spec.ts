import { ListTransactionsUseCase } from './list-transactions.use-case';
import { Result } from '../../shared/result';
import { ITransactionRepository } from '../ports/transaction-repository.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';

class FakeRepository implements ITransactionRepository {
  constructor(private readonly data: TransaccionAlmacenada[]) {}

  saveMany(
    transactions: ReadonlyArray<TransaccionAlmacenada>,
  ): Promise<Result<number, Error>> {
    this.data.push(...transactions);
    return Promise.resolve(Result.ok(transactions.length));
  }

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    return Promise.resolve([...this.data]);
  }
}

function makeTransaccion(overrides: Partial<TransaccionAlmacenada> = {}): TransaccionAlmacenada {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    ingestaId: '22222222-2222-2222-2222-222222222222',
    fecha: new Date('2026-05-14'),
    descripcion: 'Compra A',
    cargo: 8103,
    abono: 0,
    banco: BancoConocido.BCI,
    tipoCuenta: TipoCuentaConocido.CuentaCorriente,
    numeroCuenta: '12345678',
    ...overrides,
  };
}

describe('ListTransactionsUseCase', () => {
  it('retorna lista vacía cuando no hay transacciones almacenadas', async () => {
    const useCase = new ListTransactionsUseCase(new FakeRepository([]));

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('delega en el repositorio y retorna las transacciones almacenadas', async () => {
    const t1 = makeTransaccion({ id: 'a', descripcion: 'Compra 1' });
    const t2 = makeTransaccion({ id: 'b', descripcion: 'Compra 2', abono: 5000, cargo: 0 });
    const useCase = new ListTransactionsUseCase(new FakeRepository([t1, t2]));

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });
});
