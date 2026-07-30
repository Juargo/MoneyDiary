import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EliminarIngestaControl } from './EliminarIngestaControl'

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

describe('EliminarIngestaControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('clicking "Eliminar" opens an alertdialog stating the exact impact count (ING-05)', async () => {
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Se eliminarán 12 movimientos de BancoEstado')
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer.')
  })

  it('moves focus to the confirm button when the dialog opens', async () => {
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await screen.findByRole('alertdialog')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus())
  })

  it('Cancelar closes the dialog without issuing a DELETE and returns focus to the trigger', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    const trigger = screen.getByRole('button', { name: 'Eliminar' })
    await user.click(trigger)
    await screen.findByRole('alertdialog')

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('Escape closes the dialog without issuing a DELETE and returns focus to the trigger', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    const trigger = screen.getByRole('button', { name: 'Eliminar' })
    await user.click(trigger)
    await screen.findByRole('alertdialog')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('Confirmar fires the DELETE and on success closes the dialog', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 })
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ingestas/ingesta-1', { method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('disables the confirm button while the mutation is pending', async () => {
    let resolverFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled())
    resolverFetch({ ok: true, status: 204 })
  })

  it('on a failed delete shows an error message and keeps the dialog open', async () => {
    mockFetchOnce({ ok: false, status: 500 })
    const user = userEvent.setup()
    render(
      <EliminarIngestaControl id="ingesta-1" banco="BancoEstado" fechaLabel="2026-07-15" totalTransacciones={12} />,
      { wrapper: crearWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
