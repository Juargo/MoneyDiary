import { describe, expect, it } from 'vitest'
import { calcularDistribucionGasto } from './distribucion-gasto'

// DOM port of apps/mobile/src/domain/distribucion-gasto.spec.ts — pure BigInt
// math, no platform dependency, so the port is verbatim.
function bucket(bucket: string, total: string) {
  return { bucket, total }
}

describe('calcularDistribucionGasto', () => {
  it('calcula la participación de cada bucket sobre el gasto total (share-of-gasto, no share-of-ingreso)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '400000'),
      bucket('Deseos', '250000'),
      bucket('Ahorro', '350000'),
    ])
    expect(tajadas.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 40],
      ['Deseos', 25],
      ['Ahorro', 35],
    ])
  })

  it('reproduce la distribución del mockup (77 / 12 / 11)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '770000'),
      bucket('Deseos', '120000'),
      bucket('Ahorro', '110000'),
    ])
    expect(tajadas.map((t) => t.porcentaje)).toEqual([77, 12, 11])
  })

  it('los porcentajes enteros SIEMPRE suman 100 (largest remainder)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '1'),
      bucket('Deseos', '1'),
      bucket('Ahorro', '1'),
    ])
    expect(tajadas.map((t) => t.porcentaje)).toEqual([34, 33, 33])
    expect(tajadas.reduce((s, t) => s + t.porcentaje, 0)).toBe(100)
  })

  it('excluye SinCategoria del pie y del denominador', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '500000'),
      bucket('Deseos', '300000'),
      bucket('Ahorro', '200000'),
      bucket('SinCategoria', '999999'),
    ])
    expect(tajadas.map((t) => t.bucket)).toEqual(['Necesidades', 'Deseos', 'Ahorro'])
    expect(tajadas.map((t) => t.porcentaje)).toEqual([50, 30, 20])
  })

  it('devuelve [] cuando no hay gasto (evita división por cero)', () => {
    expect(
      calcularDistribucionGasto([
        bucket('Necesidades', '0'),
        bucket('Deseos', '0'),
        bucket('Ahorro', '0'),
      ]),
    ).toEqual([])
  })

  // FIX 6: money is validated at the fetch boundary (client.ts), but this
  // pure fn defends itself too — an unvalidated bad string reaching a bare
  // `BigInt(...)` would throw a raw SyntaxError mid-render (no
  // ErrorBoundary in the app). A malformed/empty total degrades to 0
  // instead of throwing (belt-and-suspenders).
  it('trata un total malformado/vacío como 0 en vez de lanzar (FIX 6)', () => {
    expect(() =>
      calcularDistribucionGasto([bucket('Necesidades', '500000'), bucket('Deseos', ''), bucket('Ahorro', 'abc')]),
    ).not.toThrow()
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '500000'),
      bucket('Deseos', ''),
      bucket('Ahorro', 'abc'),
    ])
    expect(tajadas.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 100],
      ['Deseos', 0],
      ['Ahorro', 0],
    ])
  })

  // FIX 8: a bucket with fraccion 0 mixed among non-zero buckets must not
  // produce NaN/crash.
  it('un bucket con total 0 mezclado con otros no-cero no genera NaN/crash (FIX 8)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '600000'),
      bucket('Deseos', '400000'),
      bucket('Ahorro', '0'),
    ])
    expect(tajadas.map((t) => [t.bucket, t.porcentaje, t.fraccion])).toEqual([
      ['Necesidades', 60, 0.6],
      ['Deseos', 40, 0.4],
      ['Ahorro', 0, 0],
    ])
    expect(tajadas.every((t) => Number.isFinite(t.porcentaje) && Number.isFinite(t.fraccion))).toBe(true)
  })

  it('es BigInt-safe: montos por encima de 2^53 no pierden precisión en la razón', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '9007199254740992'),
      bucket('Ahorro', '9007199254740992'),
    ])
    expect(tajadas.map((t) => t.porcentaje)).toEqual([50, 50])
    expect(tajadas[0].fraccion).toBeCloseTo(0.5, 6)
  })
})
