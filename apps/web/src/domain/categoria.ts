/**
 * Espejo web (ADR-008: web NO importa de `apps/api/src/domain`) del enum
 * `Categoria` + `CATEGORIA_BUCKET` del backend
 * (`apps/api/src/domain/value-objects/categoria.ts`). Duplicado deliberado,
 * no una re-exportación — mismo orden fijo, mismo invariante "una categoría
 * pertenece a exactamente un bucket" (US-013 CAT-01), expresado como dato
 * puro para que el reclassify `<select>` (S6b, WCAT-04) y la agrupación de
 * lectura (S6a, WCAT-02) compartan una única fuente (DRY).
 */
export const ORDEN_CATEGORIAS: ReadonlyArray<string> = [
  'Supermercado',
  'Combustible',
  'Farmacia',
  'Salud',
  'Transporte',
  'Streaming',
  'Delivery',
  'Ahorro',
]

/**
 * CATEGORIA_BUCKET — mapeo total categoría→bucket (espejo del backend). El
 * control de reclasificación (S6b) lo usa para DERIVAR el bucket destino de
 * la categoría elegida (nunca acepta un bucket independiente) y para decidir
 * si un cambio cruza de bucket (dispara confirmación) o no.
 */
export const CATEGORIA_BUCKET: Record<string, string> = {
  Supermercado: 'Necesidades',
  Combustible: 'Necesidades',
  Farmacia: 'Necesidades',
  Salud: 'Necesidades',
  Transporte: 'Necesidades',
  Streaming: 'Deseos',
  Delivery: 'Deseos',
  Ahorro: 'Ahorro',
}

export interface GrupoCategoriasBucket {
  readonly bucket: string
  readonly categorias: ReadonlyArray<string>
}

/**
 * agruparCategoriasPorBucket — las 8 categorías agrupadas por su bucket, en
 * el orden canónico (`ORDEN_CATEGORIAS` ya viene ordenado por bucket:
 * Necesidades → Deseos → Ahorro), para alimentar los `<optgroup>` del
 * reclassify `<select>` (design.md §7.3, T6.0 decision: TODAS las
 * categorías, agrupadas por bucket, cross-bucket permitido).
 */
export function agruparCategoriasPorBucket(): ReadonlyArray<GrupoCategoriasBucket> {
  const grupos: GrupoCategoriasBucket[] = []

  for (const nombre of ORDEN_CATEGORIAS) {
    const bucket = CATEGORIA_BUCKET[nombre]
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.bucket === bucket) {
      ;(ultimo.categorias as string[]).push(nombre)
      continue
    }
    grupos.push({ bucket, categorias: [nombre] })
  }

  return grupos
}
