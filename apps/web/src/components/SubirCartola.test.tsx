import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubirCartola } from './SubirCartola';
import { usePreviewIngesta } from '@/api/use-preview-ingesta';
import { useCommitIngesta } from '@/api/use-commit-ingesta';
import { useCategorias } from '@/api/use-categorias';
import { useResumen } from '@/api/use-resumen';
import type { ApiError } from '@/api/client';
import type { PreviewIngestaDto, ResumenMesDto } from '@/api/types';
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
//
// Peak-end landing (supersedes PR3's D-01): `useResumen` (NEW) mocked to
// provide the exito-state verdict fetch — SubirCartola calls it
// unconditionally every render (rules-of-hooks), gated internally via
// `enabled`, so a sane default is installed in `beforeEach` and only
// overridden by the tests that actually exercise the exito verdict block.

vi.mock('@/api/use-preview-ingesta', () => ({
  usePreviewIngesta: vi.fn(),
}));
vi.mock('@/api/use-commit-ingesta', () => ({
  useCommitIngesta: vi.fn(),
}));
vi.mock('@/api/use-categorias', () => ({
  useCategorias: vi.fn(),
}));
vi.mock('@/api/use-resumen', () => ({
  useResumen: vi.fn(),
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
const mockedUseResumen = vi.mocked(useResumen);

// Minimal resumen DTO fixture — only the fields the exito verdict block
// reads (`estadoGlobal`, `periodo`). Other ResumenMesDto fields are filled
// with neutral placeholders so the type checks without pulling in unrelated
// money assertions this suite doesn't care about.
function unResumenDto(overrides: Partial<ResumenMesDto> = {}): ResumenMesDto {
  return {
    periodo: '2026-07',
    totalIngreso: '0',
    sinIngreso: false,
    buckets: [],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'verde',
    cantidadSinCategoria: 0,
    ...overrides,
  };
}

// Minimal stand-in for TanStack's UseQueryResult — only what SubirCartola
// reads from `useResumen`.
function unaResumenConsulta(overrides: {
  isPending?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  data?: ResumenMesDto;
}) {
  return {
    isPending: overrides.isPending ?? false,
    isSuccess: overrides.isSuccess ?? false,
    isError: overrides.isError ?? false,
    data: overrides.data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// A single non-duplicate committed row, all in July 2026 — the shared
// fixture for exito-state tests that don't care about the exact date/mode
// derivation (those get their own dedicated test).
function unCommitDtoExito(
  overrides: Partial<{
    totalTransacciones: number;
    fechas: ReadonlyArray<string>;
  }> = {},
) {
  const fechas = overrides.fechas ?? ['2026-07-10T00:00:00.000Z'];
  return {
    ingestaId: 'ing-1',
    totalTransacciones: overrides.totalTransacciones ?? fechas.length,
    duplicadosOmitidos: 0,
    transacciones: fechas.map((fecha, i) => ({
      abono: '0',
      bucket: 'Necesidades',
      cargo: '1000',
      categoriaId: null,
      descripcion: `fila-${i}`,
      fecha,
    })),
  };
}

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
  beforeEach(() => {
    // SubirCartola calls `useResumen` unconditionally every render
    // (rules-of-hooks) — most tests never reach a state where its `enabled`
    // flag is true, but the mock still needs a sane return value or every
    // pre-existing test would blow up reading `.isPending` off `undefined`.
    mockedUseResumen.mockReturnValue(unaResumenConsulta({}));
  });

  afterEach(() => {
    mockedUsePreviewIngesta.mockReset();
    mockedUseCommitIngesta.mockReset();
    mockedUseCategorias.mockReset();
    mockedUseResumen.mockReset();
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

  it('peak-end landing: commit success does NOT auto-navigate (supersedes PR3 D-05/D-01) — it lands on exito instead', async () => {
    const commitMutate = vi.fn().mockImplementation((_vars, opts) => {
      opts?.onSuccess?.();
      opts?.onSettled?.();
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

    expect(mockNavigate).not.toHaveBeenCalled();
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

  // ── Peak-end landing: exito is a real destination, not transient (D-01
  //    superseded) — the success moment lands on the verdict the import
  //    just produced, per the "monthly verdict comes first" principle. ────

  it('renders the confirmation heading, the {N}/{banco} count, and both CTAs — no old "Ir al dashboard" link', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto, // banco: 'BancoEstado'
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({
        isSuccess: true,
        status: 'success',
        data: unCommitDtoExito({ totalTransacciones: 3 }),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(
      screen.getByRole('heading', { name: /importación completada/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 movimientos importados de BancoEstado.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ver resumen del mes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /subir otra cartola/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /ir al dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("derives the dominant month from the committed rows' fechas and fetches its resumen (enabled)", () => {
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
        data: unCommitDtoExito({
          fechas: [
            '2026-07-01T00:00:00.000Z',
            '2026-07-15T00:00:00.000Z',
            '2026-06-30T00:00:00.000Z',
          ],
        }),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(mockedUseResumen).toHaveBeenCalledWith('2026-07', {
      enabled: true,
    });
  });

  it('shows the compact loading pattern while the verdict resumen is in flight', () => {
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
        data: unCommitDtoExito(),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
    mockedUseResumen.mockReturnValue(unaResumenConsulta({ isPending: true }));

    render(<SubirCartola />);

    expect(screen.getByText('Así queda tu mes:')).toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Cargando tu resumen…')).toBeInTheDocument();
    // Success + CTA still stand while the verdict loads.
    expect(
      screen.getByRole('heading', { name: /importación completada/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ver resumen del mes/i }),
    ).toBeInTheDocument();
  });

  it('shows the semáforo verdict (SemaforoBadge, verbatim backend state, ADR-024) once resumen loads', () => {
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
        data: unCommitDtoExito(),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
    mockedUseResumen.mockReturnValue(
      unaResumenConsulta({
        isSuccess: true,
        data: unResumenDto({ estadoGlobal: 'rojo' }),
      }),
    );

    render(<SubirCartola />);

    expect(screen.getByRole('img', { name: /rojo/i })).toBeInTheDocument();
    expect(screen.getByText(/semáforo: rojo/i)).toBeInTheDocument();
  });

  it('degrades gracefully when the verdict resumen fails to load: the success acknowledgment + CTAs still stand, no error look', () => {
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
        data: unCommitDtoExito({ totalTransacciones: 2 }),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
    mockedUseResumen.mockReturnValue(unaResumenConsulta({ isError: true }));

    render(<SubirCartola />);

    // Verdict block absent — but nothing here reads as failure.
    expect(screen.queryByText('Así queda tu mes:')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /importación completada/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 movimientos importados de BancoEstado.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ver resumen del mes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /subir otra cartola/i }),
    ).toBeInTheDocument();
  });

  it('when nothing was persisted (all rows were commit-time duplicates), skips the verdict block entirely — no crash, no undefined leak', () => {
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
          totalTransacciones: 0,
          duplicadosOmitidos: 1,
          transacciones: [],
        },
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(mockedUseResumen).toHaveBeenCalledWith(undefined, {
      enabled: false,
    });
    expect(screen.queryByText('Así queda tu mes:')).not.toBeInTheDocument();
    expect(
      screen.getByText('0 movimientos importados de BancoEstado.'),
    ).toBeInTheDocument();
  });

  it('"Ver resumen del mes" navigates to "/" with the derived month selected', () => {
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
        data: unCommitDtoExito({ fechas: ['2026-07-05T00:00:00.000Z'] }),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    fireEvent.click(
      screen.getByRole('button', { name: /ver resumen del mes/i }),
    );

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/',
      search: { periodo: '2026-07' },
    });
  });

  it('"Subir otra cartola" resets both mutations and edits, and does NOT navigate', () => {
    const previewReset = vi.fn();
    const commitReset = vi.fn();

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
        isSuccess: true,
        status: 'success',
        data: unCommitDtoExito(),
        reset: commitReset,
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    fireEvent.click(
      screen.getByRole('button', { name: /subir otra cartola/i }),
    );

    expect(previewReset).toHaveBeenCalledTimes(1);
    expect(commitReset).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Polish fix: `<input type="file">` is uncontrolled — clearing React state
  // alone leaves the browser still showing the just-imported filename.
  // `handleDescartar` doesn't need this (it navigates to a different route,
  // which remounts the component); `handleSubirOtra` resets IN PLACE, so it
  // must force the input to remount to actually clear the native selection.
  it('"Subir otra cartola" clears the native file input selection (uncontrolled DOM state)', () => {
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
        data: unCommitDtoExito(),
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    const archivo = new File(['contenido'], 'cartola-julio.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = screen.getByLabelText(
      /selecciona un archivo/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [archivo] } });
    expect(input.files).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', { name: /subir otra cartola/i }),
    );

    const inputTrasReset = screen.getByLabelText(
      /selecciona un archivo/i,
    ) as HTMLInputElement;
    expect(inputTrasReset.files).toHaveLength(0);
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

  it('CU-07: file input is enabled in idle state', () => {
    idleHooks();

    render(<SubirCartola />);

    expect(screen.getByLabelText(/selecciona un archivo/i)).toBeEnabled();
  });

  // ── A11y: exito focus restoration (issue 1) ──────────────────────────────

  it('CU-05: on exito, focus moves to the result heading', async () => {
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

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /importación completada/i }),
      ).toHaveFocus(),
    );
  });

  it('CU-05: the exito heading carries the focus-visible outline convention', () => {
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

    const heading = screen.getByRole('heading', {
      name: /importación completada/i,
    });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading.className).toMatch(/focus-visible:outline/);
  });

  // ── SEC-01: guard releases on settle (issue 2) ───────────────────────────

  it('SEC-01: double-submit guard releases after onSettled so retry is allowed', async () => {
    // commitMutate immediately invokes onSettled to simulate settle after error
    const commitMutate = vi.fn().mockImplementation(
      (
        _vars,
        opts:
          | {
              onSuccess?: () => void;
              onSettled?: () => void;
            }
          | undefined,
      ) => {
        opts?.onSettled?.();
      },
    );

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
    // Guard released via onSettled; second click should go through
    fireEvent.click(btn);

    expect(commitMutate).toHaveBeenCalledTimes(2);
  });

  // ── Commit-error message variants (issue 3) ──────────────────────────────

  it.each([
    { tag: 'network', message: 'No se pudo conectar.' },
    { tag: 'server', message: 'Error interno del servidor.' },
  ] as Array<{ tag: string; message: string }>)(
    'CU-04: commit error ($tag) renders message verbatim in role="alert" with no raw JSON leak',
    ({ tag, message }) => {
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
          error: { tag, message } as unknown as import('@/api/client').ApiError,
        }),
      );
      mockedUseCategorias.mockReturnValue(
        unaConsulta({ data: unCatalogoDto() }),
      );

      render(<SubirCartola />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(message);
      // No raw JSON leak
      expect(alert.textContent).not.toMatch(/\{"tag"/);
    },
  );

  // ── CU-05 aria-live includes committing state (issue 4) ──────────────────

  it('CU-05: aria-live region announces committing state', () => {
    mockedUsePreviewIngesta.mockReturnValue(
      unaMutacion<PreviewIngestaDto>({
        isSuccess: true,
        status: 'success',
        data: validPreviewDto,
      }),
    );
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ isPending: true, status: 'pending' }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    const region = screen.getByRole('status', { name: /estado de la subida/i });
    // MENSAJE_POR_ESTADO['committing'] = 'Subiendo transacciones…'
    expect(region.textContent).toMatch(/subiendo transacciones/i);
  });

  // ── D-10: duplicate rows never enter committed edits (issue 5) ───────────

  it('D-10: clicking "Agregar transacciones" with only duplicate rows calls commitMutate with edits: []', async () => {
    const commitMutate = vi.fn();

    mockedUsePreviewIngesta.mockReturnValue(unaMutacion<PreviewIngestaDto>({}));
    mockedUseCommitIngesta.mockReturnValue(
      unaMutacion({ mutate: commitMutate }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    const { rerender } = render(<SubirCartola />);

    // Upload a file first to set archivo state
    await userEvent.upload(
      screen.getByLabelText(/selecciona un archivo/i),
      unArchivo('cartola.xlsx', 1024),
    );

    // Flip to preview-listo with only duplicate rows
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
    rerender(<SubirCartola />);

    // Selects are disabled (existing D-10 assertion)
    expect(screen.getByLabelText(/Fila 1: bucket/i)).toBeDisabled();
    expect(screen.getByLabelText(/Fila 1: categoría/i)).toBeDisabled();

    // Click commit — edits map is empty so edits: [] is passed
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
    expect(vars.edits).toEqual([]);
  });

  // ── .toBeEnabled() asserts (issue 6) ────────────────────────────────────

  it('D-11: "Agregar transacciones" retry button is enabled after commit error', () => {
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
        error: { tag: 'invalid', message: 'Error al procesar.' },
      }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    render(<SubirCartola />);

    expect(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    ).toBeEnabled();
  });

  // ── SEC-01: committing keeps review visible (issue 7) ────────────────────

  it('SEC-01: while committing, the review affordance stays rendered', () => {
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

    // Review affordance still rendered during commit
    expect(screen.getByText(/nada se ha guardado aún/i)).toBeInTheDocument();
    // "Agregar transacciones" button is disabled (committing) but present
    expect(
      screen.getByRole('button', { name: /agregar transacciones/i }),
    ).toBeDisabled();
  });
});
