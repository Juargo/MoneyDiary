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

// RED-first (US-003 Slice 3, design.md §10.1/§10.3): greenfield two-phase
// preview-then-confirm state machine. The document picker and both
// transport layers (`previewIngesta`, `commitIngesta` — both already GREEN)
// are mocked at the module boundary so only this screen's own `useState`
// machine + wiring is under test, mirroring the pre-US-003 spec's style.
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

describe('Subir (mobile two-phase preview screen, US-003 Slice 3)', () => {
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

  it('CA-02: a successful preview renders banco, total, and the sample rows formatted as CLP', async () => {
    await seleccionarYPrevisualizar();

    expect(screen.getByText('BancoEstado')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen(); // totalFilasDatos
    expect(screen.getByText('Compra supermercado')).toBeOnTheScreen();
    expect(screen.getByText(/\$5\.000/)).toBeOnTheScreen();
    expect(screen.getByText('2026-07-01')).toBeOnTheScreen();
  });

  it('MOB-PRV-05: shows every filas row with no 10/25/50 row-count selector', async () => {
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

    expect(screen.getAllByTestId(/^preview-fila-/)).toHaveLength(12);
    expect(screen.queryByTestId('preview-selector')).not.toBeOnTheScreen();
    expect(screen.queryByRole('radiogroup')).not.toBeOnTheScreen();
    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
  });

  it('CA-03/MOB-PRV-04: Confirmar calls commitIngesta(archivo, []) and success shows totalTransacciones + duplicadosOmitidos', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({
      ok: true,
      value: commitExitoso({ totalTransacciones: 12, duplicadosOmitidos: 3 }),
    });

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
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

  it('shows a busy "subiendo" indicator while Confirmar is in-flight', async () => {
    await seleccionarYPrevisualizar();
    const d = deferred<CommitIngestaResult>();
    mockCommitIngesta.mockReturnValue(d.promise);

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
    });

    expect(screen.getByTestId('subir-cargando')).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();

    await act(async () => {
      d.resolve({ ok: true, value: commitExitoso() });
      await d.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );
  });

  it('CA-04/CU-12: Cancelar returns to idle and never calls commitIngesta', async () => {
    await seleccionarYPrevisualizar();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /cancelar/i }));
    });

    expect(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();
    expect(mockCommitIngesta).not.toHaveBeenCalled();
  });

  it('after Cancelar, picking a new file re-opens the picker and calls previewIngesta again', async () => {
    await seleccionarYPrevisualizar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /cancelar/i }));
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

  it('a backend error on Confirmar returns to a retryable error state (never stuck "subiendo")', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 500 },
    });

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
    });

    await waitFor(() =>
      expect(
        screen.getByText('Error del servidor (código 500).'),
      ).toBeOnTheScreen(),
    );
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
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
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
    it('announces the preview-ready message on entering preview (design.md §10.3)', async () => {
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
          screen.getByRole('button', { name: /confirmar/i }),
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

    it('the sample list container carries a polite live region', async () => {
      await seleccionarYPrevisualizar();

      expect(screen.getByTestId('preview-lista')).toHaveProp(
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
          screen.getByRole('button', { name: /confirmar/i }),
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
    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.queryAllByTestId(/^preview-fila-/)).toHaveLength(0);
  });

  it('after a successful upload, "Seleccionar archivo" re-enters the preview flow for a NEW file (no dead-end)', async () => {
    await seleccionarYPrevisualizar();
    mockCommitIngesta.mockResolvedValue({ ok: true, value: commitExitoso() });

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
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
    expect(screen.getByText('Otro movimiento')).toBeOnTheScreen();
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
