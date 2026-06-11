import { GrupoPresupuesto } from './grupo-presupuesto';

/**
 * Categoria — sub-clasificación dentro de un GrupoPresupuesto.
 *
 * Ejemplos:
 *   { nombre: 'Alimentación', grupo: Necesidades }
 *   { nombre: 'Ocio',         grupo: Gustos }
 *   { nombre: 'Ingreso',      grupo: Ahorro }
 */
export interface Categoria {
  readonly nombre: string;
  readonly grupo: GrupoPresupuesto;
}

/**
 * Categoría especial para transacciones que no matchearon ninguna regla.
 * Sigue visible en la UI para que el usuario pueda agregar reglas que
 * la atrapen en el futuro.
 */
export const CATEGORIA_SIN_CATEGORIZAR: Categoria = {
  nombre: 'Sin categorizar',
  grupo: GrupoPresupuesto.SinCategorizar,
};

/**
 * Categoría asignada automáticamente a cualquier transacción con `abono > 0`.
 * Los ingresos no se clasifican por descripción — se detectan por la dirección
 * del movimiento (entrada de dinero).
 */
export const CATEGORIA_INGRESO: Categoria = {
  nombre: 'Ingreso',
  grupo: GrupoPresupuesto.Ingresos,
};
