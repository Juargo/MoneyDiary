import { ITransaccionParaClasificarReader, TransaccionParaClasificar } from '../../application/ports/transaccion-para-clasificar.port';
import { PrismaService } from './prisma.service';

/**
 * PrismaTransaccionClasificacionRepository — implementación del port de lectura
 * para la categorización post-persistencia (US-012).
 *
 * Lee id + descripcion + cargo + abono de las transacciones de una Ingesta.
 * Mapea BigInt→number (los campos de monto son BigInt en Prisma/PostgreSQL pero
 * se tratan como enteros de dominio en la capa de aplicación).
 *
 * Nunca lanza: errores se propagan como excepción al orquestador que los maneja
 * dentro de su try/catch island de categorización.
 */
export class PrismaTransaccionClasificacionRepository implements ITransaccionParaClasificarReader {
  constructor(private readonly prisma: PrismaService) {}

  async findParaClasificar(
    ingestaId: string,
  ): Promise<ReadonlyArray<TransaccionParaClasificar>> {
    const rows = await this.prisma.transaccion.findMany({
      where: { ingestaId },
      select: { id: true, descripcion: true, cargo: true, abono: true },
      orderBy: { creadoEn: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      descripcion: row.descripcion,
      cargo: Number(row.cargo),
      abono: Number(row.abono),
    }));
  }
}
