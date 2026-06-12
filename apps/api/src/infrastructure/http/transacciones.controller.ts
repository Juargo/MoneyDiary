import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';
import {
  InvalidGrupoError,
  UpdateTransactionBucketUseCase,
} from '../../application/use-cases/update-transaction-bucket.use-case';
import { GrupoPresupuesto } from '../../domain/value-objects/grupo-presupuesto';

interface UpdateBucketBody {
  grupo?: string;
}

@Controller('api/transacciones')
export class TransaccionesController {
  constructor(
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly updateBucket: UpdateTransactionBucketUseCase,
  ) {}

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
          icon: t.categoria.icon ?? null,
        },
      })),
    };
  }

  @Patch(':id')
  @HttpCode(200)
  async actualizarBucket(
    @Param('id') id: string,
    @Body() body: UpdateBucketBody,
  ) {
    const grupo = body.grupo;
    if (!grupo || !Object.values(GrupoPresupuesto).includes(grupo as GrupoPresupuesto)) {
      throw new BadRequestException('Campo "grupo" inválido o ausente.');
    }

    const result = await this.updateBucket.execute(id, grupo as GrupoPresupuesto);
    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof InvalidGrupoError) {
        throw new BadRequestException(error.message);
      }
      throw new NotFoundException(error.message);
    }

    return { message: 'Categoría actualizada.', id, grupo };
  }
}
