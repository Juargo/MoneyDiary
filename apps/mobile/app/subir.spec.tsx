import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { CommitIngestaResult } from '../src/api/commit-ingesta';
import type { PreviewIngestaResult } from '../src/api/preview-ingesta';
import type { CatalogoDto } from '../src/domain/catalogo.types';
import type { ApiResult } from '../src/domain/api-error';

// Import after jest.mock is registered.
import Subir from './subir';

// RED-first (US-003 Slice 3 → Phase 8a, design.md Data Flow): the screen now
// wires the tap-row classification sheet into the read-only `revisando` list
// PR6/PR7 built — the catalog is fetched once on entering `revisando`
// (design.md's data-flow annotation), an editable row opens
// `HojaClasificacion` (MOB-PRV-06/07), and confirming it records a pending
// edit (`edits: ReadonlyMap<rowIndex, categoriaId>`) shown as the row's
// effective categoría. Assembling the edits into the commit overlay
// (`aOverlayEdits`, MOB-PRV-08) and the D-09 double-submit guard land in the
// follow-up PR (8b). The document picker and all three transport layers
// (`previewIngesta`, `commitIngesta`, `fetchCatalogo`) are mocked at the
// module boundary so only this screen's own state machine + wiring is under
// test.
const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockPreviewIngesta = jest.fn<Promise<PreviewIngestaResult>, [unknown]>();
jest.mock('../src/api/preview-ingesta', () => ({
  previewIngesta: (asset: unknown) => mockPreviewIngesta(asset),
}));

const mockCommitIngesta = jest.fn<
  Promise<CommitIngestaResult>,
  [unknown, unknown]
>();
jest.mock('../src/api/commit-ingesta', () => ({
  commitIngesta: (asset: unknown, edits: unknown) =>
    mockCommitIngesta(asset, edits),
}));

const mockFetchCatalogo = jest.fn<Promise<ApiResult<CatalogoDto>>, []>();
jest.mock('../src/api/categorias', () => ({
  fetchCatalogo: () => mockFetchCatalogo(),
}));

