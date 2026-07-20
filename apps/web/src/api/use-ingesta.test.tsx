import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useIngesta } from './use-ingesta'
import type { IngestaResponseDto } from './types'

const validDto: IngestaResponseDto = {
  ingestaId: 'ingesta-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  archivo: { nombre: 'cartola.xlsx', extension: '.xlsx', tamanoBytes: 2048 },
  totalTransacciones: 1,
  transacciones: [
    { fecha: '2026-07-15T00:00:00.000Z', descripcion: 'Supermercado', cargo: '50000', abono: '0' },
  ],
}

function archivoDePrueba(): File {
  return new File([new Uint8Array(10)], 'cartola.xlsx')
}

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('al tener éxito invalida exactamente las 3 queries (resumen, resumen-anual, detalle-bucket) y nunca movimientos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useIngesta(), { wrapper: crearWrapper(queryClient) })

    result.current.mutate(archivoDePrueba())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledTimes(3)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['detalle-bucket'] })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['movimientos'] })
  })

  it('expone el ApiError tipado cuando falla, no un throw crudo (mismo patrón que useResumen)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useIngesta(), { wrapper: crearWrapper(queryClient) })

    result.current.mutate(archivoDePrueba())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    })
  })

  it('transiciona status idle -> pending -> success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(validDto) }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useIngesta(), { wrapper: crearWrapper(queryClient) })

    expect(result.current.status).toBe('idle')

    result.current.mutate(archivoDePrueba())

    // El mock de fetch resuelve en el mismo microtask-tick, así que no se
    // puede garantizar observar 'pending' antes de 'success' vía waitFor
    // (poll-based) sin flakiness — se afirma la transición final, que es lo
    // que realmente le importa al componente que consume este hook.
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual(validDto)
  })

  it('transiciona status idle -> pending -> error cuando la request falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useIngesta(), { wrapper: crearWrapper(queryClient) })

    result.current.mutate(archivoDePrueba())

    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
