import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { PostIngestaResult } from '../src/api/post-ingesta';

// RED-first (B.5, upload-cartola-ui Slice 2b, design.md Decision 5): the
// document picker and the transport layer (`postIngesta`, B.3/B.4 — already
// GREEN) are mocked at the module boundary so only THIS screen's own
// `useState` machine + wiring is under test — mirrors `app/index.spec.tsx`'s
// `fetchResumen` mocking style. `resumen-refresh` is the shared trigger this
// screen uses to ask `app/index.tsx` to re-fetch (no TanStack Query on
// mobile, no cross-route prop drilling — expo-router routes don't receive
// props from a parent route).
const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockPostIngesta = jest.fn<Promise<PostIngestaResult>, [unknown]>();
jest.mock('../src/api/post-ingesta', () => ({
  postIngesta: (asset: unknown) => mockPostIngesta(asset),
}));

const mockSolicitarRecargaResumen = jest.fn();
jest.mock('../src/api/resumen-refresh', () => ({
  solicitarRecargaResumen: () => mockSolicitarRecargaResumen(),
}));

// "Volver al resumen" back affordance (review SHOULD-fix #5): the screen
// navigates via expo-router's `useRouter().back`, mocked at the module
// boundary — no real Router context is mounted in this unit test (mirrors
// `app/index.spec.tsx`'s `useRouter` mock).
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

// Import after jest.mock is registered.
import Subir from './subir';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function resultadoPicker(
  overrides: Partial<{ uri: string; name: string; mimeType: string; size: number }> = {},
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

const ingestaExitosa = {
  ingestaId: 'ing-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '123456789',
  archivo: { nombre: 'cartola.xlsx', extension: 'xlsx', tamanoBytes: 20480 },
  totalTransacciones: 12,
  transacciones: [],
};

// Deferred promise so the "subiendo" state is observable before resolution
// (mirrors `app/index.spec.tsx`'s `deferred` helper).
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function seleccionarYConfirmar() {
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: /seleccionar archivo/i }));
  });
}

