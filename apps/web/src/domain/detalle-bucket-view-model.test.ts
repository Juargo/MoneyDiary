import { describe, expect, it } from 'vitest'
import { aDetalleBucketViewModel } from './detalle-bucket-view-model'
import type { DetalleBucketDto } from '../api/types'

// Lean view-model mapper (spec W3-03): pre-formats money via formatearMontoCLP
// (BigInt-safe, never Number/parseFloat) and derives a short date label from
// the ISO fecha string — no timezone-shifting Date math, plain string slice
// (KISS: the backend already normalizes to UTC midnight).
const baseTx: DetalleBucketDto['transacciones'][number] = {
  id: 'tx-1',
  fecha: '2026-07-15T00:00:00.000Z',
  descripcion: 'Supermercado Líder',
  cargo: '9007199254740993',
  abono: '0',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
}

describe('aDetalleBucketViewModel', () => {
  it('formats cargo/abono exactly, beyond Number.MAX_SAFE_INTEGER precision', () => {
    const dto: DetalleBucketDto = { periodo: '2026-07', bucket: 'Necesidades', transacciones: [baseTx] }

    const viewModel = aDetalleBucketViewModel(dto)

    expect(viewModel.filas[0].cargoLabel).toBe('$9.007.199.254.740.993')
    expect(viewModel.filas[0].abonoLabel).toBe('$0')
  })

  it('derives a YYYY-MM-DD fecha label from the ISO string', () => {
    const dto: DetalleBucketDto = { periodo: '2026-07', bucket: 'Necesidades', transacciones: [baseTx] }

    const viewModel = aDetalleBucketViewModel(dto)

    expect(viewModel.filas[0].fechaLabel).toBe('2026-07-15')
  })

  it('passes periodo, bucket, and id/descripcion through verbatim', () => {
    const dto: DetalleBucketDto = { periodo: '2026-07', bucket: 'SinCategoria', transacciones: [baseTx] }

    const viewModel = aDetalleBucketViewModel(dto)

    expect(viewModel.periodo).toBe('2026-07')
    expect(viewModel.bucket).toBe('SinCategoria')
    expect(viewModel.filas[0].id).toBe('tx-1')
    expect(viewModel.filas[0].descripcion).toBe('Supermercado Líder')
  })

  it('maps an empty transacciones array to an empty filas array', () => {
    const dto: DetalleBucketDto = { periodo: '2026-07', bucket: 'Ahorro', transacciones: [] }

    const viewModel = aDetalleBucketViewModel(dto)

    expect(viewModel.filas).toEqual([])
  })
})
