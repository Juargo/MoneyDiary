import { Module } from '@nestjs/common';
import { TransaccionesController } from './transacciones.controller';
import { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';
import { IngestaModule, TRANSACTION_REPOSITORY } from './ingesta.module';
import { DefaultCategoryRuleProvider } from '../categorization/default-category-rule.provider';

export const CATEGORY_RULE_PROVIDER = Symbol.for('ICategoryRuleProvider');

/**
 * TransaccionesModule — lectura de transacciones almacenadas con categorización.
 *
 * Reusa el TRANSACTION_REPOSITORY que exporta IngestaModule (mismo singleton)
 * y resuelve las reglas de categorización vía ICategoryRuleProvider.
 */
@Module({
  imports: [IngestaModule],
  controllers: [TransaccionesController],
  providers: [
    { provide: CATEGORY_RULE_PROVIDER, useClass: DefaultCategoryRuleProvider },
    {
      provide: ListTransactionsUseCase,
      useFactory: (repo, ruleProvider) =>
        new ListTransactionsUseCase(repo, ruleProvider),
      inject: [TRANSACTION_REPOSITORY, CATEGORY_RULE_PROVIDER],
    },
  ],
})
export class TransaccionesModule {}
