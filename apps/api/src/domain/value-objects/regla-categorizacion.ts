import { Categoria, CATEGORIA_SIN_CATEGORIZAR } from './categoria';
import { Transaccion } from './transaccion';

/**
 * ReglaCategorizacion — asocia un patrón regex a una categoría.
 *
 * Las reglas se evalúan en orden contra `transaccion.descripcion`.
 * La primera que matchea decide la categoría (orden = prioridad).
 */
export interface ReglaCategorizacion {
  readonly patron: RegExp;
  readonly categoria: Categoria;
}

/**
 * categorizar — función pura: dada una transacción y un set de reglas,
 * devuelve la primera categoría que matchea o CATEGORIA_SIN_CATEGORIZAR
 * si ninguna lo hace.
 */
export function categorizar(
  transaccion: Pick<Transaccion, 'descripcion'>,
  reglas: ReadonlyArray<ReglaCategorizacion>,
): Categoria {
  for (const regla of reglas) {
    if (regla.patron.test(transaccion.descripcion)) {
      return regla.categoria;
    }
  }
  return CATEGORIA_SIN_CATEGORIZAR;
}
