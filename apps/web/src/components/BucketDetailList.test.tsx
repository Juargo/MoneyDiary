import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BucketDetailList } from './BucketDetailList'
import type { DetalleBucketDto } from '@/api/types'

// Owns the fetch (via useDetalleBucket), the {loading|error|empty|data}
// state switch (reusing the shared Loading/ErrorState/Empty from W1), and
// the flat row rendering including the SinCategoria classify CTA + the
// always-disabled inline-edit placeholder (spec W3-03, CA-02/CA-03).
const dataDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado Líder',
      cargo: '9007199254740993',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
      categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
    },
  ],
}

const sinCategoriaDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'SinCategoria',
  transacciones: [
    {
      id: 'tx-2',
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'Transferencia recibida',
      cargo: '0',
      abono: '50000',
      banco: 'BCI',
      tipoCuenta: 'Corriente',
      numeroCuenta: '87654321',
      categoria: null,
    },
  ],
}

const emptyDto: DetalleBucketDto = { periodo: '2026-07', bucket: 'Ahorro', transacciones: [] }

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

describe('BucketDetailList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the loading state with detail-appropriate copy while the query is pending', () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    expect(screen.getByText('Cargando movimientos…')).toBeInTheDocument()
    expect(screen.queryByText('Cargando resumen…')).not.toBeInTheDocument()
  })

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('renders the empty state with detail-appropriate copy when the bucket has no transactions in the period', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(emptyDto) })

    render(<BucketDetailList bucket="Ahorro" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() =>
      expect(screen.getByText('No hay movimientos en este bucket para el período.')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/Carga una cartola/)).not.toBeInTheDocument()
  })

  it('renders each row exact CLP amount, beyond safe-integer precision (spec W3-03)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByText('Supermercado Líder')).toBeInTheDocument())
    // The exact amount now also appears in the group's subtotal heading
    // (WCAT-02) — match the row's own "Cargo: …" span exactly so this stays
    // a precise assertion on the row rendering, not an incidental match on
    // the group header.
    expect(screen.getByText('Cargo: $9.007.199.254.740.993')).toBeInTheDocument()
  })

  it('groups transactions under a categoría header showing nombre · subtotal · conteo (WCAT-02)', async () => {
    const dosCategoriasDto: DetalleBucketDto = {
      periodo: '2026-07',
      bucket: 'Necesidades',
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Supermercado Líder',
          cargo: '10000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
        },
        {
          id: 'tx-2',
          fecha: '2026-07-16T00:00:00.000Z',
          descripcion: 'Supermercado Jumbo',
          cargo: '5000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: { id: 'categoria-supermercado', nombre: 'Supermercado' },
        },
        {
          id: 'tx-3',
          fecha: '2026-07-17T00:00:00.000Z',
          descripcion: 'Farmacia Cruz Verde',
          cargo: '3000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
          categoria: { id: 'categoria-farmacia', nombre: 'Farmacia' },
        },
      ],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dosCategoriasDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByText('Supermercado Líder')).toBeInTheDocument())
    // Two groups, Supermercado (2 rows, $15.000) before Farmacia (canonical
    // order — Supermercado precedes Farmacia in the fixed Categoria order).
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'Supermercado · $15.000 · 2 movimientos',
      'Farmacia · $3.000 · 1 movimiento',
    ])
    expect(screen.getByText('Supermercado Jumbo')).toBeInTheDocument()
    expect(screen.getByText('Farmacia Cruz Verde')).toBeInTheDocument()
  })

  // WDS-06: the group header shows a visually distinct total badge — a
  // separate element from the heading text, computed client-side from
  // already-fetched data, BigInt-safe beyond Number.MAX_SAFE_INTEGER.
  it('shows an aggregated total badge next to the group header with the exact BigInt-safe amount (WDS-06)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByText('Supermercado Líder')).toBeInTheDocument())
    expect(screen.getByTestId('categoria-total-badge')).toHaveTextContent('$9.007.199.254.740.993')
    // The badge is additive — the group heading's own accessible text stays
    // exactly as before (no duplicated/altered content inside the heading).
    expect(
      screen.getByRole('heading', { level: 2, name: 'Supermercado · $9.007.199.254.740.993 · 1 movimiento' }),
    ).toBeInTheDocument()
  })

  // WDS-05: each group header shows a category icon (decorative,
  // aria-hidden) mapped from the categoría name, with a generic fallback for
  // "Sin categoría" — never throws, never leaves the header iconless.
  it('shows a decorative category icon beside the group header (WDS-05)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    const { container } = render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, {
      wrapper: crearWrapper(),
    })

    await waitFor(() => expect(screen.getByText('Supermercado Líder')).toBeInTheDocument())
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('groups SinCategoria rows under a "Sin categoría" header (WCAT-02)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(sinCategoriaDto) })

    render(<BucketDetailList bucket="SinCategoria" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByText('Transferencia recibida')).toBeInTheDocument())
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sin categoría · $0 · 1 movimiento' }),
    ).toBeInTheDocument()
  })

  it('demotes group headings one level below the bucket heading (h3 when headingLevel="h2", dashboard reuse)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" headingLevel="h2" />, {
      wrapper: crearWrapper(),
    })

    await waitFor(() => expect(screen.getByText('Supermercado Líder')).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 2, name: 'Necesidades' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Supermercado · $9.007.199.254.740.993 · 1 movimiento' }),
    ).toBeInTheDocument()
  })

  // US-013 S6b (WCAT-04/05): the two disabled placeholders ("Clasificar" /
  // "Editar categoría") are replaced by ONE reclassify `<select>` per row —
  // see `ReclasificarCategoriaControl.test.tsx` for its own dedicated
  // coverage (optgroup contents, cross-bucket confirmation, pending/error
  // UX). These two tests just confirm `BucketDetailList` wires it in with
  // the right per-row props (accessible name, preselected value).
  it('renders an enabled reclassify select per row, accessibly named, preselected to the current categoría', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    const select = (await screen.findByLabelText(
      'Cambiar categoría de Supermercado Líder',
    )) as HTMLSelectElement
    expect(select).not.toBeDisabled()
    expect(select.value).toBe('Supermercado')
    expect(screen.queryByRole('button', { name: /Editar categoría|Clasificar/ })).not.toBeInTheDocument()
  })

  it('a SinCategoria row renders the reclassify select with no categoría preselected (assign flow)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(sinCategoriaDto) })

    render(<BucketDetailList bucket="SinCategoria" periodo="2026-07" />, { wrapper: crearWrapper() })

    const select = (await screen.findByLabelText(
      'Cambiar categoría de Transferencia recibida',
    )) as HTMLSelectElement
    expect(select.value).toBe('')
  })

  // US-030 Slice B (task 30.10): the dashboard reuses this component verbatim
  // for its transactions panel, but that panel sits inside a page that
  // already has its own page-level <h1> — this component's own heading must
  // demote to <h2> there so the page keeps exactly one <h1> (ADR-018).
  // Defaults to 'h1' (unchanged) for the standalone `/buckets/:bucket` route.
  it('demotes its own heading to h2 when headingLevel="h2" is passed (US-030 dashboard reuse)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" headingLevel="h2" />, {
      wrapper: crearWrapper(),
    })

    await waitFor(() => expect(screen.getByText('Necesidades')).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 2, name: 'Necesidades' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('defaults to h1 when headingLevel is not passed (standalone route, unchanged)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Necesidades' })).toBeInTheDocument(),
    )
  })

  // FIX 1: the heading must show the UI label ("Gustos"), never the raw
  // domain bucket name ("Deseos") — the pie/legend already resolve this via
  // ETIQUETA_BUCKET, this component was the one place that skipped it.
  it('shows the UI label in the heading, not the raw domain bucket name (FIX 1)', async () => {
    const deseosDto: DetalleBucketDto = {
      periodo: '2026-07',
      bucket: 'Deseos',
      transacciones: [
        {
          id: 'tx-3',
          fecha: '2026-07-10T00:00:00.000Z',
          descripcion: 'Restaurante',
          cargo: '15000',
          abono: '0',
          banco: 'BCI',
          tipoCuenta: 'Corriente',
          numeroCuenta: '11111111',
          categoria: { id: 'categoria-delivery', nombre: 'Delivery' },
        },
      ],
    }
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(deseosDto) })

    render(<BucketDetailList bucket="Deseos" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Gustos' })).toBeInTheDocument())
    expect(screen.queryByText('Deseos')).not.toBeInTheDocument()
  })
})
