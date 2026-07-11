import {
  Controller,
  Get,
  Query,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { ObtenerMovimientosMesUseCase } from '../../application/use-cases/obtener-movimientos-mes.use-case';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { aMovimientosMesDto } from './dto/movimiento-mes.dto';
import { USER_ID_FIJO } from '../persistence/constants';

/**
 * MovimientosController — endpoint de consulta de movimientos mensuales.
 *
 * GET /api/movimientos?periodo=YYYY-MM
 *
 * Responsabilidades:
 *   1. Extraer el query param opcional `periodo`.
 *   2. Delegar en ObtenerMovimientosMesUseCase (mismo userId fijo que el pipeline de ingesta).
 *   3. Traducir el Result<T,E> a respuesta HTTP.
 *
 * Cuando `periodo` está ausente → use case usa PeriodoMes.actual() → 200.
 * Cuando `periodo` es inválido → PeriodoInvalidoError → 400.
 * Lista vacía → 200 con envelope vacío (no es un error — REQ-06).
 */
@Controller('api/movimientos')
export class MovimientosController {
  constructor(
    private readonly obtenerMovimientosMesUseCase: ObtenerMovimientosMesUseCase,
    @Inject('USER_ID_FIJO') private readonly userId: string,
  ) {}

  @Get()
  async listar(@Query('periodo') periodo?: string) {
    let result: Awaited<ReturnType<ObtenerMovimientosMesUseCase['execute']>>;

    try {
      result = await this.obtenerMovimientosMesUseCase.execute({
        userId: this.userId,
        periodo,
      });
    } catch (err) {
      // Unexpected adapter/DB error — not a PeriodoInvalidoError
      throw new InternalServerErrorException(
        'Error inesperado al consultar movimientos. Intenta nuevamente.',
      );
    }

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof PeriodoInvalidoError) {
        throw new BadRequestException(error.message);
      }
      // Exhaustiveness guard — future error types will fail to compile here
      const _exhaustive: never = error;
      throw new InternalServerErrorException(`Error no manejado: ${String(_exhaustive)}`);
    }

    return aMovimientosMesDto(result.getValue());
  }
}
