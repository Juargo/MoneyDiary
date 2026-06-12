import { Module } from '@nestjs/common';
import { PatronesController } from './patrones.controller';
import {
  CreatePatronUseCase,
  DeletePatronUseCase,
  ListPatronesUseCase,
  UpdatePatronUseCase,
} from '../../application/use-cases/manage-patrones.use-case';
import { PrismaService } from '../persistence/prisma.service';
import { PrismaPatronRepository } from '../persistence/prisma-patron.repository';

export const PATRON_REPOSITORY = Symbol.for('IPatronRepository');

@Module({
  controllers: [PatronesController],
  providers: [
    PrismaService,
    { provide: PATRON_REPOSITORY, useClass: PrismaPatronRepository },
    {
      provide: ListPatronesUseCase,
      useFactory: (repo) => new ListPatronesUseCase(repo),
      inject: [PATRON_REPOSITORY],
    },
    {
      provide: CreatePatronUseCase,
      useFactory: (repo) => new CreatePatronUseCase(repo),
      inject: [PATRON_REPOSITORY],
    },
    {
      provide: UpdatePatronUseCase,
      useFactory: (repo) => new UpdatePatronUseCase(repo),
      inject: [PATRON_REPOSITORY],
    },
    {
      provide: DeletePatronUseCase,
      useFactory: (repo) => new DeletePatronUseCase(repo),
      inject: [PATRON_REPOSITORY],
    },
  ],
  exports: [PATRON_REPOSITORY],
})
export class PatronesModule {}
