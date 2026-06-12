import { Injectable, Logger } from '@nestjs/common';
import { MatchType, Prisma } from '@prisma/client';
import { IPatronRepository } from '../../application/ports/patron-repository.port';
import {
  MatchTypePatron,
  Patron,
  PatronInput,
} from '../../domain/value-objects/patron';
import { PrismaService } from './prisma.service';

type Row = Prisma.PatronClasificacionGetPayload<{
  include: { bucket: true };
}>;

@Injectable()
export class PrismaPatronRepository implements IPatronRepository {
  private readonly logger = new Logger(PrismaPatronRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ReadonlyArray<Patron>> {
    const rows = await this.prisma.patronClasificacion.findMany({
      include: { bucket: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async findActiveOrdered(): Promise<ReadonlyArray<Patron>> {
    const rows = await this.prisma.patronClasificacion.findMany({
      where: { active: true },
      include: { bucket: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Patron | null> {
    try {
      const row = await this.prisma.patronClasificacion.findUnique({
        where: { id: BigInt(id) },
        include: { bucket: true },
      });
      return row ? toDomain(row) : null;
    } catch {
      return null;
    }
  }

  async create(input: PatronInput): Promise<Patron> {
    const bucket = await this.prisma.bucketPresupuesto.upsert({
      where: { name: input.bucketName },
      create: { name: input.bucketName },
      update: {},
    });
    const row = await this.prisma.patronClasificacion.create({
      data: {
        bucketId: bucket.id,
        label: input.label ?? null,
        icon: input.icon ?? null,
        expression: input.expression,
        matchType: input.matchType as MatchType,
        priority: input.priority,
        active: input.active ?? true,
      },
      include: { bucket: true },
    });
    return toDomain(row);
  }

  async update(id: string, input: Partial<PatronInput>): Promise<Patron | null> {
    try {
      let bucketId: bigint | undefined;
      if (input.bucketName !== undefined) {
        const bucket = await this.prisma.bucketPresupuesto.upsert({
          where: { name: input.bucketName },
          create: { name: input.bucketName },
          update: {},
        });
        bucketId = bucket.id;
      }
      const row = await this.prisma.patronClasificacion.update({
        where: { id: BigInt(id) },
        data: {
          ...(bucketId !== undefined ? { bucketId } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.expression !== undefined ? { expression: input.expression } : {}),
          ...(input.matchType !== undefined ? { matchType: input.matchType as MatchType } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updatedAt: new Date(),
        },
        include: { bucket: true },
      });
      return toDomain(row);
    } catch (error) {
      this.logger.warn(`update patron ${id} falló: ${(error as Error).message}`);
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.patronClasificacion.delete({ where: { id: BigInt(id) } });
      return true;
    } catch {
      return false;
    }
  }
}

function toDomain(row: Row): Patron {
  return {
    id: row.id.toString(),
    bucketName: row.bucket?.name ?? '',
    label: row.label,
    icon: row.icon,
    expression: row.expression,
    matchType: row.matchType as MatchTypePatron,
    priority: row.priority,
    active: row.active ?? true,
  };
}
