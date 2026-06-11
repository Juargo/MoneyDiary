import { Module } from '@nestjs/common';
import { TransaccionesController } from './transacciones.controller';
import { ListTransactionsUseCase } from '../../application/use-cases/list-transactions.use-case';
import { UpdateTransactionBucketUseCase } from '../../application/use-cases/update-transaction-bucket.use-case';
import { IngestaModule, TRANSACTION_REPOSITORY } from './ingesta.module';
import { DefaultCategoryRuleProvider } from '../categorization/default-category-rule.provider';

export const CATEGORY_RULE_PROVIDER = Symbol.for('ICategoryRuleProvider');

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
    {
      provide: UpdateTransactionBucketUseCase,
      useFactory: (repo) => new UpdateTransactionBucketUseCase(repo),
      inject: [TRANSACTION_REPOSITORY],
    },
  ],
})
export class TransaccionesModule {}
