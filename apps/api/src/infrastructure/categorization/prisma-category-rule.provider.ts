import { Inject, Injectable, Logger } from '@nestjs/common';
import { ICategoryRuleProvider } from '../../application/ports/category-rule-provider.port';
import type { IPatronRepository } from '../../application/ports/patron-repository.port';
import { GrupoPresupuesto } from '../../domain/value-objects/grupo-presupuesto';
import {
  MatchTypePatron,
  Patron,
} from '../../domain/value-objects/patron';
import { ReglaCategorizacion } from '../../domain/value-objects/regla-categorizacion';
import { PATRON_REPOSITORY } from '../http/patrones.module';

const CACHE_TTL_MS = 30_000;
const VALID_GRUPOS = new Set<string>(Object.values(GrupoPresupuesto));

/**
 * Lee patrones activos de la DB y los traduce a ReglaCategorizacion.
 * El cache TTL evita pegarle a la DB en cada listado de transacciones.
 */
@Injectable()
export class PrismaCategoryRuleProvider implements ICategoryRuleProvider {
  private readonly logger = new Logger(PrismaCategoryRuleProvider.name);
  private cache: ReadonlyArray<ReglaCategorizacion> | null = null;
  private cachedAt = 0;

  constructor(
    @Inject(PATRON_REPOSITORY) private readonly repo: IPatronRepository,
  ) {}

  async getReglas(): Promise<ReadonlyArray<ReglaCategorizacion>> {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cache;
    }

    const patrones = await this.repo.findActiveOrdered();
    const reglas: ReglaCategorizacion[] = [];
    for (const p of patrones) {
      const regla = this.toRegla(p);
      if (regla) reglas.push(regla);
    }
    this.cache = reglas;
    this.cachedAt = now;
    return reglas;
  }

  private toRegla(p: Patron): ReglaCategorizacion | null {
    if (!VALID_GRUPOS.has(p.bucketName)) {
      this.logger.warn(`Patrón ${p.id} apunta a bucket desconocido: ${p.bucketName}`);
      return null;
    }
    let regex: RegExp;
    try {
      regex = compilar(p.expression, p.matchType);
    } catch (error) {
      this.logger.warn(
        `Patrón ${p.id} con expression inválida (${p.expression}): ${(error as Error).message}`,
      );
      return null;
    }
    return {
      patron: regex,
      categoria: {
        nombre: p.label?.trim() || p.bucketName,
        grupo: p.bucketName as GrupoPresupuesto,
      },
    };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilar(expression: string, matchType: MatchTypePatron): RegExp {
  switch (matchType) {
    case MatchTypePatron.Regex:
      return new RegExp(expression, 'i');
    case MatchTypePatron.StartsWith:
      return new RegExp(`^${escapeRegex(expression)}`, 'i');
    case MatchTypePatron.Contains:
    default:
      return new RegExp(escapeRegex(expression), 'i');
  }
}
