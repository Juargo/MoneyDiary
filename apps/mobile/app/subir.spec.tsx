import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { PostIngestaResult } from '../src/api/post-ingesta';
import type { PreviewIngestaResult } from '../src/api/preview-ingesta';

// Import after jest.mock is registered.
import Subir from './subir';

// RED-first (US-003 Slice 3, design.md §10.1/§10.3): greenfield two-phase
// preview-then-confirm state machine. The document picker and both
// transport layers (`previewIngesta`, `postIngesta` — both already GREEN)
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

const mockPostIngesta = jest.fn<Promise<PostIngestaResult>, [unknown]>();
jest.mock('../src/api/post-ingesta', () => ({
  postIngesta: (asset: unknown) => mockPostIngesta(asset),
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

function filaPreview(overrides: Partial<Record<string, string>> = {}) {
  return {
    fecha: '2026-07-01T00:00:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    ...overrides,
  };
}

function previewExitoso(
  muestra = [filaPreview()],
  totalFilasDatos = muestra.length,
) {
  return {
    ok: true as const,
    value: {
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '123456789',
      estructura: { totalFilasDatos },
      muestra,
    },
  };
}

const ingestaExitosa = {
  ingestaId: 'ing-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '123456789',
  archivo: { nombre: 'cartola.xlsx', extension: 'xlsx', tamanoBytes: 20480 },
  totalTransacciones: 12,
  transacciones: [],
};

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
    mockPostIngesta.mockReset();
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

  it('CA-01: exposes a 10/25/50 selector with 10 selected by default', async () => {
    await seleccionarYPrevisualizar();

    const opcion10 = screen.getByRole('radio', { name: /mostrar 10 filas/i });
    const opcion25 = screen.getByRole('radio', { name: /mostrar 25 filas/i });
    const opcion50 = screen.getByRole('radio', { name: /mostrar 50 filas/i });

    expect(opcion10).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    expect(opcion25).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
    expect(opcion50).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
  });

  it('PREV-06/CA-01: changing the selector re-slices the same in-memory muestra with no new HTTP call', async () => {
    const muestra = Array.from({ length: 50 }, (_, i) =>
      filaPreview({ descripcion: `Movimiento ${i + 1}` }),
    );
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(muestra, 50));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );

    expect(screen.getAllByTestId(/^preview-fila-/)).toHaveLength(10);

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: /mostrar 25 filas/i }));
    });
    expect(screen.getAllByTestId(/^preview-fila-/)).toHaveLength(25);

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: /mostrar 50 filas/i }));
    });
    expect(screen.getAllByTestId(/^preview-fila-/)).toHaveLength(50);

    expect(mockPreviewIngesta).toHaveBeenCalledTimes(1);
  });

  it('PREV-06 boundary: selecting 25 on a 12-row sample shows all 12 rows, no padding or error', async () => {
    const muestra = Array.from({ length: 12 }, (_, i) =>
      filaPreview({ descripcion: `Movimiento ${i + 1}` }),
    );
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPreviewIngesta.mockResolvedValue(previewExitoso(muestra, 12));

    await render(<Subir />);
    await seleccionarArchivo();
    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: /mostrar 25 filas/i }));
    });

    expect(screen.getAllByTestId(/^preview-fila-/)).toHaveLength(12);
  });

  it('CA-03: Confirmar re-uploads the same held file asset via postIngesta and shows the final summary', async () => {
    await seleccionarYPrevisualizar();
    mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
    });

    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );
    expect(mockPostIngesta).toHaveBeenCalledTimes(1);
    const [archivo] = mockPostIngesta.mock.calls[0] as [
      { uri: string; name: string },
    ];
    expect(archivo).toEqual(
      expect.objectContaining({
        uri: 'file:///tmp/cartola.xlsx',
        name: 'cartola.xlsx',
      }),
    );
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(mockSolicitarRecargaResumen).toHaveBeenCalledTimes(1);
  });

  it('shows a busy "subiendo" indicator while Confirmar is in-flight', async () => {
    await seleccionarYPrevisualizar();
    const d = deferred<PostIngestaResult>();
    mockPostIngesta.mockReturnValue(d.promise);

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /confirmar/i }));
    });

    expect(screen.getByTestId('subir-cargando')).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();

    await act(async () => {
      d.resolve({ ok: true, value: ingestaExitosa });
      await d.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId('subir-resultado')).toBeOnTheScreen(),
    );
  });

  it('CA-04/CU-12: Cancelar returns to idle and never calls postIngesta', async () => {
    await seleccionarYPrevisualizar();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /cancelar/i }));
    });

    expect(
      screen.getByRole('button', { name: /seleccionar archivo/i }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('preview-resultado')).not.toBeOnTheScreen();
    expect(mockPostIngesta).not.toHaveBeenCalled();
  });

  it('after Cancelar, picking a new file re-opens the picker and calls previewIngesta again', async () => {
    await seleccionarYPrevisualizar();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /cancelar/i }));
    });

    await seleccionarArchivo();
    await waitFor(() => expect(mockPreviewIngesta).toHaveBeenCalledTimes(2));
  });

  it('CU-11/PREV-03: a failed preview (400) shows the scrubbed message and allows re-picking (never calls postIngesta)', async () => {
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
    expect(mockPostIngesta).not.toHaveBeenCalled();
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
    mockPostIngesta.mockResolvedValue({
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
    mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

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
      mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

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

    it('the preview-selector radiogroup exposes radio children with accessibilityState.checked', async () => {
      await seleccionarYPrevisualizar();

      expect(screen.getByTestId('preview-selector')).toHaveProp(
        'accessibilityRole',
        'radiogroup',
      );

      await act(async () => {
        fireEvent.press(
          screen.getByRole('radio', { name: /mostrar 25 filas/i }),
        );
      });

      expect(
        screen.getByRole('radio', { name: /mostrar 25 filas/i }),
      ).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: true }),
      );
      expect(
        screen.getByRole('radio', { name: /mostrar 10 filas/i }),
      ).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: false }),
      );
      expect(
        screen.getByRole('radio', { name: /mostrar 50 filas/i }),
      ).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: false }),
      );
    });
  });

  describe('"Volver al resumen" back affordance', () => {
    it('is visible on the éxito view and navigates back when pressed', async () => {
      await seleccionarYPrevisualizar();
      mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

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

  it('renders a totalFilasDatos: 0 preview result without crashing', async () => {
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
    mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

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
    // cantidad resets to the default (10) for the new preview.
    expect(screen.getByRole('radio', { name: /mostrar 10 filas/i })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
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
    expect(mockPostIngesta).not.toHaveBeenCalled();

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
    expect(mockPostIngesta).not.toHaveBeenCalled();

    mockPreviewIngesta.mockResolvedValueOnce(previewExitoso());
    await seleccionarArchivo();

    await waitFor(() =>
      expect(screen.getByTestId('preview-resultado')).toBeOnTheScreen(),
    );
    expect(mockPreviewIngesta).toHaveBeenCalledTimes(2);
  });
});
