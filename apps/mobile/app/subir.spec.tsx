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

// Import after jest.mock is registered.
import Subir from './subir';

// RED-first (US-003 Slice 3 → Phase 6, design.md Data Flow): the screen now
// evolves the two-phase preview into an explicit decision step —
// `decidiendo` (resumen + "Subir tal cual"/"Revisar y editar"/"Descartar",
// MOB-PRV-03) — and, when the user chooses to review, a read-only
// `revisando` row list (MOB-PRV-05/06) with no classification sheet yet
// (Phase 7/8). The document picker and both transport layers
// (`previewIngesta`, `commitIngesta`) are mocked at the module boundary so
// only this screen's own state machine + wiring is under test.
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
}

describe('Subir (mobile decision + review screen, design.md Phase 6)', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGetDocumentAsync.mockReset();
    mockPreviewIngesta.mockReset();
    mockCommitIngesta.mockReset();
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

  it('MOB-PRV-05/06/09: "Revisar y editar" opens a read-only revisando step — row taps are a no-op and Subir/Cancelar are present', async () => {
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

    // Read-only in this PR: tapping an editable row is a no-op — no sheet
    // exists yet (Phase 7/8, design.md D-06).
    fireEvent.press(screen.getByTestId('revision-fila-0'));
    expect(screen.queryByRole('dialog')).not.toBeOnTheScreen();

    expect(screen.getByRole('button', { name: 'Subir' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
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

  it('MOB-PRV-08 (interim): "Subir" from revisando calls commitIngesta(archivo, []) — the edits overlay wiring arrives in Phase 8', async () => {
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
