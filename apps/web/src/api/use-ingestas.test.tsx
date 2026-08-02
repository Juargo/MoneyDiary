import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useIngestas } from './use-ingestas'
import type { IngestaListItemDto } from './types'

const validIngestas: IngestaListItemDto[] = [
  {
    id: 'ingesta-1',
    banco: 'BancoEstado',
    nombreArchivo: 'cartola-julio.xlsx',
    estado: 'PROCESADA',
    motivoFallo: null,
    fecha: '2026-07-15T00:00:00.000Z',
    totalTransacciones: 12,
  },
]

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useIngestas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('usa la queryKey ["ingestas"]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: validIngestas }) }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    renderHook(() => useIngestas(), { wrapper: crearWrapper(queryClient) })

    await waitFor(() => expect(queryClient.getQueryState(['ingestas'])?.status).toBe('success'))
  })

  it('resuelve con la lista de ingestas en éxito', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: validIngestas }) }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useIngestas(), { wrapper: crearWrapper(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(validIngestas)
  })

  it('expone el ApiError tipado cuando falla, no un throw crudo (mismo patrón que useResumen)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useIngestas(), { wrapper: crearWrapper(queryClient) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual({ tag: 'unauthorized', message: 'Sin acceso.' })
  })
})
