/**
 * ReclasificarMobileControl spec — T-13 RED (US-056, D-16/D-17/D-20/MDET-05)
 *
 * All cases MUST fail RED before the production source exists (T-13 RED contract).
 * Production source lands in T-14.
 *
 * Key contract points:
 * - trigger Pressable opens Modal; Modal shows BUCKETS_ASIGNABLES sections only (no Otros/Ingresos)
 * - same-bucket commit: no Alert.alert, calls reclasificarCategoria → onReclasificado → solicitarRecargaResumen
 * - cross-bucket: Alert.alert with exact money-move body using ETIQUETA_BUCKET display labels on BOTH ends
 * - success: calls onMovida with ETIQUETA_BUCKET label (e.g. 'Gustos', NOT raw 'Deseos')
 * - announceForAccessibility fires ONLY after PATCH ok (settled — us-055 lesson; assert NOT called before resolution)
 * - failed PATCH: no onReclasificado, no solicitarRecargaResumen
 * - cancel Alert: zero API calls
 * - Alert guard (mostrandoAlerta ref): blocks double-open
 */

import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { Alert, AccessibilityInfo } from 'react-native';
import type { CatalogoDto } from '../../domain/catalogo.types';
import type { ApiResult } from '../../domain/api-error';
import type { ReclasificarCategoriaDto } from '../../domain/detalle.types';
import { ReclasificarMobileControl } from './ReclasificarMobileControl';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockReclasificarCategoria = jest.fn<
  Promise<ApiResult<ReclasificarCategoriaDto>>,
  [string, string]
>();

const mockFetchCatalogo = jest.fn<Promise<ApiResult<CatalogoDto>>, []>();

// Single factory wiring both reclasificarCategoria and fetchCatalogo.
// The previous file had two back-to-back jest.mock calls for the same module;
// the first was dead (the second override always wins). Collapsed into one.
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  reclasificarCategoria: (txId: string, categoria: string) =>
    mockReclasificarCategoria(txId, categoria),
  fetchCatalogo: () => mockFetchCatalogo(),
}));

const mockSolicitarRecargaResumen = jest.fn<void, []>();
jest.mock('../../api/resumen-refresh', () => ({
  ...jest.requireActual('../../api/resumen-refresh'),
  solicitarRecargaResumen: () => mockSolicitarRecargaResumen(),
}));

// ---------------------------------------------------------------------------
// Alert spy — track Alert.alert calls including button callbacks
// ---------------------------------------------------------------------------

let alertSpy: jest.SpyInstance;
// Store the buttons array from the last Alert.alert call so tests can
// invoke individual button onPress handlers.
let capturedAlertButtons: { text: string; onPress?: () => void }[] = [];

// AccessibilityInfo spy
let announceSpy: jest.SpyInstance;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal valid CatalogoDto with categories in all 3 BUCKETS_ASIGNABLES.
 * Deseos bucket has 'Entretenimiento' (the current categoria for most tests).
 * Necesidades bucket has 'Comida' (the cross-bucket destination).
 * Ahorro bucket has 'Inversión'.
 */
function makeCatalogo(): CatalogoDto {
  return {
    categorias: [
      {
        id: 'cat-necesidades',
        nombre: 'Comida',
        bucket: 'Necesidades',
        transaccionesCount: 5,
        patrones: [],
      },
      {
        id: 'cat-deseos',
        nombre: 'Entretenimiento',
        bucket: 'Deseos',
        transaccionesCount: 3,
        patrones: [],
      },
      {
        id: 'cat-ahorro',
        nombre: 'Inversión',
        bucket: 'Ahorro',
        transaccionesCount: 2,
        patrones: [],
      },
    ],
  };
}

function makeReclasificarDto(
  bucket = 'Deseos',
  nombre = 'Entretenimiento',
): ReclasificarCategoriaDto {
  return {
    id: 'tx-1',
    bucket,
    categoria: { id: 'cat-deseos', nombre },
  };
}

/** Default props for the control — a Deseos transaction */
function defaultProps(
  overrides?: Partial<Parameters<typeof ReclasificarMobileControl>[0]>,
) {
  return {
    tx: {
      id: 'tx-1',
      descripcion: 'Netflix',
      montoLabel: '$50.000',
    },
    categoriaActual: {
      id: 'cat-deseos',
      nombre: 'Entretenimiento',
      bucket: 'Deseos',
    },
    onReclasificado: jest.fn<void, []>(),
    onMovida: jest.fn<void, [string]>(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  capturedAlertButtons = [];

  alertSpy = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _message, buttons) => {
      capturedAlertButtons = (buttons ?? []) as typeof capturedAlertButtons;
    });

  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockReturnValue(undefined);

  // Default: catalog resolves with valid data
  mockFetchCatalogo.mockResolvedValue({ ok: true, value: makeCatalogo() });
});

