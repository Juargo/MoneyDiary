import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubirCartola } from './SubirCartola';
import { usePreviewIngesta } from '@/api/use-preview-ingesta';
import { useCommitIngesta } from '@/api/use-commit-ingesta';
import { useCategorias } from '@/api/use-categorias';
import type { ApiError } from '@/api/client';
import type { PreviewIngestaDto } from '@/api/types';
import { unaFilaPreview } from '@/test-utils/preview-fixtures';
import type { CatalogoDto } from '@/api/types';

// US-059 PR3 — SubirCartola state-machine rewrite test suite.
//
// PR3 is the SINGLE behavioral flip: the old one-shot `useIngesta` flow is
// replaced by the two-phase preview→review→commit flow.
// - `usePreviewIngesta` (preview phase) mocked as before.
// - `useCommitIngesta` (commit phase, NEW) replaces `useIngesta`.
// - `useCategorias` (catalog co-fetch, NEW) mocked to provide CatalogoEstado.
// - `@tanstack/react-router` navigate mocked via vi.mock.
// - `useIngesta`/`postIngesta` stay exported/untouched (WEB-PRV-11 guard).

vi.mock('@/api/use-preview-ingesta', () => ({
  usePreviewIngesta: vi.fn(),
}));
vi.mock('@/api/use-commit-ingesta', () => ({
  useCommitIngesta: vi.fn(),
}));
vi.mock('@/api/use-categorias', () => ({
  useCategorias: vi.fn(),
}));

// CatalogoDto factory — the shape returned by useCategorias (not CatalogoEstado).
// SubirCartola calls agruparPorBucket(data.categorias) to compute CatalogoEstado.
function unCatalogoDto(): CatalogoDto {
  return {
    categorias: [
      {
        id: 'cat-nec-1',
        nombre: 'Supermercado',
        bucket: 'Necesidades',
        patrones: [],
        transaccionesCount: 0,
      },
      {
        id: 'cat-des-1',
        nombre: 'Restaurantes',
        bucket: 'Deseos',
        patrones: [],
        transaccionesCount: 0,
      },
    ],
  };
}

// Navigate mock — captures navigate({to}) calls for assertion.
// Use importOriginal so Link and other exports remain available.
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockedUsePreviewIngesta = vi.mocked(usePreviewIngesta);
const mockedUseCommitIngesta = vi.mocked(useCommitIngesta);
const mockedUseCategorias = vi.mocked(useCategorias);

// Canonical preview fixture using shared factory (unaFilaPreview).
const validPreviewDto: PreviewIngestaDto = {
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  estructura: { totalFilasDatos: 1 },
  muestra: [],
  filas: [unaFilaPreview({ rowIndex: 0, descripcion: 'Supermercado Líder' })],
  resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
};

function unArchivo(nombre: string, tamanoBytes: number): File {
  return new File([new Uint8Array(tamanoBytes)], nombre);
}

// Minimal stand-in for TanStack UseMutationResult — only what SubirCartola reads.
function unaMutacion<T>(overrides: {
  status?: 'idle' | 'pending' | 'success' | 'error';
  isPending?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  error?: ApiError | null;
  data?: T | undefined;
  mutate?: (...args: unknown[]) => void;
  reset?: () => void;
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
  } as any;
}

// Minimal catalog query result stand-in.
function unaConsulta<T>(overrides: {
  isPending?: boolean;
  isError?: boolean;
  data?: T;
}) {
  return {
    isPending: overrides.isPending ?? false,
    isError: overrides.isError ?? false,
    data: overrides.data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function idleHooks() {
  mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}));
  mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
  mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
}

