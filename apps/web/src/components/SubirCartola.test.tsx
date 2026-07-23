import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SubirCartola } from './SubirCartola'
import { useIngesta } from '@/api/use-ingesta'
import type { ApiError } from '@/api/client'
import type { IngestaResponseDto } from '@/api/types'

// upload-cartola-ui (US-031/US-032): component-level suite, NOT an
// integration test against real `fetch` — `useIngesta` (A.7) is mocked so
// every mutation transition (pending/success/error) is driven directly,
// mirroring how `validarArchivoWeb` (A.3, real/unmocked — it's a pure
// function, no reason to fake it) drives the pre-submit validation path.
vi.mock('@/api/use-ingesta', () => ({ useIngesta: vi.fn() }))

const mockedUseIngesta = vi.mocked(useIngesta)

const validDto: IngestaResponseDto = {
  ingestaId: 'ingesta-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  archivo: { nombre: 'cartola.xlsx', extension: '.xlsx', tamanoBytes: 2048 },
  totalTransacciones: 1,
  duplicadosOmitidos: 0,
  transacciones: [
    { fecha: '2026-07-15T00:00:00.000Z', descripcion: 'Supermercado Líder', cargo: '50000', abono: '0' },
  ],
}

function unArchivo(nombre: string, tamanoBytes: number): File {
  return new File([new Uint8Array(tamanoBytes)], nombre)
}

