import { Transaccion } from '../../domain/value-objects/transaccion';
import { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * Forma de persistencia de una transacción (US-011).
 *
 * El dinero se almacena como dos columnas BigInt (`cargo`/`abono`) para
 * evitar pérdida de precisión. La descripción se cifra vía ICryptoService;
 * fecha/cargo/abono/bucketId permanecen en texto plano y consultables.
 * bucketId está reservado para US-012 y siempre se persiste como null aquí.
 */
export interface TransaccionPersistencia {
  fecha: Date;
  descripcion: string;
  cargo: bigint;
  abono: bigint;
  bucketId: string | null;
}

/**
 * Mapea una Transaccion de dominio a su forma de persistencia.
 * Conversión fina number→BigInt; cifra la descripción vía crypto.
 */
export function aPersistencia(
  tx: Transaccion,
  crypto: ICryptoService,
): TransaccionPersistencia {
  return {
    fecha: tx.fecha,
    descripcion: crypto.encrypt(tx.descripcion),
    cargo: BigInt(tx.cargo),
    abono: BigInt(tx.abono),
    bucketId: null,
  };
}

/**
 * Mapea una fila de persistencia de vuelta al dominio.
 * Conversión fina BigInt→number (valores < 2^53); descifra la descripción.
 */
export function aDominio(
  row: TransaccionPersistencia,
  crypto: ICryptoService,
): Transaccion {
  return {
    fecha: row.fecha,
    descripcion: crypto.decrypt(row.descripcion),
    cargo: Number(row.cargo),
    abono: Number(row.abono),
  };
}
