import { Module } from '@nestjs/common';
import { TransaccionesController } from './transacciones.controller';
import { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';
import { IngestaModule, TRANSACTION_REPOSITORY } from './ingesta.module';

/**
 * TransaccionesModule — lectura de transacciones almacenadas.
 *
 * Reusa el TRANSACTION_REPOSITORY que exporta IngestaModule (singleton del
 * proceso) para que las transacciones persistidas en POST /api/ingestas
 * sean visibles aquí.
 */
@Module({
  imports: [IngestaModule],
  controllers: [TransaccionesController],
  providers: [
    {
      provide: ListTransactionsUseCase,
      useFactory: (repo) => new ListTransactionsUseCase(repo),
      inject: [TRANSACTION_REPOSITORY],
    },
  ],
})
export class TransaccionesModule {}
