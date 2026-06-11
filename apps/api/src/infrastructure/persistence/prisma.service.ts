import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PrismaService — wrapper NestJS sobre PrismaClient.
 *
 * Prisma 7 exige un driver adapter. Usamos `@prisma/adapter-pg` apuntado a
 * Supabase vía `DIRECT_URL` (sin pooler) o `DATABASE_URL` (con pooler) según
 * lo que esté disponible en el entorno.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString =
      process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'Falta DATABASE_URL/DIRECT_URL en el entorno para PrismaService.',
      );
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a Postgres vía Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