describe('Subir (mobile upload screen)', () => {
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGetDocumentAsync.mockReset();
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

    const trigger = screen.getByRole('button', { name: /seleccionar archivo/i });
    expect(trigger).toBeOnTheScreen();

    await seleccionarYConfirmar();

    expect(mockGetDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.arrayContaining([XLSX_MIME, 'application/pdf']),
      }),
    );
  });

  it('canceling the picker leaves the screen idle (no postIngesta call)', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoCancelado);

    await render(<Subir />);
    await seleccionarYConfirmar();

    expect(mockPostIngesta).not.toHaveBeenCalled();
  });

  it('CU-09: confirming enters "subiendo" (disables the trigger); a 7 MB file proceeds — no client-side size cap', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker({ size: 7 * 1024 * 1024 }));
    const d = deferred<PostIngestaResult>();
    mockPostIngesta.mockReturnValue(d.promise);

    await render(<Subir />);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: /seleccionar archivo/i }));
    });

    await waitFor(() => expect(mockPostIngesta).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /seleccionar archivo/i })).toBeDisabled();

    await act(async () => {
      d.resolve({ ok: true, value: ingestaExitosa });
      await d.promise;
    });
    await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());
  });

  it('CU-10: on success shows banco/cuenta/totalTransacciones and triggers the resumen re-fetch', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

    await render(<Subir />);
    await seleccionarYConfirmar();

    await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());
    expect(screen.getByText('123456789')).toBeOnTheScreen();
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(mockSolicitarRecargaResumen).toHaveBeenCalledTimes(1);
  });

  it('CU-11: a backend validation error returns to a retryable error state (never stuck "subiendo")', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPostIngesta.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 400, message: 'Banco no reconocido.' },
    });

    await render(<Subir />);
    await seleccionarYConfirmar();

    await waitFor(() => expect(screen.getByText('Banco no reconocido.')).toBeOnTheScreen());
    expect(screen.getByRole('button', { name: /seleccionar archivo/i })).not.toBeDisabled();
    expect(mockSolicitarRecargaResumen).not.toHaveBeenCalled();
  });

  it('CU-11: a network failure shows a retry message and re-enables the trigger', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPostIngesta.mockResolvedValue({ ok: false, error: { tag: 'network' } });

    await render(<Subir />);
    await seleccionarYConfirmar();

    await waitFor(() =>
      expect(
        screen.getByText('Problema de conexión. Revisa tu internet e intenta de nuevo.'),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByRole('button', { name: /seleccionar archivo/i })).not.toBeDisabled();
  });

  it('retrying after an error calls postIngesta again on the next confirm', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPostIngesta
      .mockResolvedValueOnce({ ok: false, error: { tag: 'network' } })
      .mockResolvedValueOnce({ ok: true, value: ingestaExitosa });

    await render(<Subir />);
    await seleccionarYConfirmar();
    await waitFor(() =>
      expect(
        screen.getByText('Problema de conexión. Revisa tu internet e intenta de nuevo.'),
      ).toBeOnTheScreen(),
    );

    await seleccionarYConfirmar();

    await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());
    expect(mockPostIngesta).toHaveBeenCalledTimes(2);
  });

  it('CU-12: locks the ADR-026 ingesta-only write scope — no edit/delete affordance renders anywhere', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

    await render(<Subir />);
    await seleccionarYConfirmar();
    await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());

    // Only the upload trigger and the "Volver al resumen" back affordance
    // (review SHOULD-fix #5) are interactive — no edit/delete control ever
    // renders on this screen.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText(/editar/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/eliminar/i)).not.toBeOnTheScreen();
  });

  describe('a11y: perceivable state changes (review CRITICAL fix #3, WCAG 2.2 AA SC 4.1.3)', () => {
    it('exposes accessibilityState.busy on the trigger while "subiendo"', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      const d = deferred<PostIngestaResult>();
      mockPostIngesta.mockReturnValue(d.promise);

      await render(<Subir />);
      const trigger = screen.getByRole('button', { name: /seleccionar archivo/i });
      expect(trigger).toHaveProp('accessibilityState', expect.objectContaining({ busy: false }));

      await act(async () => {
        await fireEvent.press(trigger);
      });

      expect(screen.getByRole('button', { name: /seleccionar archivo/i })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ busy: true }),
      );

      await act(async () => {
        d.resolve({ ok: true, value: ingestaExitosa });
        await d.promise;
      });
      expect(screen.getByRole('button', { name: /seleccionar archivo/i })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ busy: false }),
      );
    });

    it('announces a non-empty message via AccessibilityInfo on success', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

      await render(<Subir />);
      await seleccionarYConfirmar();

      await waitFor(() => expect(announceSpy).toHaveBeenCalled());
      const [mensaje] = announceSpy.mock.calls[0] as [string];
      expect(mensaje).toEqual(expect.any(String));
      expect(mensaje.length).toBeGreaterThan(0);
    });

    it('announces a non-empty message via AccessibilityInfo on error', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({
        ok: false,
        error: { tag: 'http', status: 400, message: 'Banco no reconocido.' },
      });

      await render(<Subir />);
      await seleccionarYConfirmar();

      await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('Banco no reconocido.'));
    });
  });

  describe('CU-11: DocumentPicker.getDocumentAsync failures never leave the screen stuck (review WARNING fix #4)', () => {
    it('shows a retryable error message when the picker itself throws', async () => {
      mockGetDocumentAsync.mockRejectedValue(new Error('picker crashed'));

      await render(<Subir />);
      await seleccionarYConfirmar();

      await waitFor(() =>
        expect(
          screen.getByText('No se pudo abrir el selector de archivos. Intenta de nuevo.'),
        ).toBeOnTheScreen(),
      );
      expect(screen.getByRole('button', { name: /seleccionar archivo/i })).not.toBeDisabled();
      expect(mockPostIngesta).not.toHaveBeenCalled();
    });

    it('retrying after a picker failure works once the picker succeeds', async () => {
      mockGetDocumentAsync
        .mockRejectedValueOnce(new Error('picker crashed'))
        .mockResolvedValueOnce(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

      await render(<Subir />);
      await seleccionarYConfirmar();
      await waitFor(() =>
        expect(
          screen.getByText('No se pudo abrir el selector de archivos. Intenta de nuevo.'),
        ).toBeOnTheScreen(),
      );

      await seleccionarYConfirmar();

      await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());
    });
  });

  describe('"Volver al resumen" back affordance (review SHOULD-fix #5)', () => {
    it('is visible on the éxito view and navigates back when pressed', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: true, value: ingestaExitosa });

      await render(<Subir />);
      await seleccionarYConfirmar();
      await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());

      const volver = screen.getByRole('button', { name: /volver al resumen/i });
      expect(volver).toBeOnTheScreen();

      fireEvent.press(volver);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('is visible on the error view and navigates back when pressed', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: false, error: { tag: 'network' } });

      await render(<Subir />);
      await seleccionarYConfirmar();
      await waitFor(() =>
        expect(
          screen.getByText('Problema de conexión. Revisa tu internet e intenta de nuevo.'),
        ).toBeOnTheScreen(),
      );

      const volver = screen.getByRole('button', { name: /volver al resumen/i });
      fireEvent.press(volver);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('mensajeDeError branch coverage (review suggestion #6)', () => {
    it('shows the unauthorized message', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: false, error: { tag: 'unauthorized' } });

      await render(<Subir />);
      await seleccionarYConfirmar();

      await waitFor(() =>
        expect(
          screen.getByText('No se pudo verificar el acceso. Intenta de nuevo más tarde.'),
        ).toBeOnTheScreen(),
      );
    });

    it('shows the parse-error message', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: false, error: { tag: 'parse' } });

      await render(<Subir />);
      await seleccionarYConfirmar();

      await waitFor(() =>
        expect(screen.getByText('Respuesta inesperada del servidor.')).toBeOnTheScreen(),
      );
    });

    it('shows a generic http message when the backend sends no message', async () => {
      mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
      mockPostIngesta.mockResolvedValue({ ok: false, error: { tag: 'http', status: 500 } });

      await render(<Subir />);
      await seleccionarYConfirmar();

      await waitFor(() =>
        expect(screen.getByText('Error del servidor (código 500).')).toBeOnTheScreen(),
      );
    });
  });

  it('renders a totalTransacciones: 0 success result without crashing', async () => {
    mockGetDocumentAsync.mockResolvedValue(resultadoPicker());
    mockPostIngesta.mockResolvedValue({
      ok: true,
      value: { ...ingestaExitosa, totalTransacciones: 0 },
    });

    await render(<Subir />);
    await seleccionarYConfirmar();

    await waitFor(() => expect(screen.getByText('BancoEstado')).toBeOnTheScreen());
    expect(screen.getByText('0')).toBeOnTheScreen();
  });
});
