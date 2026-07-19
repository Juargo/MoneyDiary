import { describe, expect, it } from 'vitest'
import { aMovimientosAgrupadosViewModel } from './agrupar-movimientos-por-bucket'
import type { MovimientoMesItemDto, MovimientosMesDto } from '../api/types'

function tx(overrides: Partial<MovimientoMesItemDto> & { id: string }): MovimientoMesItemDto {
  return {
    fecha: '2026-07-01T00:00:00.000Z',
    descripcion: 'Movimiento',
    cargo: '0',
    abono: '0',
    banco: 'BancoEstado',
    tipoCuenta: 'CuentaRUT',
    numeroCuenta: '12345678',
    bucket: 'Necesidades',
    ...overrides,
  }
}

function dto(transacciones: ReadonlyArray<MovimientoMesItemDto>): MovimientosMesDto {
  return {
    periodo: '2026-07',
    totalTransacciones: transacciones.length,
    transacciones,
  }
}

describe('aMovimientosAgrupadosViewModel', () => {
  it('groups rows by bucket (WG-01)', () => {
    const vm = aMovimientosAgrupadosViewModel(
      dto([
        tx({ id: 'a', bucket: 'Necesidades' }),
        tx({ id: 'b', bucket: 'Deseos' }),
        tx({ id: 'c', bucket: 'Necesidades' }),
      ]),
    )

    const necesidades = vm.grupos.find((g) => g.bucket === 'Necesidades')
    expect(necesidades?.filas.map((f) => f.id)).toEqual(['c', 'a']) // date tie → id-desc tiebreak, see WG-03 test below for real ordering
  })

  it('renders only non-empty groups — SinCategoria/Ahorro absent when no rows (WG-01)', () => {
    const vm = aMovimientosAgrupadosViewModel(
      dto([tx({ id: 'a', bucket: 'Necesidades' }), tx({ id: 'b', bucket: 'Deseos' }), tx({ id: 'c', bucket: 'SinCategoria' })]),
    )

    expect(vm.grupos.map((g) => g.bucket)).toEqual(['Necesidades', 'Deseos', 'SinCategoria'])
  })

  it('shows the empty-input case as zero groups', () => {
    const vm = aMovimientosAgrupadosViewModel(dto([]))
    expect(vm.grupos).toEqual([])
  })

  it('orders groups canonically regardless of subtotal size (WG-02)', () => {
    const vm = aMovimientosAgrupadosViewModel(
      dto([
        tx({ id: 'a', bucket: 'SinCategoria', cargo: '900000' }),
        tx({ id: 'b', bucket: 'Necesidades', cargo: '100' }),
        tx({ id: 'c', bucket: 'Ahorro', cargo: '5000' }),
        tx({ id: 'd', bucket: 'Ingreso', abono: '1000000' }),
        tx({ id: 'e', bucket: 'Deseos', cargo: '2000' }),
      ]),
    )

    expect(vm.grupos.map((g) => g.bucket)).toEqual(['Ingreso', 'Necesidades', 'Deseos', 'Ahorro', 'SinCategoria'])
  })

  it('sorts rows within a group by date descending (WG-03)', () => {
    const vm = aMovimientosAgrupadosViewModel(
      dto([
        tx({ id: 'old', bucket: 'Necesidades', fecha: '2026-07-02T00:00:00.000Z' }),
        tx({ id: 'new', bucket: 'Necesidades', fecha: '2026-07-15T00:00:00.000Z' }),
      ]),
    )

    const necesidades = vm.grupos.find((g) => g.bucket === 'Necesidades')
    expect(necesidades?.filas.map((f) => f.id)).toEqual(['new', 'old'])
  })

  it('header shows the exact count and subtotal — spending bucket sums cargo (WG-04)', () => {
    const vm = aMovimientosAgrupadosViewModel(
      dto([
        tx({ id: 'a', bucket: 'Necesidades', cargo: '10000' }),
        tx({ id: 'b', bucket: 'Necesidades', cargo: '25000' }),
      ]),
    )

    const necesidades = vm.grupos.find((g) => g.bucket === 'Necesidades')
    expect(necesidades?.cantidad).toBe(2)
    expect(necesidades?.subtotalLabel).toBe('$35.000')
  })

  it('Ingreso group sums abono, not cargo (WG-04)', () => {
    const vm = aMovimientosAgrupadosViewModel(
      dto([
        tx({ id: 'a', bucket: 'Ingreso', abono: '500000', cargo: '999' }),
        tx({ id: 'b', bucket: 'Ingreso', abono: '250000' }),
      ]),
    )

    const ingreso = vm.grupos.find((g) => g.bucket === 'Ingreso')
    expect(ingreso?.subtotalLabel).toBe('$750.000')
  })

  it('preserves every digit of a subtotal beyond Number.MAX_SAFE_INTEGER — BigInt, never float (WG-04)', () => {
    // 9007199254740993 = Number.MAX_SAFE_INTEGER + 2 — unrepresentable exactly as a JS number.
    const vm = aMovimientosAgrupadosViewModel(
      dto([
        tx({ id: 'a', bucket: 'Necesidades', cargo: '9007199254740991' }),
        tx({ id: 'b', bucket: 'Necesidades', cargo: '2' }),
      ]),
    )

    const necesidades = vm.grupos.find((g) => g.bucket === 'Necesidades')
    expect(necesidades?.subtotalLabel).toBe('$9.007.199.254.740.993')
  })

  it('uses ETIQUETA_BUCKET for the header label (Deseos → Gustos)', () => {
    const vm = aMovimientosAgrupadosViewModel(dto([tx({ id: 'a', bucket: 'Deseos' })]))
    const deseos = vm.grupos.find((g) => g.bucket === 'Deseos')
    expect(deseos?.etiqueta).toBe('Gustos')
  })

  it('renders cargo/abono separately per row, never netted', () => {
    const vm = aMovimientosAgrupadosViewModel(dto([tx({ id: 'a', bucket: 'Necesidades', cargo: '5000', abono: '0' })]))
    const fila = vm.grupos[0].filas[0]
    expect(fila.cargoLabel).toBe('$5.000')
    expect(fila.abonoLabel).toBe('$0')
  })

  it('carries through the periodo', () => {
    const vm = aMovimientosAgrupadosViewModel(dto([tx({ id: 'a' })]))
    expect(vm.periodo).toBe('2026-07')
  })
})
