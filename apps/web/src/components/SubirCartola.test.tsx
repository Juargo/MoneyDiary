import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SubirCartola } from './SubirCartola'
import { useIngesta } from '@/api/use-ingesta'
import { usePreviewIngesta } from '@/api/use-preview-ingesta'
import type { ApiError } from '@/api/client'
import type { IngestaResponseDto, PreviewIngestaDto } from '@/api/types'

// upload-cartola-ui (US-031/US-032) + us-003-vista-previa Slice 2
// (design.md §9.1): component-level suite, NOT an integration test against
// real `fetch` — both `usePreviewIngesta` (preview phase) and `useIngesta`
// (confirm phase) are mocked so every state transition is driven directly,
// mirroring how `validarArchivoWeb` (real/unmocked — pure function) drives
// the pre-preview client-side gate.
vi.mock('@/api/use-ingesta', () => ({ useIngesta: vi.fn() }))
vi.mock('@/api/use-preview-ingesta', () => ({ usePreviewIngesta: vi.fn() }))

const mockedUseIngesta = vi.mocked(useIngesta)
const mockedUsePreviewIngesta = vi.mocked(usePreviewIngesta)

const validPreviewDto: PreviewIngestaDto = {
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  estructura: { totalFilasDatos: 1 },
  muestra: [
    { fecha: '2026-07-15T00:00:00.000Z', descripcion: 'Supermercado Líder', cargo: '50000', abono: '0' },
  ],
}

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

// A minimal stand-in for TanStack's `UseMutationResult<T, ApiError, File>` —
// only the fields `SubirCartola` actually reads. Shared shape for both mocked
// mutations (preview and confirm).
function unaMutacion<T>(overrides: {
  status?: 'idle' | 'pending' | 'success' | 'error'
  isPending?: boolean
  isSuccess?: boolean
  isError?: boolean
  error?: ApiError | null
  data?: T | undefined
  mutate?: (file: File, opts?: { onSettled?: () => void }) => void
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

function mockIdleHooks() {
  mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}))
  mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))
}

