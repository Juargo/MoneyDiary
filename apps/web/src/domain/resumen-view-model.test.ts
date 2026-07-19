import { describe, expect, it } from 'vitest'
import { aResumenViewModel, bucketConMayorTotal } from './resumen-view-model'
import type { ResumenMesDto } from '../api/types'

function dto(overrides: Partial<ResumenMesDto> = {}): ResumenMesDto {
  return {
    periodo: '2026-07',
    totalIngreso: '1000000',
    sinIngreso: false,
    buckets: [
      { bucket: 'Necesidades', total: '400000', porcentajeBp: 4000, estadoSemaforo: 'verde' },
      { bucket: 'Deseos', total: '250000', porcentajeBp: 2500, estadoSemaforo: 'verde' },
      { bucket: 'Ahorro', total: '350000', porcentajeBp: 3500, estadoSemaforo: 'amarillo' },
      { bucket: 'SinCategoria', total: '0', porcentajeBp: 0, estadoSemaforo: null },
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'amarillo',
    ...overrides,
  }
}

describe('aResumenViewModel', () => {
  it('formatea totalIngreso como CLP', () => {
    const vm = aResumenViewModel(dto())
    expect(vm.totalIngreso).toBe('$1.000.000')
  })

  it('preserva cada dígito exacto en montos que exceden Number.MAX_SAFE_INTEGER (W1-01)', () => {
    const vm = aResumenViewModel(dto({ totalIngreso: '9007199254740993' }))
    expect(vm.totalIngreso).toBe('$9.007.199.254.740.993')
  })

  it('mapea cada bucket con su monto formateado y porcentaje', () => {
    const vm = aResumenViewModel(dto())
    const necesidades = vm.buckets.find((b) => b.bucket === 'Necesidades')
    expect(necesidades).toMatchObject({
      bucket: 'Necesidades',
      total: '$400.000',
      porcentajeLabel: '40%',
      estadoSemaforo: 'verde',
    })
  })

  it('mapea porcentajeBp: 0 (verdadero cero) como "0%"', () => {
    const vm = aResumenViewModel(dto())
    const sinCategoria = vm.buckets.find((b) => b.bucket === 'SinCategoria')
    expect(sinCategoria?.porcentajeLabel).toBe('0%')
  })

  it('mapea porcentajeBp: null a una etiqueta distinta de "0%" (MOB-06 / W1-02)', () => {
    const vm = aResumenViewModel(
      dto({
        sinIngreso: true,
        totalIngreso: '0',
        buckets: [
          { bucket: 'Necesidades', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Deseos', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Ahorro', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
        ],
        estadoGlobal: null,
      }),
    )
    const necesidades = vm.buckets.find((b) => b.bucket === 'Necesidades')
    expect(necesidades?.porcentajeLabel).not.toBe('0%')
  })

  it('mapea sinIngreso: true a un flag de vacío distinto de un dato $0', () => {
    const vm = aResumenViewModel(dto({ sinIngreso: true, totalIngreso: '0' }))
    expect(vm.sinIngreso).toBe(true)
    expect(vm.totalIngreso).toBe('$0')
  })

  it('mapea estadoSemaforo por bucket a un indicador visual (passthrough, sin recomputar)', () => {
    const vm = aResumenViewModel(dto())
    const ahorro = vm.buckets.find((b) => b.bucket === 'Ahorro')
    expect(ahorro?.estadoSemaforo).toBe('amarillo')
  })

  it('mapea estadoSemaforo: null por bucket', () => {
    const vm = aResumenViewModel(dto())
    const sinCategoria = vm.buckets.find((b) => b.bucket === 'SinCategoria')
    expect(sinCategoria?.estadoSemaforo).toBeNull()
  })

  it('propaga estadoGlobal al view model (passthrough)', () => {
    const vm = aResumenViewModel(dto())
    expect(vm.estadoGlobal).toBe('amarillo')
  })

  it('propaga estadoGlobal: null cuando sinIngreso', () => {
    const vm = aResumenViewModel(dto({ estadoGlobal: null }))
    expect(vm.estadoGlobal).toBeNull()
  })

  it('propaga los targets 50/30/20 para referencia visual', () => {
    const vm = aResumenViewModel(dto())
    expect(vm.targets).toEqual({ Necesidades: 50, Deseos: 30, Ahorro: 20 })
  })

  it('propaga periodo verbatim', () => {
    const vm = aResumenViewModel(dto({ periodo: '2026-06' }))
    expect(vm.periodo).toBe('2026-06')
  })

  it('calcula la distribución de gasto (share-of-gasto) para el pie, excluyendo SinCategoria', () => {
    const vm = aResumenViewModel(dto())
    // Necesidades 400k / Deseos 250k / Ahorro 350k → 40/25/35 sobre el gasto.
    expect(vm.distribucionGasto.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 40],
      ['Deseos', 25],
      ['Ahorro', 35],
    ])
  })

  it('distribucionGasto es dominio puro: solo bucket/porcentaje/fraccion, sin color ni etiqueta UI (FIX 0)', () => {
    const vm = aResumenViewModel(dto())
    const necesidades = vm.distribucionGasto.find((t) => t.bucket === 'Necesidades')
    expect(necesidades).toEqual({ bucket: 'Necesidades', porcentaje: 40, fraccion: expect.any(Number) })
    expect(necesidades).not.toHaveProperty('color')
    expect(necesidades).not.toHaveProperty('etiqueta')
  })

  it('bucketPorDefecto elige el bucket con mayor total entre los 4 (US-030 Slice B, dashboard)', () => {
    const vm = aResumenViewModel(dto())
    // Necesidades 400k es el mayor de los 4 (400k/250k/350k/0).
    expect(vm.bucketPorDefecto).toBe('Necesidades')
  })

  it('bucketPorDefecto compara BigInt-safe montos que exceden Number.MAX_SAFE_INTEGER', () => {
    const vm = aResumenViewModel(
      dto({
        buckets: [
          { bucket: 'Necesidades', total: '400000', porcentajeBp: 4000, estadoSemaforo: 'verde' },
          { bucket: 'Deseos', total: '250000', porcentajeBp: 2500, estadoSemaforo: 'verde' },
          { bucket: 'Ahorro', total: '9007199254740993', porcentajeBp: 3500, estadoSemaforo: 'amarillo' },
          { bucket: 'SinCategoria', total: '0', porcentajeBp: 0, estadoSemaforo: null },
        ],
      }),
    )
    expect(vm.bucketPorDefecto).toBe('Ahorro')
  })

  it('bucketPorDefecto puede elegir SinCategoria cuando concentra el mayor monto', () => {
    const vm = aResumenViewModel(
      dto({
        buckets: [
          { bucket: 'Necesidades', total: '100', porcentajeBp: 10, estadoSemaforo: 'verde' },
          { bucket: 'Deseos', total: '100', porcentajeBp: 10, estadoSemaforo: 'verde' },
          { bucket: 'Ahorro', total: '100', porcentajeBp: 10, estadoSemaforo: 'verde' },
          { bucket: 'SinCategoria', total: '999999', porcentajeBp: 0, estadoSemaforo: null },
        ],
      }),
    )
    expect(vm.bucketPorDefecto).toBe('SinCategoria')
  })

  it('distribucionGasto es [] cuando no hay gasto (evita división por cero)', () => {
    const vm = aResumenViewModel(
      dto({
        buckets: [
          { bucket: 'Necesidades', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Deseos', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Ahorro', total: '0', porcentajeBp: null, estadoSemaforo: null },
        ],
      }),
    )
    expect(vm.distribucionGasto).toEqual([])
  })

  // FIX 8: all 4 canonical buckets (including SinCategoria) present at '0' —
  // distribucionGasto stays [] and nothing crashes.
  it('con los 4 buckets canónicos en 0 (incluyendo SinCategoria), distribucionGasto es [] y no crashea (FIX 8)', () => {
    const vm = aResumenViewModel(
      dto({
        totalIngreso: '0',
        sinIngreso: true,
        buckets: [
          { bucket: 'Necesidades', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Deseos', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Ahorro', total: '0', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
        ],
        estadoGlobal: null,
      }),
    )
    expect(vm.distribucionGasto).toEqual([])
  })

  // FIX 4: `Array.reduce` with no initial value throws on an empty array.
  // Backend always sends the 4 canonical buckets today, but the pure fn
  // itself must not crash if that ever changes.
  describe('bucketConMayorTotal (FIX 4 / FIX 6)', () => {
    it('devuelve null en un array vacío en vez de lanzar', () => {
      expect(() => bucketConMayorTotal([])).not.toThrow()
      expect(bucketConMayorTotal([])).toBeNull()
    })

    it('desempate: con dos buckets en el mismo total máximo, gana el primero en orden del DTO (`>` estricto)', () => {
      const resultado = bucketConMayorTotal([
        { bucket: 'Necesidades', total: '500000', porcentajeBp: null, estadoSemaforo: null },
        { bucket: 'Deseos', total: '500000', porcentajeBp: null, estadoSemaforo: null },
        { bucket: 'Ahorro', total: '100', porcentajeBp: null, estadoSemaforo: null },
      ])
      expect(resultado).toBe('Necesidades')
    })

    // FIX 6: belt-and-suspenders money guard — a malformed/empty total must
    // degrade to 0 instead of throwing a raw SyntaxError mid-render (there is
    // no ErrorBoundary in the app). Money is validated at the fetch boundary
    // (client.ts); this is defense-in-depth on the pure fn itself.
    it('trata un total malformado/vacío como 0 en vez de lanzar (FIX 6)', () => {
      expect(() =>
        bucketConMayorTotal([
          { bucket: 'Necesidades', total: 'abc', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Deseos', total: '250000', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Ahorro', total: '', porcentajeBp: null, estadoSemaforo: null },
        ]),
      ).not.toThrow()
      expect(
        bucketConMayorTotal([
          { bucket: 'Necesidades', total: 'abc', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Deseos', total: '250000', porcentajeBp: null, estadoSemaforo: null },
          { bucket: 'Ahorro', total: '', porcentajeBp: null, estadoSemaforo: null },
        ]),
      ).toBe('Deseos')
    })
  })
})
