import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useResumenAnual } from './use-resumen-anual'
import type { ResumenAnualDto, ResumenMesDto } from './types'

const mesBase: ResumenMesDto = {
  periodo: '2026-01',
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
}

const validDto: ResumenAnualDto = {
  anio: 2026,
  meses: Array.from({ length: 12 }, (_, i) => ({
    ...mesBase,
    periodo: `2026-${String(i + 1).padStart(2, '0')}`,
  })),
}

function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useResumenAnual', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a /api/resumen/anual con el query param anio y expone el DTO parseado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useResumenAnual(2026), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/anual?anio=2026')
    expect(result.current.data).toEqual(validDto)
  })

  it('sin anio, llama a /api/resumen/anual sin query param (resuelve al año actual en el backend)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useResumenAnual(), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/anual')
  })

  it('expone el ApiError tipado cuando la request falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const { result } = renderHook(() => useResumenAnual(2026), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })
})