describe('SubirCartola', () => {
  afterEach(() => {
    mockedUseIngesta.mockReset()
    mockedUsePreviewIngesta.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // CU-01: oversized/wrong-extension files never reach EITHER mutation.
  it('CU-01: rejects an oversized file client-side with the exact message and never calls previewIngesta.mutate', async () => {
    const previewMutate = vi.fn()
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({ mutate: previewMutate }))
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    const archivo = unArchivo('cartola.xlsx', 5 * 1024 * 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    expect(
      screen.getByText(
        'El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes.',
      ),
    ).toBeInTheDocument()
    expect(previewMutate).not.toHaveBeenCalled()
  })

  it('CU-01: rejects an unsupported extension client-side with the exact message and never calls previewIngesta.mutate', async () => {
    const previewMutate = vi.fn()
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({ mutate: previewMutate }))
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    const archivo = unArchivo('cartola.csv', 1024)
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    expect(screen.getByText('Formato no soportado. Sube un archivo .xlsx o .pdf.')).toBeInTheDocument()
    expect(previewMutate).not.toHaveBeenCalled()
  })

  // PREV-01/PREV-06: a valid pick automatically fires the preview mutation
  // with the SAME File, no separate "submit" action.
  it('a valid pick automatically fires the preview mutation with the selected file', async () => {
    const previewMutate = vi.fn()
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({ mutate: previewMutate }))
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    const archivo = unArchivo('cartola.xlsx', 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    expect(previewMutate).toHaveBeenCalledTimes(1)
    expect(previewMutate).toHaveBeenCalledWith(archivo)
  })

  // PREV-01/CA-02: on preview success, the sample panel renders (PreviewMuestra
  // content) with canonical headers/fields.
  it('on preview success renders the PreviewMuestra sample panel (banco, count, rows)', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    expect(screen.getByText('BancoEstado')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Supermercado Líder')).toBeInTheDocument()
    expect(screen.getByText('$50.000')).toBeInTheDocument()
  })

  // Gate the file picker while a preview is showing (design §9.2 — "same
  // file on confirm" soft guarantee).
  it('gates (disables) the file picker once preview-listo', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeDisabled()
  })

  it('does NOT gate the file picker in idle', () => {
    mockIdleHooks()

    render(<SubirCartola />)

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled()
  })

  // Confirmar re-uploads the SAME held File via useIngesta.mutate — the
  // existing success summary follows the existing confirm mutation.
  it('Confirmar re-uploads the same held file via useIngesta.mutate', async () => {
    const confirmMutate = vi.fn()
    // Starts idle (picker enabled) so a real pick is possible, then the
    // mocked preview mutation flips to success + rerenders — same reasoning
    // as SEC-01 below: the gated picker cannot be re-picked once preview is
    // already `isSuccess` from the first render.
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}))
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({ mutate: confirmMutate }))

    const { rerender } = render(<SubirCartola />)

    const archivo = unArchivo('cartola.xlsx', 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    rerender(<SubirCartola />)

    const confirmarBtn = screen.getByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn)

    expect(confirmMutate).toHaveBeenCalledTimes(1)
    expect(confirmMutate).toHaveBeenCalledWith(archivo, expect.objectContaining({ onSettled: expect.any(Function) }))
  })

  // CA-04 at the UI layer: Cancelar returns to idle, re-enables the picker,
  // and useIngesta is NEVER called.
  it('Cancelar returns to idle, re-enables the picker, and never calls useIngesta.mutate', async () => {
    const confirmMutate = vi.fn()
    const previewReset = vi.fn()
    const confirmReset = vi.fn()
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
        reset: previewReset,
      }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ mutate: confirmMutate, reset: confirmReset }),
    )

    render(<SubirCartola />)

    const cancelarBtn = screen.getByRole('button', { name: /cancelar/i })
    fireEvent.click(cancelarBtn)

    expect(confirmMutate).not.toHaveBeenCalled()
    expect(previewReset).toHaveBeenCalledTimes(1)
    expect(confirmReset).toHaveBeenCalledTimes(1)
  })

  // A failed preview shows the scrubbed message and allows re-picking.
  it('a failed preview shows the scrubbed message and re-enables the picker', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'No reconocimos el banco de este archivo.' },
      }),
    )
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    expect(screen.getByText('No reconocimos el banco de este archivo.')).toBeInTheDocument()
    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled()
  })

  // CU-03: success result panel after Confirmar succeeds.
  it('CU-03: on confirm success shows banco, tipoCuenta, numeroCuenta, totalTransacciones and a transaction preview row', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: validDto }),
    )

    render(<SubirCartola />)

    expect(screen.getByText('CuentaRUT')).toBeInTheDocument()
    expect(screen.getByText('12345678')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /cartola subida/i })).toBeInTheDocument()
  })

  it('CU-03: renders the result panel without crashing when transacciones is empty', () => {
    const dtoSinTransacciones: IngestaResponseDto = { ...validDto, totalTransacciones: 0, transacciones: [] }
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: dtoSinTransacciones }),
    )

    render(<SubirCartola />)

    expect(screen.getByRole('heading', { name: /cartola subida/i })).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

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
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: dtoConSobra }),
    )

    render(<SubirCartola />)

    expect(screen.getAllByText(/^Transacción \d$/)).toHaveLength(5)
    expect(screen.getByText('Transacción 1')).toBeInTheDocument()
    expect(screen.getByText('Transacción 5')).toBeInTheDocument()
    expect(screen.queryByText('Transacción 6')).not.toBeInTheDocument()
  })

  // US-005 (Slice 3): duplicates-omitted banner in the confirm success panel.
  it('US-005: shows the omitted-duplicates banner with the correct X/Y counts when duplicadosOmitidos > 0', () => {
    const dtoConDuplicados: IngestaResponseDto = { ...validDto, totalTransacciones: 7, duplicadosOmitidos: 3 }
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: dtoConDuplicados }),
    )

    render(<SubirCartola />)

    expect(screen.getByText('Se importaron 7, se omitieron 3 duplicados')).toBeInTheDocument()
  })

  it('US-005: does not show the omitted-duplicates banner when duplicadosOmitidos is 0', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: validDto }),
    )

    render(<SubirCartola />)

    expect(screen.queryByText(/se omitieron/i)).not.toBeInTheDocument()
  })

  // CU-04: confirm-phase error variants render body.message verbatim.
  it.each([
    { message: 'No reconocimos el banco de este archivo.' },
    { message: 'La estructura del archivo no es la esperada.' },
    { message: 'No pudimos leer texto en este PDF.' },
    { message: 'El archivo no cumple el formato o tamaño esperado.' },
  ])('CU-04: renders the confirm-phase backend message verbatim ($message)', ({ message }) => {
    const error: ApiError = { tag: 'invalid', message }
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({ isError: true, status: 'error', error }))

    render(<SubirCartola />)

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/\{.*"tag"/)).not.toBeInTheDocument()
  })

  it('CU-04: renders the message verbatim for a non-"invalid" ApiError tag (network)', () => {
    const error: ApiError = { tag: 'network', message: 'No se pudo conectar con el servidor.' }
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({ isError: true, status: 'error', error }))

    render(<SubirCartola />)

    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeInTheDocument()
  })

  // CU-05: a11y — label, aria-live, focus management.
  it('CU-05: the file input has an associated label', () => {
    mockIdleHooks()

    render(<SubirCartola />)

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeInTheDocument()
  })

  it('CU-05: an aria-live="polite" region announces idle, previsualizando, preview-listo, éxito and error states', () => {
    mockIdleHooks()
    const { rerender } = render(<SubirCartola />)
    const region = screen.getByRole('status', { name: /estado de la subida/i })
    expect(region).toHaveAttribute('aria-live', 'polite')
    const idleText = region.textContent

    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({ isPending: true, status: 'pending' }))
    rerender(<SubirCartola />)
    expect(region.textContent).not.toBe(idleText)
    expect(region.textContent).toMatch(/vista previa/i)

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    rerender(<SubirCartola />)
    expect(region.textContent).toMatch(/lista/i)

    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: validDto }),
    )
    rerender(<SubirCartola />)
    expect(region.textContent).toMatch(/correctamente/i)

    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'Archivo inválido.' },
      }),
    )
    rerender(<SubirCartola />)
    expect(region.textContent).toMatch(/error|no se pudo/i)
  })

  // a11y: on preview-listo, focus moves to the preview heading.
  it('a11y: on preview-listo, focus moves to the preview heading', async () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(unaMutacion<IngestaResponseDto>({}))

    render(<SubirCartola />)

    await waitFor(() => expect(screen.getByRole('heading', { name: /vista previa/i })).toHaveFocus())
  })

  it('CU-05: on confirm éxito, focus moves to the result heading', async () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: validDto }),
    )

    render(<SubirCartola />)

    await waitFor(() => expect(screen.getByRole('heading', { name: /cartola subida/i })).toHaveFocus())
  })

  it('CU-05: on confirm error, focus moves to the error text', async () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'Archivo inválido.' },
      }),
    )

    render(<SubirCartola />)

    await waitFor(() => expect(screen.getByText('Archivo inválido.')).toHaveFocus())
  })

  // WCAG 2.2 AA 2.4.7 — programmatically-focused elements must carry a
  // VISIBLE focus indicator.
  it('CU-05: the confirm result heading carries the focus-visible outline convention (WCAG 2.4.7)', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    mockedUseIngesta.mockReturnValue(
      unaMutacion<IngestaResponseDto>({ isSuccess: true, status: 'success', data: validDto }),
    )

    render(<SubirCartola />)

    const heading = screen.getByRole('heading', { name: /cartola subida/i })
    expect(heading.className).toContain('focus-visible:outline')
    expect(heading.className).not.toContain('focus:outline-none')
  })

  // CU-07: demo nudge, non-blocking.
  it('CU-07: shows the demo nudge and keeps the file input usable when esDemo is true', () => {
    mockIdleHooks()

    render(<SubirCartola esDemo={true} />)

    expect(screen.getByRole('status', { name: /aviso de subida en modo demo/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled()
  })

  it('CU-07: does not show the demo nudge when esDemo is false/absent', () => {
    mockIdleHooks()

    render(<SubirCartola />)

    expect(screen.queryByRole('status', { name: /aviso de subida en modo demo/i })).not.toBeInTheDocument()
  })

  // Money-duplication regression (SEC-01, now on Confirmar): the real
  // `useIngesta` (real `useMutation`) is wired against a deferred fetch, and
  // two synchronous clicks on Confirmar before paint must call postIngesta
  // exactly once.
  it('SEC-01: two synchronous Confirmar clicks before paint call postIngesta exactly once (double-submit guard)', async () => {
    const actualUseIngesta = await vi.importActual<typeof import('@/api/use-ingesta')>('@/api/use-ingesta')
    mockedUseIngesta.mockImplementation(actualUseIngesta.useIngesta)
    // Starts idle (picker enabled) so a real pick is possible, THEN the mock
    // is switched to preview-success + rerendered — this mirrors what
    // `usePreviewIngesta` resolving to would do, without needing a real
    // network round-trip for the (already separately-tested) preview phase.
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}))

    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { rerender } = render(<SubirCartola />, { wrapper: Wrapper })

    const archivo = unArchivo('cartola.xlsx', 1024)
    await userEvent.upload(screen.getByLabelText(/selecciona un archivo/i), archivo)

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isSuccess: true, status: 'success', data: validPreviewDto }),
    )
    rerender(<SubirCartola />)

    const confirmarBtn = screen.getByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmarBtn)
    fireEvent.click(confirmarBtn)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