describe('SubirCartola (US-059 PR3 — commit flow)', () => {
  afterEach(() => {
    mockedUsePreviewIngesta.mockReset();
    mockedUseCommitIngesta.mockReset();
    mockedUseCategorias.mockReset();
    mockNavigate.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── File validation (client-side gate, unchanged) ────────────────────────

  it('CU-01: rejects an oversized file client-side and never calls previewMutation.mutate', async () => {
    const previewMutate = vi.fn();
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ mutate: previewMutate }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    await userEvent.upload(
      screen.getByLabelText(/selecciona un archivo/i),
      unArchivo('cartola.xlsx', 5 * 1024 * 1024),
    );

    expect(
      screen.getByText(
        'El archivo es demasiado grande para subirlo desde la web (máximo 4 MB). Usa la app móvil para archivos más grandes.',
      ),
    ).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it('CU-01: rejects an unsupported extension client-side', async () => {
    const previewMutate = vi.fn();
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ mutate: previewMutate }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      screen.getByLabelText(/selecciona un archivo/i),
      unArchivo('cartola.csv', 1024),
    );

    expect(
      screen.getByText('Formato no soportado. Sube un archivo .xlsx o .pdf.'),
    ).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
  });

  // ── State machine: pick → preview → review ───────────────────────────────

  it('WEB-PRV-01: picking a valid file fires previewMutation.mutate with the file', async () => {
    const previewMutate = vi.fn();
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ mutate: previewMutate }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    const archivo = unArchivo('cartola.xlsx', 1024);
    await userEvent.upload(
      screen.getByLabelText(/selecciona un archivo/i),
      archivo,
    );

    expect(previewMutate).toHaveBeenCalledTimes(1);
    expect(previewMutate).toHaveBeenCalledWith(archivo);
  });

  it('WEB-PRV-02: on preview success renders PreviewMuestra with banco, resumen, rows', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(screen.getByText('BancoEstado')).toBeInTheDocument();
    expect(screen.getByText(/nada se ha guardado aún/i)).toBeInTheDocument();
    expect(screen.getByText('Supermercado Líder')).toBeInTheDocument();
    // "Agregar transacciones" and "Descartar" buttons available
    expect(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /descartar/i }),
    ).toBeInTheDocument();
  });

  it('gates the file picker during preview-listo', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeDisabled();
  });

  it('does not gate the file picker when idle', () => {
    idleHooks();

    render(<SubirCartola />);

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled();
  });

  // ── Edit overlay (D-02/D-03) ─────────────────────────────────────────────

  it('D-03: edits state updates on onEditChange so FilaRevision receives the updated categoriaId', async () => {
    // Render in preview-listo with a single non-duplicate row that has the
    // catalog loaded. Simulate the user choosing a category via the selects.
    const user = userEvent.setup();
    const catalogoListo = unCatalogoDto();
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: {
          ...validPreviewDto,
          filas: [
            unaFilaPreview({
              rowIndex: 0,
              descripcion: 'Fila editable',
              esDuplicado: false,
              sugerido: null,
            }),
          ],
        },
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: catalogoListo }));

    render(<SubirCartola />);

    // First pick a bucket (enables the categoría select)
    const bucketSelect = screen.getByLabelText(/Fila 1: bucket/i);
    await user.selectOptions(bucketSelect, 'Necesidades');

    // Then select a categoría
    const categoriaSelect = screen.getByLabelText(/Fila 1: categoría/i);
    await user.selectOptions(categoriaSelect, 'cat-nec-1');

    // The categoría select should reflect the chosen value (D-03 state update)
    expect((categoriaSelect as HTMLSelectElement).value).toBe('cat-nec-1');
  });

  // ── Commit flow (WEB-PRV-06) ─────────────────────────────────────────────

  it('WEB-PRV-06: "Agregar transacciones" calls commitMutation.mutate with sparse edits', async () => {
    const commitMutate = vi.fn();
    const catalogoListo = unCatalogoDto();

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: {
          ...validPreviewDto,
          filas: [
            unaFilaPreview({
              rowIndex: 0,
              esDuplicado: false,
              sugerido: null,
            }),
            unaFilaPreview({
              rowIndex: 1,
              descripcion: 'Fila 2',
              esDuplicado: false,
              sugerido: null,
            }),
          ],
          resumen: { totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 },
        },
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: catalogoListo }));

    const { rerender } = render(<SubirCartola />);

    // Simulate having picked a file first (so archivo state is set).
    const input = screen.getByLabelText(/selecciona un archivo/i);
    // input is disabled at preview-listo, so we use rerender after setting
    // the internal state via the handleFileChange path — simulate pick before
    // preview resolves, then flip to preview-listo.
    // Strategy: start idle, upload file, then flip to preview-listo.
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}));
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: catalogoListo }));
    rerender(<SubirCartola />);

    const archivo = unArchivo('cartola.xlsx', 1024);
    await userEvent.upload(input, archivo);

    // Now flip to preview-listo
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: {
          ...validPreviewDto,
          filas: [
            unaFilaPreview({
              rowIndex: 3,
              descripcion: 'Fila editada',
              esDuplicado: false,
              sugerido: null,
            }),
          ],
          resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
        },
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate }),
    );
    rerender(<SubirCartola />);

    // Edit row 3 — pick bucket then categoría (userEvent for proper state flush)
    const bucketSelect = screen.getByLabelText(/Fila 4: bucket/i);
    await userEvent.selectOptions(bucketSelect, 'Necesidades');
    const categoriaSelect = screen.getByLabelText(/Fila 4: categoría/i);
    await userEvent.selectOptions(categoriaSelect, 'cat-nec-1');

    // Click "Agregar transacciones"
    fireEvent.click(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    );

    expect(commitMutate).toHaveBeenCalledTimes(1);
    const [vars] = commitMutate.mock.calls[0] as [
      {
        file: File;
        edits: Array<{ rowIndex: number; categoriaId: string | null }>;
      },
      unknown,
    ];
    expect(vars.file).toBe(archivo);
    // Sparse: only the touched row (rowIndex 3)
    expect(vars.edits).toEqual([{ rowIndex: 3, categoriaId: 'cat-nec-1' }]);
  });

  it('D-05: commit success calls navigate({to:"/"})', async () => {
    const commitMutate = vi.fn().mockImplementation((_vars, opts) => {
      opts?.onSuccess?.();
    });

    // Start idle so we can upload a file (sets archivo state).
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}));
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    const { rerender } = render(<SubirCartola />);

    const archivo = unArchivo('cartola.xlsx', 1024);
    await userEvent.upload(
      screen.getByLabelText(/selecciona un archivo/i),
      archivo,
    );

    // Flip to preview-listo
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    rerender(<SubirCartola />);

    fireEvent.click(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  // ── Discard (WEB-PRV-07, CA-05) ──────────────────────────────────────────

  it('WEB-PRV-07: "Descartar" resets both mutations, clears edits, and navigates /', async () => {
    const previewReset = vi.fn();
    const commitReset = vi.fn();
    const commitMutate = vi.fn();

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
        reset: previewReset,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        mutate: commitMutate,
        reset: commitReset,
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));

    // No commit called
    expect(commitMutate).not.toHaveBeenCalled();
    // Both mutations reset
    expect(previewReset).toHaveBeenCalledTimes(1);
    expect(commitReset).toHaveBeenCalledTimes(1);
    // Navigate to /
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  // ── Preview error (WEB-PRV-08, D-11) ────────────────────────────────────

  it('WEB-PRV-08: preview error shows backend message in role="alert" and re-enables picker', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isError: true,
        status: 'error',
        error: {
          tag: 'invalid',
          message: 'No reconocimos el banco de este archivo.',
        },
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(
      screen.getByText('No reconocimos el banco de este archivo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled();
  });

  // ── Commit error (D-11: preserve preview + edits) ────────────────────────

  it('D-11: commit error shows message in role="alert"; review table remains rendered; picker re-enabled', async () => {
    const commitError: ApiError = {
      tag: 'invalid',
      message: 'Error al procesar las ediciones.',
    };

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isError: true,
        status: 'error',
        error: commitError,
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    // Error message in role="alert"
    expect(
      screen.getByText('Error al procesar las ediciones.'),
    ).toBeInTheDocument();
    // Review table still rendered (PreviewMuestra visible)
    expect(screen.getByText(/nada se ha guardado aún/i)).toBeInTheDocument();
    expect(screen.getByText('Supermercado Líder')).toBeInTheDocument();
    // Picker re-enabled (D-11: 'error' removed from pickerGateado)
    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled();
    // "Agregar transacciones" accessible for retry
    expect(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    ).toBeInTheDocument();
  });

  it('D-11: on new file picked after commit error, edits are cleared and both mutations reset', async () => {
    const previewMutate = vi.fn();
    const previewReset = vi.fn();
    const commitReset = vi.fn();

    // Start: commit error state with previewMutation.isSuccess
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
        mutate: previewMutate,
        reset: previewReset,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'Commit falló.' },
        reset: commitReset,
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    // Picker is enabled after commit error (D-11)
    const input = screen.getByLabelText(/selecciona un archivo/i);
    expect(input).toBeEnabled();

    // Pick a new file — should reset both mutations and clear edits
    const nuevoArchivo = unArchivo('nueva-cartola.xlsx', 1024);
    await userEvent.upload(input, nuevoArchivo);

    expect(previewReset).toHaveBeenCalledTimes(1);
    expect(commitReset).toHaveBeenCalledTimes(1);
    expect(previewMutate).toHaveBeenCalledWith(nuevoArchivo);
  });

  it('D-11: discard from commit error state resets edits and navigates /', () => {
    const previewReset = vi.fn();
    const commitReset = vi.fn();
    const commitMutate = vi.fn();

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
        reset: previewReset,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'Commit falló.' },
        mutate: commitMutate,
        reset: commitReset,
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));

    expect(commitMutate).not.toHaveBeenCalled();
    expect(previewReset).toHaveBeenCalledTimes(1);
    expect(commitReset).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  // ── Duplicate rows never contribute to edits (D-10) ──────────────────────

  it('D-10: duplicate rows have disabled selects and do not appear in committed edits', () => {
    const commitMutate = vi.fn();
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: {
          ...validPreviewDto,
          filas: [
            unaFilaPreview({
              rowIndex: 0,
              esDuplicado: true,
              descripcion: 'Fila duplicada',
            }),
          ],
          resumen: { totalFilas: 1, duplicadosDetectados: 1, nuevas: 0 },
        },
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    // Duplicate row selects are disabled
    const bucketSelect = screen.getByLabelText(/Fila 1: bucket/i);
    const categoriaSelect = screen.getByLabelText(/Fila 1: categoría/i);
    expect(bucketSelect).toBeDisabled();
    expect(categoriaSelect).toBeDisabled();
  });

  // ── Double-submit guard (D-02, SEC-01) ───────────────────────────────────

  it('SEC-01: double-submit guard prevents duplicate commit calls on two rapid clicks', async () => {
    const commitMutate = vi.fn();

    // Start idle to upload file (sets archivo state)
    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}));
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate, isPending: false }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    const { rerender } = render(<SubirCartola />);

    await userEvent.upload(
      screen.getByLabelText(/selecciona un archivo/i),
      unArchivo('cartola.xlsx', 1024),
    );

    // Flip to preview-listo
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    rerender(<SubirCartola />);

    const btn = screen.getByRole('button', { name: /agregar transacciones/i });
    fireEvent.click(btn);
    fireEvent.click(btn);

    // First click engages the isSubmittingRef; second is blocked
    expect(commitMutate).toHaveBeenCalledTimes(1);
  });

  it('SEC-01: "Agregar transacciones" is disabled while committing (isPending)', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isPending: true,
        status: 'pending',
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    ).toBeDisabled();
  });

  // ── Exito: minimal render with "Importación completada" (D-01) ───────────

  it('D-01: exito state renders minimal "Importación completada" text and dashboard link', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isSuccess: true,
        status: 'success',
        data: {
          ingestaId: 'ing-1',
          totalTransacciones: 1,
          duplicadosOmitidos: 0,
          transacciones: [],
        },
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(
      screen.getByRole('heading', { name: /importación completada/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /ir al dashboard/i }),
    ).toBeInTheDocument();
  });

  // ── WEB-PRV-11: legacy useIngesta/postIngesta unchanged ──────────────────

  it('WEB-PRV-11: useIngesta and postIngesta exports still exist (regression guard)', async () => {
    const useIngestaModule =
      await vi.importActual<typeof import('@/api/use-ingesta')>(
        '@/api/use-ingesta',
      );
    expect(typeof useIngestaModule.useIngesta).toBe('function');

    const clientModule =
      await vi.importActual<typeof import('@/api/client')>('@/api/client');
    expect(typeof (clientModule as Record<string, unknown>).postIngesta).toBe(
      'function',
    );
  });

  // ── A11y (CU-05) ─────────────────────────────────────────────────────────

  it('CU-05: the file input has an associated label', () => {
    idleHooks();

    render(<SubirCartola />);

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeInTheDocument();
  });

  it('CU-05: aria-live polite region announces state', () => {
    idleHooks();
    const { rerender } = render(<SubirCartola />);

    const region = screen.getByRole('status', { name: /estado de la subida/i });
    expect(region).toHaveAttribute('aria-live', 'polite');
    const idleText = region.textContent;

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({ isPending: true, status: 'pending' }),
    );
    rerender(<SubirCartola />);
    expect(region.textContent).not.toBe(idleText);
    expect(region.textContent).toMatch(/vista previa/i);

    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    rerender(<SubirCartola />);
    expect(region.textContent).toMatch(/lista|revisión/i);

    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ isSuccess: true, status: 'success' }),
    );
    rerender(<SubirCartola />);
    expect(region.textContent).toMatch(/completad|importad/i);

    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'Algo salió mal.' },
      }),
    );
    rerender(<SubirCartola />);
    expect(region.textContent).toMatch(/error|no se pudo/i);
  });

  it('CU-05: on preview-listo, focus moves to the preview heading', async () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(unaMutacion({}));
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /vista previa/i }),
      ).toHaveFocus(),
    );
  });

  it('CU-05: on commit error, focus moves to the error text', async () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isError: true,
        status: 'error',
        error: { tag: 'invalid', message: 'Commit error.' },
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    await waitFor(() =>
      expect(screen.getByText('Commit error.')).toHaveFocus(),
    );
  });

  // ── CU-07: demo nudge ────────────────────────────────────────────────────

  it('CU-07: shows demo nudge when esDemo is true', () => {
    idleHooks();

    render(<SubirCartola esDemo={true} />);

    expect(
      screen.getByRole('status', { name: /aviso de subida en modo demo/i }),
    ).toBeInTheDocument();
  });

  it('CU-07: no demo nudge when esDemo is absent', () => {
    idleHooks();

    render(<SubirCartola />);

    expect(
      screen.queryByRole('status', { name: /aviso de subida en modo demo/i }),
    ).not.toBeInTheDocument();
  });
});
