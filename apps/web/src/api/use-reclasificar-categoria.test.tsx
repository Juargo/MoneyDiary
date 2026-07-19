import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useReclasificarCategoria } from './use-reclasificar-categoria'
import type { ReclasificarCategoriaDto } from './types'

const validDto: ReclasificarCategoriaDto = {
  id: 'tx-1',
  categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
  bucket: 'Necesidades',
}

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useReclasificarCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('llama a PATCH /api/transacciones/:id/categoria con el nombre elegido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useReclasificarCategoria('2026-07', 'Necesidades'), {
      wrapper: crearWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ categoria: 'Transporte' }) }),
    )
  })

  it('queda isPending mientras la request está en curso', async () => {
    let resolverFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useReclasificarCategoria('2026-07', 'Necesidades'), {
      wrapper: crearWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' })
    })

    await waitFor(() => expect(result.current.isPending).toBe(true))

    resolverFetch({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('en onSuccess invalida las queries de resumen, detalle-bucket y resumen-anual (WCAT-04)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useReclasificarCategoria('2026-07', 'Necesidades'), {
      wrapper: crearWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen', '2026-07'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['detalle-bucket', 'Necesidades', '2026-07'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] })
  })

  it('sin periodo, invalida ["resumen", "actual"] y ["detalle-bucket", bucket, "actual"] (mismo fallback que los hooks de lectura)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useReclasificarCategoria(undefined, 'Necesidades'), {
      wrapper: crearWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen', 'actual'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['detalle-bucket', 'Necesidades', 'actual'] })
  })

  it('no invalida nada si la mutación falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useReclasificarCategoria('2026-07', 'Necesidades'), {
      wrapper: crearWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'NoExiste' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(result.current.error).toEqual({ tag: 'invalid', message: 'La categoría elegida no es válida.' })
  })
})
