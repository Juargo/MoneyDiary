import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../domain/value-objects/tipo-cuenta';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

export interface SaveIngestaInput {
  readonly filename: string;
  readonly banco: BancoConocido;
  readonly tipoCuenta: TipoCuentaConocido;
  readonly numeroCuenta: string;
  readonly transacciones: ReadonlyArray<Transaccion>;
}

export interface SaveIngestaResult {
  readonly ingestaId: string;
  readonly count: number;
}

/**
 * ITransactionRepository — port de persistencia para transacciones.
 *
 * `saveIngesta` recibe todo el contexto de una ingesta (archivo + cuenta +
 * transacciones) y devuelve el id real de la ingesta generado por el storage.
 * Esto permite que el use case no genere ids transitorios y deje al adapter
 * concretar el modelo relacional (accounts ←→ ingestas ←→ transacciones).
 */
export interface ITransactionRepository {
  saveIngesta(
    input: SaveIngestaInput,
  ): Promise<Result<SaveIngestaResult, Error>>;

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>>;
}
