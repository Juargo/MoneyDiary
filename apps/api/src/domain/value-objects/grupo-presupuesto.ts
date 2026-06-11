/**
 * GrupoPresupuesto — los buckets de la regla 50/30/20.
 *
 * SinCategorizar es el bucket por defecto cuando ninguna regla matchea.
 * Existe explícitamente para que el usuario pueda ver qué transacciones
 * todavía no tienen regla y agregar nuevas reglas personales después.
 */
export enum GrupoPresupuesto {
  Necesidades = 'Necesidades',
  Gustos = 'Gustos',
  Ahorro = 'Ahorro',
  SinCategorizar = 'SinCategorizar',
}
