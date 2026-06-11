import { BancoConocido } from './nombre-banco';
import { TipoCuentaConocido } from './tipo-cuenta';
import { Transaccion } from './transaccion';

/**
 * TransaccionAlmacenada — Transaccion enriquecida con metadata de persistencia.
 *
 * Se construye al persistir el resultado de NormalizeTransactions:
 *   - id          → identificador único de la fila almacenada
 *   - ingestaId   → agrupa todas las transacciones de un mismo archivo
 *   - banco, tipoCuenta, numeroCuenta → contexto de origen
 */
export interface TransaccionAlmacenada extends Transaccion {
  readonly id: string;
  readonly ingestaId: string;
  readonly banco: BancoConocido;
  readonly tipoCuenta: TipoCuentaConocido;
  readonly numeroCuenta: string;
}
