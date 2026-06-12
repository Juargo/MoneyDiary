import { ITransactionRepository } from '../ports/transaction-repository.port';
import { ICategoryRuleProvider } from '../ports/category-rule-provider.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';
import {
  Categoria,
  CATEGORIA_INGRESO,
  CATEGORIA_SIN_CATEGORIZAR,
} from '../../domain/value-objects/categoria';
import {
  ReglaCategorizacion,
  categorizar,
} from '../../domain/value-objects/regla-categorizacion';
import { GrupoPresupuesto } from '../../domain/value-objects/grupo-presupuesto';

export interface TransaccionCategorizada extends TransaccionAlmacenada {
  categoria: Categoria;
}

const VALID_GRUPOS = new Set<string>(Object.values(GrupoPresupuesto));

/**
 * Resuelve la categoría visible:
 *   - Abono > 0  → Ingreso automático.
 *   - Override manual (bucketName != SinCategorizar) → grupo = bucket, nombre
 *     del rule-match si existe, si no el propio nombre del bucket.
 *   - Default → reglas por descripción.
 */
function resolverCategoria(
  t: TransaccionAlmacenada,
  reglas: ReadonlyArray<ReglaCategorizacion>,
): Categoria {
  if (t.abono > 0) return CATEGORIA_INGRESO;

  const ruleMatch = categorizar(t, reglas);
  const hayOverride =
    t.bucketName !== GrupoPresupuesto.SinCategorizar &&
    VALID_GRUPOS.has(t.bucketName);

  if (!hayOverride) return ruleMatch;

  const grupoOverride = t.bucketName as GrupoPresupuesto;
  if (ruleMatch.grupo === grupoOverride) return ruleMatch;
  if (ruleMatch !== CATEGORIA_SIN_CATEGORIZAR) {
    return { nombre: ruleMatch.nombre, grupo: grupoOverride };
  }
  return { nombre: grupoOverride, grupo: grupoOverride };
}

export class ListTransactionsUseCase {
  constructor(
    private readonly repository: ITransactionRepository,
    private readonly ruleProvider: ICategoryRuleProvider,
  ) {}

  async execute(): Promise<ReadonlyArray<TransaccionCategorizada>> {
    const transacciones = await this.repository.findAll();
    const reglas = await this.ruleProvider.getReglas();
    return transacciones.map((t) => ({
      ...t,
      categoria: resolverCategoria(t, reglas),
    }));
  }
}
