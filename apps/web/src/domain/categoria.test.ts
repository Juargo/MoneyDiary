import { describe, expect, it } from 'vitest'
import { CATEGORIA_BUCKET, ORDEN_CATEGORIAS, agruparCategoriasPorBucket } from './categoria'

describe('CATEGORIA_BUCKET', () => {
  it('mapea cada una de las 8 categorías a su bucket, espejo del enum backend', () => {
    expect(CATEGORIA_BUCKET).toEqual({
      Supermercado: 'Necesidades',
      Combustible: 'Necesidades',
      Farmacia: 'Necesidades',
      Salud: 'Necesidades',
      Transporte: 'Necesidades',
      Streaming: 'Deseos',
      Delivery: 'Deseos',
      Ahorro: 'Ahorro',
    })
  })

  it('ORDEN_CATEGORIAS cubre exactamente las 8 llaves de CATEGORIA_BUCKET, mismo orden', () => {
    expect(ORDEN_CATEGORIAS).toEqual(Object.keys(CATEGORIA_BUCKET))
  })
})

describe('agruparCategoriasPorBucket', () => {
  it('agrupa las 8 categorías en 3 buckets, en el orden canónico Necesidades → Deseos → Ahorro', () => {
    const grupos = agruparCategoriasPorBucket()

    expect(grupos).toEqual([
      { bucket: 'Necesidades', categorias: ['Supermercado', 'Combustible', 'Farmacia', 'Salud', 'Transporte'] },
      { bucket: 'Deseos', categorias: ['Streaming', 'Delivery'] },
      { bucket: 'Ahorro', categorias: ['Ahorro'] },
    ])
  })

  it('cada categoría aparece en exactamente un grupo (no huérfanas, no duplicados)', () => {
    const grupos = agruparCategoriasPorBucket()
    const todas = grupos.flatMap((g) => g.categorias)

    expect(todas).toHaveLength(ORDEN_CATEGORIAS.length)
    expect(new Set(todas).size).toBe(ORDEN_CATEGORIAS.length)
  })
})
