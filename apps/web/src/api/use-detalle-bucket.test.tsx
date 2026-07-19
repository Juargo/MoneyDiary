import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useDetalleBucket } from './use-detalle-bucket'
import type { DetalleBucketDto } from './types'

const validDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
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
      categoria: null,
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

describe('useDetalleBucket', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a /api/buckets/:bucket con el query param periodo y expone el DTO parseado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useDetalleBucket('Necesidades', '2026-07'), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/buckets/Necesidades?periodo=2026-07')
    expect(result.current.data).toEqual(validDto)
  })

  it('sin periodo, llama a /api/buckets/:bucket sin query param (resuelve al mes actual en el backend)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useDetalleBucket('Necesidades'), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith('/api/buckets/Necesidades')
  })

  it('expone el ApiError tipado cuando la request falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const { result } = renderHook(() => useDetalleBucket('Necesidades'), { wrapper: crearWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })
})
