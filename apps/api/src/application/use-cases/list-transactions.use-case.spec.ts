import { ListTransactionsUseCase } from './list-transactions.use-case';
import { Result } from '../../shared/result';
import { ITransactionRepository } from '../ports/transaction-repository.port';
import { ICategoryRuleProvider } from '../ports/category-rule-provider.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';
import { ReglaCategorizacion } from '../../domain/value-objects/regla-categorizacion';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { GrupoPresupuesto } from '../../domain/value-objects/grupo-presupuesto';

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

class FakeRuleProvider implements ICategoryRuleProvider {
  constructor(private readonly reglas: ReglaCategorizacion[]) {}
  getReglas(): ReadonlyArray<ReglaCategorizacion> {
    return this.reglas;
  }
}

function makeTransaccion(
  overrides: Partial<TransaccionAlmacenada> = {},
): TransaccionAlmacenada {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    ingestaId: '22222222-2222-2222-2222-222222222222',
    fecha: new Date('2026-05-14'),
    descripcion: 'Compra',
    cargo: 8103,
    abono: 0,
    banco: BancoConocido.BCI,
    tipoCuenta: TipoCuentaConocido.CuentaCorriente,
    numeroCuenta: '12345678',
    ...overrides,
  };
}

const reglas: ReglaCategorizacion[] = [
  {
    patron: /lider|jumbo/i,
    categoria: { nombre: 'Alimentación', grupo: GrupoPresupuesto.Necesidades },
  },
  {
    patron: /netflix/i,
    categoria: { nombre: 'Ocio', grupo: GrupoPresupuesto.Gustos },
  },
];

describe('ListTransactionsUseCase', () => {
  it('retorna lista vacía cuando no hay transacciones almacenadas', async () => {
    const useCase = new ListTransactionsUseCase(
      new FakeRepository([]),
      new FakeRuleProvider(reglas),
    );

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('categoriza cada transacción con la primera regla que matchea', async () => {
    const t1 = makeTransaccion({ id: 'a', descripcion: 'Compra Lider Maipú' });
    const t2 = makeTransaccion({ id: 'b', descripcion: 'Netflix Chile' });
    const useCase = new ListTransactionsUseCase(
      new FakeRepository([t1, t2]),
      new FakeRuleProvider(reglas),
    );

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0].categoria.nombre).toBe('Alimentación');
    expect(result[0].categoria.grupo).toBe(GrupoPresupuesto.Necesidades);
    expect(result[1].categoria.nombre).toBe('Ocio');
    expect(result[1].categoria.grupo).toBe(GrupoPresupuesto.Gustos);
  });

  it('manda transacciones sin match al bucket SinCategorizar', async () => {
    const t = makeTransaccion({ descripcion: 'Comercio Desconocido SPA' });
    const useCase = new ListTransactionsUseCase(
      new FakeRepository([t]),
      new FakeRuleProvider(reglas),
    );

    const result = await useCase.execute();

    expect(result[0].categoria.grupo).toBe(GrupoPresupuesto.SinCategorizar);
    expect(result[0].categoria.nombre).toBe('Sin categorizar');
  });
});
