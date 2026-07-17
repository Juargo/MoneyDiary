import { describe, expect, it } from 'vitest'
import { aResumenViewModel } from './resumen-view-model'
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
})
