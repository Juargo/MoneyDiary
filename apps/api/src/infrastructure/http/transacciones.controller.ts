import { Controller, Get } from '@nestjs/common';
import { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';

/**
 * TransaccionesController — GET /api/transacciones.
 *
 * Devuelve todas las transacciones almacenadas, ya categorizadas según
 * las reglas vigentes (ver DefaultCategoryRuleProvider).
 *
 * Las fechas se serializan como ISO 8601. Las transacciones sin match
 * de regla traen categoria.grupo = "SinCategorizar".
 */
@Controller('api/transacciones')
export class TransaccionesController {
  constructor(private readonly listTransactions: ListTransactionsUseCase) {}

  @Get()
  async listar() {
    const transacciones = await this.listTransactions.execute();

    return {
      total: transacciones.length,
      transacciones: transacciones.map((t) => ({
        id: t.id,
        ingestaId: t.ingestaId,
        fecha: t.fecha.toISOString(),
        descripcion: t.descripcion,
        cargo: t.cargo,
        abono: t.abono,
        banco: t.banco,
        tipoCuenta: t.tipoCuenta,
        numeroCuenta: t.numeroCuenta,
        categoria: {
          nombre: t.categoria.nombre,
          grupo: t.categoria.grupo,
        },
      })),
    };
  }
}