const mockSolicitarRecargaResumen = jest.fn();
jest.mock('../src/api/resumen-refresh', () => ({
  solicitarRecargaResumen: () => mockSolicitarRecargaResumen(),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function resultadoPicker(
  overrides: Partial<{
    uri: string;
    name: string;
    mimeType: string;
    size: number;
  }> = {},
) {
  return {
    canceled: false as const,
    assets: [
      {
        uri: 'file:///tmp/cartola.xlsx',
        name: 'cartola.xlsx',
        mimeType: XLSX_MIME,
        size: 20480,
        lastModified: Date.now(),
        ...overrides,
      },
    ],
  };
}

const resultadoCancelado = { canceled: true as const, assets: null };

function filaPreview(
  overrides: Partial<{
    rowIndex: number;
    fecha: string;
    descripcion: string;
    cargo: string;
    abono: string;
    esDuplicado: boolean;
    sugerido: { bucket: string; categoriaId: string | null } | null;
  }> = {},
) {
  return {
    rowIndex: 0,
    fecha: '2026-07-01T00:00:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    esDuplicado: false,
    sugerido: null,
    ...overrides,
  };
}

// MOB-PRV-02: the server always emits BOTH the canonical (`filas`/`resumen`)
// and the deprecated legacy (`estructura`/`muestra`) shapes on the wire —
// `estructura`/`muestra` are kept here only so the fixture stays assignable
// to `PreviewIngestaDtoConCanonicos` (still required at the type level);
// `Subir` itself reads exclusively `filas`/`resumen` since this change.
function previewExitoso(filas = [filaPreview()], totalFilas = filas.length) {
  return {
    ok: true as const,
    value: {
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '123456789',
      estructura: { totalFilasDatos: totalFilas },
      muestra: filas.map(({ fecha, descripcion, cargo, abono }) => ({
        fecha,
        descripcion,
        cargo,
        abono,
      })),
      filas,
      resumen: {
        totalFilas,
        duplicadosDetectados: filas.filter((f) => f.esDuplicado).length,
        nuevas: filas.filter((f) => !f.esDuplicado).length,
      },
    },
  };
}

// MOB-PRV-04: `CommitIngestaDto` (unlike the removed `IngestaResponseDto`)
// carries no `banco`/`numeroCuenta` — only the commit-time counts. The as-is
// commit success state renders `totalTransacciones` and `duplicadosOmitidos`
// only.
function commitExitoso(
  overrides: Partial<{
    totalTransacciones: number;
    duplicadosOmitidos: number;
  }> = {},
) {
  return {
    ingestaId: 'ing-1',
    totalTransacciones: 12,
    duplicadosOmitidos: 0,
    transacciones: [],
    ...overrides,
  };
}

// A single categoría in bucket "Necesidades" — matches HojaClasificacion.spec's
// radio-name convention (bucket labels come from `ETIQUETA_BUCKET`,
// 'Necesidades' maps to itself, avoiding the 'Deseos'→'Gustos' label detour).
function categoriaFixture(
  overrides: Partial<{
    id: string;
    nombre: string;
    bucket: string;
    transaccionesCount: number;
  }> = {},
) {
  return {
    id: 'cat-arriendo',
    nombre: 'Arriendo',
    bucket: 'Necesidades',
    transaccionesCount: 0,
    patrones: [],
    ...overrides,
  };
}

function catalogoDto(
  categorias: readonly ReturnType<typeof categoriaFixture>[] = [
    categoriaFixture(),
  ],
): CatalogoDto {
  return { categorias } as CatalogoDto;
}

// Deferred promise so an in-flight state is observable before resolution.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function seleccionarArchivo() {
  await act(async () => {
    await fireEvent.press(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    );
  });
}

async function seleccionarYPrevisualizar() {
  mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
  mockPreviewIngesta.mockResolvedValue(previewExitoso());
  await render(<Subir />);
  await seleccionarArchivo();
  await waitFor(() =>
    expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
  );
}

async function revisarYEditar() {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Revisar y editar' }));
  });
  // The catalog fetch fires as part of this transition (design.md's
  // "+catalog fetch once" annotation) — wait for it to settle (loaded OR
  // failed) before returning, so callers can reliably tap a row next.
  await waitFor(() =>
    expect(screen.queryByTestId('catalogo-cargando')).not.toBeOnTheScreen(),
  );
}