// A minimal stand-in for TanStack's `UseMutationResult<IngestaResponseDto,
// ApiError, File>` — only the fields `SubirCartola` actually reads.
function unaMutacion(overrides: {
  status?: 'idle' | 'pending' | 'success' | 'error'
  isPending?: boolean
  isSuccess?: boolean
  isError?: boolean
  error?: ApiError | null
  data?: IngestaResponseDto | undefined
  mutate?: (file: File) => void
  reset?: () => void
}) {
  return {
    status: overrides.status ?? 'idle',
    isPending: overrides.isPending ?? false,
    isSuccess: overrides.isSuccess ?? false,
    isError: overrides.isError ?? false,
    error: overrides.error ?? null,
    data: overrides.data,
    mutate: overrides.mutate ?? vi.fn(),
    reset: overrides.reset ?? vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('SubirCartola', () => {
  afterEach(() => {
    mockedUseIngesta.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // CU-01: oversized/wrong-extension files never reach the mutation.
  it('CU-01: rejects an oversized file client-side with the exact message and never calls mutate', async () => {
    const mutate = vi.fn()
    mockedUseIngesta.mockReturnValue(unaMutacion({ mutate }))

    render(<SubirCartola />)

    const archivo = unArchivo('cartola.xlsx', 5 * 1024 * 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    expect(
      screen.getByText(
        'El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes.',
      ),
    ).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('CU-01: rejects an unsupported extension client-side with the exact message and never calls mutate', async () => {
    const mutate = vi.fn()
    mockedUseIngesta.mockReturnValue(unaMutacion({ mutate }))

    render(<SubirCartola />)

    const archivo = unArchivo('cartola.csv', 1024)
    // The real `<input accept=".xlsx,.pdf">` already blocks a `.csv` picked
    // through a native browser dialog — `applyAccept: false` bypasses that
    // jsdom emulation so this test proves the DOMAIN validation
    // (`validarArchivoWeb`) independently rejects it too (defense in depth,
    // design.md Decision 2 — a renamed/dragged file can still slip past the
    // `accept` filter in a real browser).
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    expect(screen.getByText('Formato no soportado. Sube un archivo .xlsx o .pdf.')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  // Retry-after-error: verifies the `mutation.reset()` + `errorValidacion`
  // clear path in `handleFileChange` — selecting a VALID file after a
  // rejected one must clear the stale error and re-enable a real submit.
  it('CU-01: selecting a valid file after a rejected one clears the error and lets mutate fire on submit', async () => {
    const mutate = vi.fn()
    const reset = vi.fn()
    mockedUseIngesta.mockReturnValue(unaMutacion({ mutate, reset }))

    render(<SubirCartola />)

    const archivoInvalido = unArchivo('cartola.csv', 1024)
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(screen.getByLabelText(/selecciona un archivo/i), archivoInvalido)

    expect(screen.getByText('Formato no soportado. Sube un archivo .xlsx o .pdf.')).toBeInTheDocument()

    const archivoValido = unArchivo('cartola.xlsx', 1024)
    await user.upload(screen.getByLabelText(/selecciona un archivo/i), archivoValido)

    expect(screen.queryByText('Formato no soportado. Sube un archivo .xlsx o .pdf.')).not.toBeInTheDocument()

    const boton = screen.getByRole('button', { name: /subir cartola/i })
    fireEvent.click(boton)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(archivoValido, expect.objectContaining({ onSettled: expect.any(Function) }))
  })

  // CU-02: confirm triggers `subiendo`; no double-submit.
  it('CU-02: submitting a valid file calls mutate exactly once and disables the submit control while subiendo', async () => {
    const mutate = vi.fn()
    mockedUseIngesta.mockReturnValue(unaMutacion({ mutate }))

    render(<SubirCartola />)

    const archivo = unArchivo('cartola.xlsx', 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)
    const boton = screen.getByRole('button', { name: /subir cartola/i })
    fireEvent.click(boton)

    expect(mutate).toHaveBeenCalledTimes(1)
    // Second arg is the per-call `{ onSettled }` that resets the SEC-01
    // double-submit guard ref — asserted separately, not by identity.
    expect(mutate).toHaveBeenCalledWith(archivo, expect.objectContaining({ onSettled: expect.any(Function) }))
  })

  it('CU-02: a second click while subiendo does not fire a second mutate and the control stays disabled', () => {
    const mutate = vi.fn()
    mockedUseIngesta.mockReturnValue(unaMutacion({ isPending: true, status: 'pending', mutate }))

    render(<SubirCartola />)

    const boton = screen.getByRole('button', { name: /subir cartola/i })
    expect(boton).toBeDisabled()
    fireEvent.click(boton)

    expect(mutate).not.toHaveBeenCalled()
  })

  // Money-duplication regression: `mutation.isPending` is a stale render
  // value and TanStack's notify-to-render is NOT synchronous inside a bare
  // `fireEvent.click` (no `await` in between) — so a mocked mutation can't
  // reproduce the race. This test wires the REAL `useIngesta` (real
  // `useMutation`) against a deferred/never-resolving `fetch`, exactly like
  // the reliability reviewer did, and fires two synchronous clicks with no
  // `await` between them.
  it('SEC-01: two synchronous clicks before paint call postIngesta exactly once (double-submit guard)', async () => {
    const actual = await vi.importActual<typeof import('@/api/use-ingesta')>('@/api/use-ingesta')
    mockedUseIngesta.mockImplementation(actual.useIngesta)

    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    render(<SubirCartola />, { wrapper: Wrapper })

    const archivo = unArchivo('cartola.xlsx', 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    const boton = screen.getByRole('button', { name: /subir cartola/i })
    fireEvent.click(boton)
    fireEvent.click(boton)

    // Flush the microtask queue so any `mutate()` call scheduled by either
    // click reaches `postIngesta`/`fetch` — WITHOUT this, neither click's
    // network call would be observable yet, masking the race either way.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // CU-03: success result panel.
  it('CU-03: on success shows banco, tipoCuenta, numeroCuenta, totalTransacciones and a transaction preview row', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: validDto }))

    render(<SubirCartola />)

    expect(screen.getByText('BancoEstado')).toBeInTheDocument()
    expect(screen.getByText('CuentaRUT')).toBeInTheDocument()
    expect(screen.getByText('12345678')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Supermercado Líder')).toBeInTheDocument()
    expect(screen.getByText('$50.000')).toBeInTheDocument()
  })

  // Boundary: an empty transaction list must render the result panel
  // without crashing (no out-of-bounds access on `.slice(0, N)` of `[]`).
  it('CU-03: renders the result panel without crashing when transacciones is empty', () => {
    const dtoSinTransacciones: IngestaResponseDto = { ...validDto, totalTransacciones: 0, transacciones: [] }
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: dtoSinTransacciones }))

    render(<SubirCartola />)

    expect(screen.getByRole('heading', { name: /cartola subida/i })).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  // Boundary: more than CANTIDAD_PREVIEW_TRANSACCIONES (5) transactions must
  // truncate the preview list to exactly 5 rows.
  it('CU-03: truncates the transaction preview to exactly 5 rows when the response has more than 5', () => {
    const transaccionesDeSobra = Array.from({ length: 8 }, (_, indice) => ({
      fecha: `2026-07-0${(indice % 9) + 1}T00:00:00.000Z`,
      descripcion: `Transacción ${indice + 1}`,
      cargo: '1000',
      abono: '0',
    }))
    const dtoConSobra: IngestaResponseDto = {
      ...validDto,
      totalTransacciones: transaccionesDeSobra.length,
      transacciones: transaccionesDeSobra,
    }
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: dtoConSobra }))

    render(<SubirCartola />)

    expect(screen.getAllByText(/^Transacción \d$/)).toHaveLength(5)
    expect(screen.getByText('Transacción 1')).toBeInTheDocument()
    expect(screen.getByText('Transacción 5')).toBeInTheDocument()
    expect(screen.queryByText('Transacción 6')).not.toBeInTheDocument()
  })

  // US-005 (Slice 3): inline, non-blocking banner when the backend omitted
  // duplicate rows. X = totalTransacciones (already imported/post-dedup), Y =
  // duplicadosOmitidos — no subtraction (totalTransacciones is post-dedup).
  it('US-005: shows the omitted-duplicates banner with the correct X/Y counts when duplicadosOmitidos > 0', () => {
    const dtoConDuplicados: IngestaResponseDto = {
      ...validDto,
      totalTransacciones: 7,
      duplicadosOmitidos: 3,
    }
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: dtoConDuplicados }))

    render(<SubirCartola />)

    expect(screen.getByText('Se importaron 7, se omitieron 3 duplicados')).toBeInTheDocument()
  })

  // CA-04: normal flow unchanged when there are zero duplicates — no banner.
  it('US-005: does not show the omitted-duplicates banner when duplicadosOmitidos is 0', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: validDto }))

    render(<SubirCartola />)

    expect(screen.queryByText(/se omitieron/i)).not.toBeInTheDocument()
  })

  // CU-04: each known error variant renders its body.message verbatim.
  it.each([
    { message: 'No reconocimos el banco de este archivo.' },
    { message: 'La estructura del archivo no es la esperada.' },
    { message: 'No pudimos leer texto en este PDF.' },
    { message: 'El archivo no cumple el formato o tamaño esperado.' },
  ])('CU-04: renders the backend message verbatim ($message)', ({ message }) => {
    const error: ApiError = { tag: 'invalid', message }
    mockedUseIngesta.mockReturnValue(unaMutacion({ isError: true, status: 'error', error }))

    render(<SubirCartola />)

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/\{.*"tag"/)).not.toBeInTheDocument()
  })

  // CU-04: rendering must not be coupled to the `'invalid'` tag specifically
  // — any `ApiError` variant's `message` renders the same way (tag-agnostic).
  it('CU-04: renders the message verbatim for a non-"invalid" ApiError tag (network)', () => {
    const error: ApiError = { tag: 'network', message: 'No se pudo conectar con el servidor.' }
    mockedUseIngesta.mockReturnValue(unaMutacion({ isError: true, status: 'error', error }))

    render(<SubirCartola />)

    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeInTheDocument()
  })

  // CU-05: a11y — label, aria-live, focus management.
  it('CU-05: the file input has an associated label', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({}))

    render(<SubirCartola />)

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeInTheDocument()
  })

  it('CU-05: an aria-live="polite" region announces the idle, subiendo, éxito and error states', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({}))
    const { rerender } = render(<SubirCartola />)
    const region = screen.getByRole('status', { name: /estado de la subida/i })
    expect(region).toHaveAttribute('aria-live', 'polite')
    const idleText = region.textContent

    mockedUseIngesta.mockReturnValue(unaMutacion({ isPending: true, status: 'pending' }))
    rerender(<SubirCartola />)
    expect(region.textContent).not.toBe(idleText)
    expect(region.textContent).toMatch(/subiendo/i)

    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: validDto }))
    rerender(<SubirCartola />)
    expect(region.textContent).toMatch(/correctamente/i)

    mockedUseIngesta.mockReturnValue(
      unaMutacion({ isError: true, status: 'error', error: { tag: 'invalid', message: 'Archivo inválido.' } }),
    )
    rerender(<SubirCartola />)
    expect(region.textContent).toMatch(/error|no se pudo/i)
  })

  it('CU-05: on éxito, focus moves to the result heading', async () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: validDto }))

    render(<SubirCartola />)

    await waitFor(() => expect(screen.getByRole('heading', { name: /cartola subida/i })).toHaveFocus())
  })

  it('CU-05: on error, focus moves to the error text', async () => {
    mockedUseIngesta.mockReturnValue(
      unaMutacion({ isError: true, status: 'error', error: { tag: 'invalid', message: 'Archivo inválido.' } }),
    )

    render(<SubirCartola />)

    await waitFor(() => expect(screen.getByText('Archivo inválido.')).toHaveFocus())
  })

  // WCAG 2.2 AA 2.4.7 — both elements that receive programmatic focus must
  // carry a VISIBLE focus indicator, not `outline-none` with no replacement.
  // Same convention as ResumenAnual/DistribucionPie/LeyendaGasto.
  it('CU-05: the result heading carries the focus-visible outline convention (WCAG 2.4.7)', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({ isSuccess: true, status: 'success', data: validDto }))

    render(<SubirCartola />)

    const heading = screen.getByRole('heading', { name: /cartola subida/i })
    expect(heading.className).toContain('focus-visible:outline')
    expect(heading.className).toContain('focus-visible:outline-2')
    expect(heading.className).toContain('focus-visible:outline-ring')
    expect(heading.className).not.toContain('focus:outline-none')
  })

  it('CU-05: the error text carries the focus-visible outline convention (WCAG 2.4.7)', () => {
    mockedUseIngesta.mockReturnValue(
      unaMutacion({ isError: true, status: 'error', error: { tag: 'invalid', message: 'Archivo inválido.' } }),
    )

    render(<SubirCartola />)

    const errorText = screen.getByText('Archivo inválido.')
    expect(errorText.className).toContain('focus-visible:outline')
    expect(errorText.className).toContain('focus-visible:outline-2')
    expect(errorText.className).toContain('focus-visible:outline-ring')
    expect(errorText.className).not.toContain('focus:outline-none')
  })

  // CU-07: demo nudge, non-blocking.
  it('CU-07: shows the demo nudge and keeps the file input usable when esDemo is true', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({}))

    render(<SubirCartola esDemo={true} />)

    expect(screen.getByRole('status', { name: /aviso de subida en modo demo/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled()
  })

  it('CU-07: does not show the demo nudge when esDemo is false/absent', () => {
    mockedUseIngesta.mockReturnValue(unaMutacion({}))

    render(<SubirCartola />)

    expect(screen.queryByRole('status', { name: /aviso de subida en modo demo/i })).not.toBeInTheDocument()
  })
})
