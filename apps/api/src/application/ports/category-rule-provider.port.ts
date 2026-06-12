import { ReglaCategorizacion } from '../../domain/value-objects/regla-categorizacion';

/**
 * ICategoryRuleProvider — port que expone las reglas de categorización vigentes.
 *
 * En el MVP, la implementación devuelve un set hardcoded.
 * En el futuro, el usuario podrá agregar reglas personales que se mezclan
 * con (o reemplazan) las reglas default — sin cambiar este contrato.
 */
export interface ICategoryRuleProvider {
  getReglas(): Promise<ReadonlyArray<ReglaCategorizacion>>;
}