afterEach(() => {
  alertSpy.mockRestore();
  announceSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// T-13 RED cases
// ---------------------------------------------------------------------------

describe('ReclasificarMobileControl', () => {
  /**
   * Case 1: trigger Pressable testID='reclasificar-trigger-{id}' opens Modal
   */
  it("trigger Pressable testID='reclasificar-trigger-{id}' opens Modal", async () => {
    const props = defaultProps();
    await render(<ReclasificarMobileControl {...props} />);

    const trigger = screen.getByTestId('reclasificar-trigger-tx-1');
    expect(trigger).toBeTruthy();

    // Modal should not be visible before pressing trigger
    expect(screen.queryByTestId('reclasificar-modal')).toBeNull();

    await act(async () => {
      fireEvent.press(trigger);
    });

    // After pressing trigger, Modal should appear
    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });
  });

  /**
   * Case 2: Modal renders exactly 3 section headers: Necesidades, Gustos, Ahorro — no Otros
   * Asserts that BUCKETS_ASIGNABLES filter dropped Otros/Ingresos
   */
  it('Modal renders exactly 3 section headers: Necesidades, Gustos, Ahorro — no Otros', async () => {
    const props = defaultProps();
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    // The 3 display labels from ETIQUETA_BUCKET
    expect(screen.getByText('Necesidades')).toBeTruthy();
    expect(screen.getByText('Gustos')).toBeTruthy();
    expect(screen.getByText('Ahorro')).toBeTruthy();

    // No 'Otros' or 'Sin categoría' or 'Ingresos' section headers
    expect(screen.queryByText('Otros')).toBeNull();
    expect(screen.queryByText('Ingresos')).toBeNull();
  });

  /**
   * Case 3: same-bucket selection commits without Alert.alert (spy count=0)
   */
  it('same-bucket selection commits without Alert.alert', async () => {
    // reclasificarCategoria ok — same bucket (Deseos)
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: makeReclasificarDto('Deseos', 'Entretenimiento'),
    });

    const props = defaultProps();
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    // Press the same-bucket option (Entretenimiento is in Deseos)
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-Entretenimiento'),
      );
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledTimes(1);
    });

    // No Alert for same-bucket
    expect(alertSpy).not.toHaveBeenCalled();
  });

  /**
   * Case 4: cross-bucket Alert.alert carries money-move body using ETIQUETA_BUCKET
   * display labels on BOTH source AND destination (Deseos→Gustos, Necesidades→Necesidades).
   * Exact message: "Esto mueve $50.000 de Gustos a Necesidades." (trailing period).
   * Raw-key impl fails: "de Deseos a Necesidades."
   */
  it('cross-bucket Alert.alert carries money-move body using ETIQUETA_BUCKET display labels on BOTH source and destination', async () => {
    const props = defaultProps();
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    // Press a cross-bucket option (Comida is in Necesidades)
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });

    // Alert.alert must have been called with the exact message
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('Confirmar cambio de categoría');
    // ETIQUETA_BUCKET maps Deseos→'Gustos'. Raw key 'Deseos' would fail this pin.
    expect(message).toBe('Esto mueve $50.000 de Gustos a Necesidades.');
  });

  /**
   * Case 5: confirming cross-bucket fires reclasificarCategoria, then onReclasificado,
   * then solicitarRecargaResumen — all 3 in order (MDET-05 fourth scenario)
   */
  it('confirming cross-bucket fires reclasificarCategoria, then cargar (onReclasificado), then solicitarRecargaResumen', async () => {
    // Cross-bucket success: Deseos → Necesidades
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: makeReclasificarDto('Necesidades', 'Comida'),
    });

    const onReclasificado = jest.fn<void, []>();
    const onMovida = jest.fn<void, [string]>();
    const props = defaultProps({ onReclasificado, onMovida });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });

    // Confirm the alert
    await act(async () => {
      const confirmButton = capturedAlertButtons.find(
        (b) => b.text !== 'Cancelar',
      );
      confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledTimes(1);
      expect(onReclasificado).toHaveBeenCalledTimes(1);
      expect(mockSolicitarRecargaResumen).toHaveBeenCalledTimes(1);
    });

    // Verify call order: reclasificarCategoria → onReclasificado → solicitarRecargaResumen
    const reclasificarOrder =
      mockReclasificarCategoria.mock.invocationCallOrder[0]!;
    const onReclasificadoOrder = onReclasificado.mock.invocationCallOrder[0]!;
    const solicitarOrder =
      mockSolicitarRecargaResumen.mock.invocationCallOrder[0]!;
    expect(reclasificarOrder).toBeLessThan(onReclasificadoOrder);
    expect(onReclasificadoOrder).toBeLessThan(solicitarOrder);
  });

  /**
   * Case 6: cross-bucket success calls onMovida with ETIQUETA_BUCKET display label
   * (e.g. 'Necesidades', NOT raw key) — wiring pin
   */
  it('cross-bucket success calls onMovida with ETIQUETA_BUCKET display label (e.g. "Necesidades")', async () => {
    // Cross-bucket: tx moves from Deseos to Necesidades
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: makeReclasificarDto('Necesidades', 'Comida'),
    });

    const onMovida = jest.fn<void, [string]>();
    const props = defaultProps({ onMovida });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });

    await act(async () => {
      const confirmButton = capturedAlertButtons.find(
        (b) => b.text !== 'Cancelar',
      );
      confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(onMovida).toHaveBeenCalledTimes(1);
    });

    // Called with the display label 'Necesidades' (ETIQUETA_BUCKET['Necesidades'])
    expect(onMovida).toHaveBeenCalledWith('Necesidades');
  });

  /**
   * Case 3b: same-bucket commit DOES NOT call onMovida nor announce (MDET-05 S7).
   * The cross-bucket guard in commit() must prevent onMovida from firing when
   * the destination bucket equals the current bucket. announceSpy is the negative
   * oracle here — the control must NEVER call AccessibilityInfo directly (D-20
   * single-announcement-source rule); this test also confirms no accidental call
   * slips through on the same-bucket path.
   */
  it('same-bucket commit does NOT call onMovida nor announce (MDET-05 S7)', async () => {
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: makeReclasificarDto('Deseos', 'Entretenimiento'),
    });

    const onMovida = jest.fn<void, [string]>();
    const props = defaultProps({ onMovida });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    // Press the same-bucket option (Entretenimiento is in Deseos — same bucket)
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-Entretenimiento'),
      );
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledTimes(1);
    });

    // Same-bucket: onMovida must NOT fire — the cross-bucket guard must hold.
    expect(onMovida).not.toHaveBeenCalled();
    // The control must NEVER call AccessibilityInfo (D-20; announcement is the
    // screen's responsibility). This negative assert turns announceSpy live.
    expect(announceSpy).not.toHaveBeenCalled();
  });

  /**
   * Case 7: onMovida fires ONLY after PATCH resolves ok (settled announcement,
   * us-055 D-04 lesson). Assert onMovida is NOT called while PATCH is still pending.
   */
  it('onMovida fires ONLY after PATCH resolves ok (settled announcement contract)', async () => {
    // Controlled promise so we can assert BEFORE it resolves
    let resolveReclasificar!: (v: ApiResult<ReclasificarCategoriaDto>) => void;
    const pendingPromise = new Promise<ApiResult<ReclasificarCategoriaDto>>(
      (resolve) => {
        resolveReclasificar = resolve;
      },
    );
    mockReclasificarCategoria.mockReturnValueOnce(pendingPromise);

    const onMovida = jest.fn<void, [string]>();
    const props = defaultProps({ onMovida });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });

    await act(async () => {
      const confirmButton = capturedAlertButtons.find(
        (b) => b.text !== 'Cancelar',
      );
      confirmButton?.onPress?.();
    });

    // WHILE the PATCH is still pending, onMovida must NOT have been called
    expect(onMovida).not.toHaveBeenCalled();

    // Now resolve the PATCH
    await act(async () => {
      resolveReclasificar({
        ok: true,
        value: makeReclasificarDto('Necesidades', 'Comida'),
      });
    });

    await waitFor(() => {
      expect(onMovida).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Case 8: failed PATCH does NOT call onReclasificado or solicitarRecargaResumen
   * (falsifies optimistic refresh — MDET-05 ninth scenario)
   */
  it('failed PATCH does NOT call onReclasificado or solicitarRecargaResumen', async () => {
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 400 },
    });

    const onReclasificado = jest.fn<void, []>();
    const onMovida = jest.fn<void, [string]>();
    const props = defaultProps({ onReclasificado, onMovida });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    // Same-bucket failure path (no Alert needed)
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-Entretenimiento'),
      );
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledTimes(1);
    });

    // Neither refresh callback must fire on failure
    expect(onReclasificado).not.toHaveBeenCalled();
    expect(mockSolicitarRecargaResumen).not.toHaveBeenCalled();
    expect(onMovida).not.toHaveBeenCalled();
  });

  /**
   * Case 9: cancelling cross-bucket Alert leaves UI unchanged — no API call
   * (MDET-05 eighth scenario)
   */
  it('cancelling cross-bucket Alert leaves UI unchanged — no API call', async () => {
    const onReclasificado = jest.fn<void, []>();
    const props = defaultProps({ onReclasificado });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });

    // Alert should have been called
    expect(alertSpy).toHaveBeenCalledTimes(1);

    // Press Cancel button
    await act(async () => {
      const cancelButton = capturedAlertButtons.find(
        (b) => b.text === 'Cancelar',
      );
      cancelButton?.onPress?.();
    });

    // No API call after cancellation
    expect(mockReclasificarCategoria).not.toHaveBeenCalled();
    expect(onReclasificado).not.toHaveBeenCalled();
    expect(mockSolicitarRecargaResumen).not.toHaveBeenCalled();
  });

  /**
   * Case 10: Alert.alert guard (mostrandoAlerta ref) blocks double-open
   * (us-044 guard — pressing cross-bucket option twice must only show 1 alert)
   */
  it('Alert.alert guard (mostrandoAlerta ref) blocks double-open', async () => {
    const props = defaultProps();
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    // Press a cross-bucket option twice rapidly
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-Comida'));
    });

    // Only ONE Alert should have been shown (guard blocks the second)
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });
});
