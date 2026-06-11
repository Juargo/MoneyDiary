import { Result } from '../../shared/result';
import { ITransactionRepository } from '../ports/transaction-repository.port';
import { GrupoPresupuesto } from '../../domain/value-objects/grupo-presupuesto';

const GRUPOS_EDITABLES = new Set<GrupoPresupuesto>([
  GrupoPresupuesto.Necesidades,
  GrupoPresupuesto.Gustos,
  GrupoPresupuesto.Ahorro,
  GrupoPresupuesto.SinCategorizar,
]);

export class InvalidGrupoError extends Error {
  constructor(grupo: string) {
    super(`Grupo no editable: ${grupo}`);
    this.name = 'InvalidGrupoError';
  }
}

/**
 * UpdateTransactionBucketUseCase — aplica un override manual de bucket sobre
 * una transacción ya persistida.
 *
 * No permite forzar el bucket "Ingresos" (los ingresos se detectan por
 * `abono > 0` y no se pueden mover a un bucket de gasto desde la UI).
 */
export class UpdateTransactionBucketUseCase {
  constructor(private readonly repository: ITransactionRepository) {}

  async execute(
    transactionId: string,
    grupo: GrupoPresupuesto,
  ): Promise<Result<void, Error>> {
    if (!GRUPOS_EDITABLES.has(grupo)) {
      return Result.fail(new InvalidGrupoError(grupo));
    }
    return this.repository.updateBucket(transactionId, grupo);
  }
}
