import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl'
import type { ReclasificarCategoriaDto } from '@/api/types'

function crearWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const dtoDestino: ReclasificarCategoriaDto = {
  id: 'tx-1',
  categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
  bucket: 'Necesidades',
}

describe('ReclasificarCategoriaControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a select with an accessible label naming the transaction (WCAT-05)', () => {
    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    expect(screen.getByLabelText('Cambiar categoría de Supermercado Líder')).toBeInTheDocument()
  })

  it('offers all 8 categorías grouped by bucket via optgroup, current categoría preselected', () => {
    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    const select = screen.getByLabelText('Cambiar categoría de Supermercado Líder') as HTMLSelectElement
    expect(select.value).toBe('Supermercado')
    expect(screen.getAllByRole('option')).toHaveLength(8)
    const necesidades = screen.getByRole('group', { name: 'Necesidades' }) as HTMLOptGroupElement
    expect(Array.from(necesidades.children).map((o) => o.textContent)).toEqual([
      'Supermercado',
      'Combustible',
      'Farmacia',
      'Salud',
      'Transporte',
    ])
    expect(screen.getByRole('group', { name: 'Gustos' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Ahorro' })).toBeInTheDocument()
  })

  it('a SinCategoria row starts with no categoría selected (placeholder)', () => {
    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-2"
        descripcion="Transferencia recibida"
        montoLabel="$0"
        bucketActual="SinCategoria"
        categoriaActual={null}
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    const select = screen.getByLabelText('Cambiar categoría de Transferencia recibida') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('a same-bucket reclassify commits immediately, no confirmation', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dtoDestino) })
    const user = userEvent.setup()

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    await user.selectOptions(screen.getByLabelText('Cambiar categoría de Supermercado Líder'), 'Transporte')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({ body: JSON.stringify({ categoria: 'Transporte' }) }),
      ),
    )
  })

  it('a cross-bucket reclassify shows a confirmation naming the money move, does not commit yet', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dtoDestino) })
    const user = userEvent.setup()

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    await user.selectOptions(screen.getByLabelText('Cambiar categoría de Uber Eats'), 'Transporte')

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Esto mueve $15.000 de Gustos a Necesidades')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirming the cross-bucket move commits it', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dtoDestino) })
    const user = userEvent.setup()

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    await user.selectOptions(screen.getByLabelText('Cambiar categoría de Uber Eats'), 'Transporte')
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transacciones/tx-1/categoria',
        expect.objectContaining({ body: JSON.stringify({ categoria: 'Transporte' }) }),
      ),
    )
  })

  it('cancelling reverts the select to the original categoría, never commits', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dtoDestino) })
    const user = userEvent.setup()

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Uber Eats"
        montoLabel="$15.000"
        bucketActual="Deseos"
        categoriaActual="Delivery"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    const select = screen.getByLabelText('Cambiar categoría de Uber Eats') as HTMLSelectElement
    await user.selectOptions(select, 'Transporte')
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(select.value).toBe('Delivery')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('disables the select while the mutation is pending', async () => {
    let resolverFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    const select = screen.getByLabelText('Cambiar categoría de Supermercado Líder') as HTMLSelectElement
    await user.selectOptions(select, 'Transporte')

    await waitFor(() => expect(select).toBeDisabled())
    resolverFetch({ ok: true, status: 200, json: () => Promise.resolve(dtoDestino) })
    await waitFor(() => expect(select).not.toBeDisabled())
  })

  it('on a failed reclassify, reverts the select and shows an error message (WCAT-04 failed scenario)', async () => {
    mockFetchOnce({ ok: false, status: 404 })
    const user = userEvent.setup()

    render(
      <ReclasificarCategoriaControl
        transaccionId="tx-1"
        descripcion="Supermercado Líder"
        montoLabel="$10.000"
        bucketActual="Necesidades"
        categoriaActual="Supermercado"
        periodo="2026-07"
      />,
      { wrapper: crearWrapper() },
    )

    const select = screen.getByLabelText('Cambiar categoría de Supermercado Líder') as HTMLSelectElement
    await user.selectOptions(select, 'Transporte')

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(select.value).toBe('Supermercado')
  })
})
