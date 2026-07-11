import { ProcessIngestaResult } from '../../../application/use-cases/process-ingesta.use-case';

/**
 * TransaccionResponseDto — forma HTTP de una transacción persistida.
 *
 * cargo/abono viajan como STRING (nunca number): el dinero se persiste en
 * columnas BigInt (US-011) y JSON no puede serializar BigInt de forma
 * nativa. Formatearlas como string en el mapper de respuesta evita tanto el
 * crash de serialización como la pérdida de precisión, sin necesidad de un
 * monkeypatch global de BigInt.prototype.toJSON (decisión de diseño).
 */
export interface TransaccionResponseDto {
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
}

/** IngestaResponseDto — contrato HTTP de POST /api/ingestas en caso de éxito. */
export interface IngestaResponseDto {
  ingestaId: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  archivo: { nombre: string; extension: string; tamanoBytes: number };
  totalTransacciones: number;
  transacciones: ReadonlyArray<TransaccionResponseDto>;
}

/**
 * Mapea el resultado del orquestador de aplicación (ProcessIngestaResult) al
 * contrato HTTP. Vive en infrastructure/http porque conoce la forma exacta
 * de la respuesta JSON; application no sabe nada de HTTP ni de DTOs.
 */
export function aIngestaResponseDto(data: ProcessIngestaResult): IngestaResponseDto {
  return {
    ingestaId: data.ingestaId,
    banco: data.banco.banco,
    tipoCuenta: data.banco.tipoCuenta,
    numeroCuenta: data.banco.numeroCuenta,
    archivo: {
      nombre: data.archivo.originalName,
      extension: data.archivo.extension,
      tamanoBytes: data.archivo.sizeInBytes,
    },
    totalTransacciones: data.total,
    transacciones: data.transacciones.map((tx) => ({
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
    })),
  };
}
