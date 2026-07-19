import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useMovimientos } from './use-movimientos'
import type { MovimientosMesDto } from './types'

const validDto: MovimientosMesDto = {
  periodo: '2026-07',
  totalTransacciones: 1,
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
      bucket: 'Necesidades',
    },
  ],
}

function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useMovimientos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a /api/movimientos con el query param periodo y expone el DTO parseado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMovimientos('2026-07'), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/movimientos?periodo=2026-07')
    expect(result.current.data).toEqual(validDto)
  })

  it('sin periodo, llama a /api/movimientos sin query param (resuelve al mes actual en el backend)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMovimientos(), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/movimientos')
  })

  it('expone el ApiError tipado cuando la request falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const { result } = renderHook(() => useMovimientos(), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })
})