describe('Subir (mobile decision + review screen, design.md Phase 6)', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGetDocumentAsync.mockReset();
    mockPreviewIngesta.mockReset();
    mockCommitIngesta.mockReset();
    mockFetchCatalogo.mockReset();
    mockFetchCatalogo.mockResolvedValue({ ok: true, value: catalogoDto() });
    mockSolicitarRecargaResumen.mockReset();
    mockBack.mockReset();
    announceSpy = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announceSpy.mockRestore();
  });

  it('CU-08/CU-12: exposes an accessible trigger and restricts the picker to .xlsx/.pdf', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoCancelado);

    await render(<Subir />);

    const trigger = screen.getByRole('button', {
      name: /seleccionar archivo/i,
    });
    expect(trigger).toBeOnTheScreen();

    await seleccionarArchivo();

    expect(mockGetDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.arrayContaining([XLSX_MIME, 'application/pdf']),
      }),
    );
  });

  it('canceling the picker leaves the screen idle (no previewIngesta call)', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoCancelado);

    await render(<Subir />);
    await seleccionarArchivo();

    expect(mockPreviewIngesta).not.toHaveBeenCalled();
  });

  it('picking a file calls previewIngesta with the picked asset and shows a loading state', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    const d = deferred<PreviewIngestaResult>();
    mockPreviewIngesta.mockReturnValue(d.promise);

    await render(<Subir />);
    await seleccionarArchivo();

    await waitFor(() => expect(mockPreviewIngesta).toHaveBeenCalledTimes(1));
    const [archivo] = mockPreviewIngesta.mock.calls[0] as [
      { uri: string; name: string },
    ];
    expect(archivo).toEqual(
      expect.objectContaining({
        uri: 'file:///tmp/cartola.xlsx',
        name: 'cartola.xlsx',
      }),
    );
    expect(screen.getByTestId('preview-cargando')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: /seleccionar archivo/i }),
    ).not.toBeOnTheScreen();

    await act(async () => {
      d.resolve(previewExitoso());
      await d.promise;
    });
  });

  it('CA-02: a successful preview renders banco and resumen counts, no row list yet', async () => {
    await seleccionarYPrevisualizar();

    expect(screen.getByText('BancoEstado')).toBeOnTheScreen();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0); // resumen.totalFilas
    expect(screen.queryByTestId(/^preview-fila-/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('revision-lista')).not.toBeOnTheScreen();
  });

  it('MOB-PRV-03: decidiendo renders the resumen counts and all three actions, no row list', async () => {
    const filas = [
      filaPreview({ rowIndex: 0 }),
      filaPreview({ rowIndex: 1, esDuplicado: true }),
      filaPreview({ rowIndex: 2 }),
    ];
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(filas, 3));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );

    expect(screen.getByText('3')).toBeOnTheScreen(); // totalFilas
    expect(screen.getByText('1')).toBeOnTheScreen(); // duplicadosDetectados
    expect(screen.getByText('2')).toBeOnTheScreen(); // nuevas
    expect(
      screen.getByRole('button', { name: 'Subir tal cual' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Revisar y editar' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeOnTheScreen();
    expect(screen.queryByTestId('revision-lista')).not.toBeOnTheScreen();
    expect(screen.queryByTestId(/^revision-fila-/)).not.toBeOnTheScreen();
  });

  it('MOB-PRV-05: "Revisar y editar" shows every filas row via the virtualized list, no page-size selector', async () => {
    const filas = Array.from({ length: 12 }, (_, i) =>
      filaPreview({ rowIndex: i, descripcion: `Movimiento ${i + 1}` }),
    );
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(filas, 12));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );

    await revisarYEditar();

    const lista = screen.getByTestId('revision-lista');
    expect(lista.props.data).toHaveLength(12);
    expect(screen.queryByTestId('preview-selector')).not.toBeOnTheScreen();
    expect(screen.queryByRole('radiogroup')).not.toBeOnTheScreen();
    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
  });

  it('MOB-PRV-06/07: tapping an editable row opens the classification sheet; a duplicate row stays a no-op', async () => {
    const filas = [
      filaPreview({ rowIndex: 0 }),
      filaPreview({ rowIndex: 1, esDuplicado: true }),
    ];
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(filas, 2));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );

    await revisarYEditar();

    expect(screen.getByTestId('revision-lista')).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Subir' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();

    // Duplicate row: still a no-op, no sheet opens (MOB-PRV-06).
    await act(async () => {
      fireEvent.press(screen.getByTestId('revision-fila-1'));
    });
    expect(screen.queryByTestId('hoja-clasificacion')).not.toBeOnTheScreen();

    // Editable row: opens the classification sheet (MOB-PRV-06/07).
    await act(async () => {
      fireEvent.press(screen.getByTestId('revision-fila-0'));
    });
    expect(screen.getByTestId('hoja-clasificacion')).toBeOnTheScreen();
  });

  it('MOB-PRV-06: an Ingreso row (sugerido.bucket === "Ingreso") stays a no-op even when not a duplicate', async () => {
    const filas = [
      filaPreview({
        rowIndex: 0,
        sugerido: { bucket: 'Ingreso', categoriaId: null },
      }),
    ];
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(filas, 1));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    await revisarYEditar();

    await act(async () => {
      fireEvent.press(screen.getByTestId('revision-fila-0'));
    });
    expect(screen.queryByTestId('hoja-clasificacion')).not.toBeOnTheScreen();
  });

  it('MOB-PRV-07: confirming the sheet records the pending edit and the row reflects the chosen categoría', async () => {
    const filas = [filaPreview({ rowIndex: 0 })];
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(filas, 1));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    await revisarYEditar();

    await act(async () => {
      fireEvent.press(screen.getByTestId('revision-fila-0'));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Necesidades' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Arriendo' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('hoja-confirmar'));
    });

    expect(screen.queryByTestId('hoja-clasificacion')).not.toBeOnTheScreen();
    expect(screen.getByText('Arriendo')).toBeOnTheScreen();
  });

  it('CA-03/MOB-PRV-04: "Subir tal cual" calls commitIngesta(archivo, []) and success shows totalTransacciones + duplicadosOmitidos', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({
      ok: true,
      value: commitExitoso({ totalTransacciones: 12, duplicadosOmitidos: 3 }),
    });

    await act(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: 'Subir tal cual' }),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );
    expect(mockCommitIngesta).toHaveBeenCalledTimes(1);
    const [archivo, edits] = mockCommitIngesta.mock.calls[0] as [
      { uri: string; name: string },
      unknown,
    ];
    expect(archivo).toEqual(
      expect.objectContaining({
        uri: 'file:///tmp/cartola.xlsx',
        name: 'cartola.xlsx',
      }),
    );
    // As-is commit — the user never reached the row list, so the overlay is
    // always empty (MOB-PRV-04).
    expect(edits).toEqual([]);
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(mockSolicitarRecargaResumen).toHaveBeenCalledTimes(1);
  });

  it('MOB-PRV-08 (interim): "Subir" from revisando calls commitIngesta(archivo, []) — the edits overlay wiring arrives in PR8b', async () => {
    await seleccionarYPrevisualizar();
    await revisarYEditar();
    mockCommitIngesta.mockResolvedValue({ ok: true, value: commitExitoso() });

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Subir' }));
    });

    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );
    expect(mockCommitIngesta).toHaveBeenCalledWith(expect.anything(), []);
    expect(mockSolicitarRecargaResumen).toHaveBeenCalledTimes(1);
  });

  it('entering revisando fetches the catalog exactly once; a commit failure returning to revisando does not refetch it', async () => {
    await seleccionarYPrevisualizar();
    await revisarYEditar();
    expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);

    mockCommitIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 500 },
    });
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Subir' }));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Error del servidor (código 500).'),
      ).toBeOnTheScreen(),
    );
    expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);
  });

  it('a catalog fetch failure shows a retryable message, keeps the list visible, and disables opening the sheet', async () => {
    await seleccionarYPrevisualizar();
    mockFetchCatalogo.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await revisarYEditar();

    expect(screen.getByTestId('revision-lista')).toBeOnTheScreen();
    expect(screen.getByTestId('catalogo-error')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('revision-fila-0'));
    });
    expect(screen.queryByTestId('hoja-clasificacion')).not.toBeOnTheScreen();

    mockFetchCatalogo.mockResolvedValue({ ok: true, value: catalogoDto() });
    await act(async () => {
      fireEvent.press(screen.getByTestId('catalogo-reintentar'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('catalogo-error')).not.toBeOnTheScreen(),
    );
    expect(mockFetchCatalogo).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.press(screen.getByTestId('revision-fila-0'));
    });
    expect(screen.getByTestId('hoja-clasificacion')).toBeOnTheScreen();
  });

  it('shows a busy "subiendo" indicator while "Subir tal cual" is in-flight and hides the decision actions (no double-submit window)', async () => {
    await seleccionarYPrevisualizar();
    const d = deferred<CommitIngestaResult>();
    mockCommitIngesta.mockReturnValue(d.promise);

    await act(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: 'Subir tal cual' }),
      );
    });

    expect(screen.getByTestId('subir-cargando')).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Subir tal cual' }),
    ).not.toBeOnTheScreen();
    expect(mockCommitIngesta).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve({ ok: true, value: commitExitoso() });
      await d.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );
  });

  it('MOB-PRV-09: "Descartar" from decidiendo returns to idle and never calls commitIngesta', async () => {
    await seleccionarYPrevisualizar();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    });

    expect(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();
    expect(mockCommitIngesta).not.toHaveBeenCalled();
  });

  it('MOB-PRV-09: "Cancelar" from revisando returns to idle and never calls commitIngesta', async () => {
    await seleccionarYPrevisualizar();
    await revisarYEditar();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    });

    expect(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('revision-lista')).not.toBeOnTheScreen();
    expect(mockCommitIngesta).not.toHaveBeenCalled();
  });

  it('after Descartar, picking a new file re-opens the picker and calls previewIngesta again', async () => {
    await seleccionarYPrevisualizar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    });

    await seleccionarArchivo();
    await waitFor(() => expect(mockPreviewIngesta).toHaveBeenCalledTimes(2));
  });

  it('CU-11/PREV-03: a failed preview (400) shows the scrubbed message and allows re-picking (never calls commitIngesta)', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 400, message: 'Banco no reconocido.' },
    });

    await render(<Subir />);
    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByText('Banco no reconocido.')).toBeOnTheScreen(),
    );
    expect(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    ).toBeOnTheScreen();
    expect(mockCommitIngesta).not.toHaveBeenCalled();
  });

  it('a network failure during preview shows a retry message and re-enables the trigger', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Subir />);
    await seleccionarArchivo();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen(),
    );
    expect(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    ).toBeOnTheScreen();
  });

  it('MOB-PRV-10: a commit failure from decidiendo keeps the decision step visible with a retryable error', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 500 },
    });

    await act(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: 'Subir tal cual' }),
      );
    });

    await waitFor(() =>
      expect(
        screen.getByText('Error del servidor (código 500).'),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Subir tal cual' }),
    ).toBeOnTheScreen();
    expect(mockSolicitarRecargaResumen).not.toHaveBeenCalled();
  });

  it('MOB-PRV-10: a commit failure from revisando keeps the row list visible with a retryable error', async () => {
    const filas = [filaPreview({ rowIndex: 0 }), filaPreview({ rowIndex: 1 })];
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(filas, 2));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    await revisarYEditar();

    mockCommitIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 500 },
    });
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Subir' }));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Error del servidor (código 500).'),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('revision-lista')).toBeOnTheScreen();
    expect(screen.getByTestId('revision-lista').props.data).toHaveLength(2);
    expect(mockSolicitarRecargaResumen).not.toHaveBeenCalled();
  });

  it('retrying after a picker failure works once the picker succeeds', async () => {
    mockGetDocumentAsync
      .mockRejectedValueOnce(new Error('picker crashed'))
      .mockResolvedValueOnce(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso());

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(
        screen.getByText(
          'No se pudo abrir el selector de archivos. Intenta de nuevo.',
        ),
      ).toBeOnTheScreen(),
    );

    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
  });

  it('CU-12: locks the ADR-026 ingesta-only write scope — no edit/delete affordance renders anywhere', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({ ok: true, value: commitExitoso() });

    await act(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: 'Subir tal cual' }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );

    // Only the upload trigger and the "Volver al resumen" back affordance
    // are interactive on the settled éxito screen.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText(/editar/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/eliminar/i)).not.toBeOnTheScreen();
  });

  describe('a11y: perceivable state changes (WCAG 2.2 AA SC 4.1.3)', () => {
    it('announces the preview-ready message on entering decidiendo (design.md §10.3)', async () => {
      await seleccionarYPrevisualizar();

      await waitFor(() =>
        expect(announceSpy).toHaveBeenCalledWith(
          'Vista previa lista. Banco BancoEstado, 1 movimientos. Revisa y confirma.',
        ),
      );
    });

    it('announces a non-empty message via AccessibilityInfo on éxito', async () => {
      await seleccionarYPrevisualizar();
      mockCommitIngesta.mockResolvedValue({ ok: true, value: commitExitoso() });

      await act(async () => {
        await fireEvent.press(
          screen.getByRole('button', { name: 'Subir tal cual' }),
        );
      });

      await waitFor(() =>
        expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
      );
      const ultimaLlamada = announceSpy.mock.calls[
        announceSpy.mock.calls.length - 1
      ] as [string];
      expect(ultimaLlamada[0]).toEqual(expect.any(String));
      expect(ultimaLlamada[0].length).toBeGreaterThan(0);
    });

    it('announces a non-empty message via AccessibilityInfo on a preview error', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPreviewIngesta.mockResolvedValue({
        ok: false,
        error: { tag: 'http', status: 400, message: 'Banco no reconocido.' },
      });

      await render(<Subir />);
      await seleccionarArchivo();

      await waitFor(() =>
        expect(announceSpy).toHaveBeenCalledWith('Banco no reconocido.'),
      );
    });

    it('announces a commit failure from decidiendo instead of re-announcing the preview-ready message', async () => {
      await seleccionarYPrevisualizar();
      announceSpy.mockClear();
      mockCommitIngesta.mockResolvedValue({
        ok: false,
        error: { tag: 'http', status: 500 },
      });

      await act(async () => {
        await fireEvent.press(
          screen.getByRole('button', { name: 'Subir tal cual' }),
        );
      });

      await waitFor(() =>
        expect(announceSpy).toHaveBeenCalledWith(
          'Error del servidor (código 500).',
        ),
      );
    });

    it('the decision step container carries a polite live region', async () => {
      await seleccionarYPrevisualizar();

      expect(screen.getByTestId('preview-resultado')).toHaveProp(
        'accessibilityLiveRegion',
        'polite',
      );
    });
  });

  describe('"Volver al resumen" back affordance', () => {
    it('is visible on the éxito view and navigates back when pressed', async () => {
      await seleccionarYPrevisualizar();
      mockCommitIngesta.mockResolvedValue({ ok: true, value: commitExitoso() });

      await act(async () => {
        await fireEvent.press(
          screen.getByRole('button', { name: 'Subir tal cual' }),
        );
      });
      await waitFor(() =>
        expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
      );

      fireEvent.press(
        screen.getByRole('button', { name: /volver al resumen/i }),
      );

      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('is visible on the preview-error view and navigates back when pressed', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPreviewIngesta.mockResolvedValue({
        ok: false,
        error: { tag: 'network' },
      });

      await render(<Subir />);
      await seleccionarArchivo();
      await waitFor(() =>
        expect(
          screen.getByText(
            'Problema de conexión. Revisa tu internet e intenta de nuevo.',
          ),
        ).toBeOnTheScreen(),
      );

      fireEvent.press(
        screen.getByRole('button', { name: /volver al resumen/i }),
      );

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('renders a resumen.totalFilas: 0 preview result without crashing', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso([], 0));

    await render(<Subir />);
    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Subir tal cual' }),
    ).toBeOnTheScreen();
  });

  it('after a successful upload, "Seleccionar archivo" re-enters the preview flow for a NEW file (no dead-end)', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({ ok: true, value: commitExitoso() });

    await act(async () => {
      await fireEvent.press(
        screen.getByRole('button', { name: 'Subir tal cual' }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );

    const otroArchivo = resultadoPicker({
      uri: 'file:///tmp/otra-cartola.xlsx',
      name: 'otra-cartola.xlsx',
    });
    const otroPreview = previewExitoso([
      filaPreview({ descripcion: 'Otro movimiento' }),
    ]);
    mockGetDocumentAsync.mockResolvedValue(otroArchivo);
    mockPreviewIngesta.mockResolvedValue(otroPreview);

    await seleccionarArchivo();

    await waitFor(() => expect(mockPreviewIngesta).toHaveBeenCalledTimes(2));
    const [archivo] = mockPreviewIngesta.mock.calls[1] as [
      { uri: string; name: string },
    ];
    expect(archivo).toEqual(
      expect.objectContaining({
        uri: 'file:///tmp/otra-cartola.xlsx',
        name: 'otra-cartola.xlsx',
      }),
    );
    expect(screen.queryByTestId('subir-resultado')).not.toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
  });

  it('retrying after a previewIngesta network failure recovers once the retry succeeds', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'network' },
    });

    await render(<Subir />);
    await seleccionarArchivo();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Problema de conexión. Revisa tu internet e intenta de nuevo.',
        ),
      ).toBeOnTheScreen(),
    );
    expect(mockCommitIngesta).not.toHaveBeenCalled();

    mockPreviewIngesta.mockResolvedValueOnce(previewExitoso());
    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    expect(mockPreviewIngesta).toHaveBeenCalledTimes(2);
  });

  it('retrying after a previewIngesta 400 failure recovers once the retry succeeds', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 400, message: 'Banco no reconocido.' },
    });

    await render(<Subir />);
    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByText('Banco no reconocido.')).toBeOnTheScreen(),
    );
    expect(mockCommitIngesta).not.toHaveBeenCalled();

    mockPreviewIngesta.mockResolvedValueOnce(previewExitoso());
    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    expect(mockPreviewIngesta).toHaveBeenCalledTimes(2);
  });
});
