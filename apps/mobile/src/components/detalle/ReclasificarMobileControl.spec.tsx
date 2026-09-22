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
  within,
} from '@testing-library/react-native';
import { Alert, AccessibilityInfo } from 'react-native';
import type { CatalogoDto, CategoriaDto } from '../../domain/catalogo.types';
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

// agregar-categoria-desde-selector (issue #744): the control's own "+" now
// calls `crearCategoria` (via the real `NuevaCategoriaForm`, not mocked
// away here — its OWN behaviour is `NuevaCategoriaForm.spec.tsx`'s job,
// this suite only proves the WIRING: bucketInicial, select-on-success,
// onCategoriaCreada).
const mockCrearCategoria = jest.fn<
  Promise<ApiResult<CategoriaDto>>,
  [{ nombre: string; bucket: string }]
>();

// Single factory wiring reclasificarCategoria, fetchCatalogo and crearCategoria.
// The previous file had two back-to-back jest.mock calls for the same module;
// the first was dead (the second override always wins). Collapsed into one.
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  reclasificarCategoria: (txId: string, categoriaId: string) =>
    mockReclasificarCategoria(txId, categoriaId),
  fetchCatalogo: () => mockFetchCatalogo(),
  crearCategoria: (input: { nombre: string; bucket: string }) =>
    mockCrearCategoria(input),
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

/**
 * confirmacion-reclasificar (issue #749) fixture: a SECOND Deseos categoría
 * so a same-bucket reclassify (Entretenimiento → Streaming, both Deseos) has
 * an actual different destination to pick — `makeCatalogo()` alone only has
 * one categoría per bucket.
 */
function makeCatalogoConDosEnDeseos(): CatalogoDto {
  return {
    categorias: [
      ...makeCatalogo().categorias,
      {
        id: 'cat-deseos-2',
        nombre: 'Streaming',
        bucket: 'Deseos',
        transaccionesCount: 1,
        patrones: [],
      },
    ],
  };
}

/**
 * MDET-08 fixture (categoria-unica-por-bucket, ADR-042/D-08): the SAME
 * nombre ("Transporte") in two different buckets — legal once uniqueness
 * becomes bucket-scoped. Identity MUST resolve by `id`, never by `nombre`.
 */
function makeCatalogoConNombreDuplicado(): CatalogoDto {
  return {
    categorias: [
      {
        id: 'cat-transporte-necesidades',
        nombre: 'Transporte',
        bucket: 'Necesidades',
        transaccionesCount: 4,
        patrones: [],
      },
      {
        id: 'cat-transporte-deseos',
        nombre: 'Transporte',
        bucket: 'Deseos',
        transaccionesCount: 1,
        patrones: [],
      },
    ],
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
    // agregar-categoria-desde-selector (issue #744): REQUIRED per the
    // us-044 PR7 banned-pattern (same discipline as onReclasificado/onMovida
    // above) — a plain jest.fn() default keeps every pre-existing case that
    // doesn't care about it compiling unchanged.
    onCategoriaCreada: jest.fn(),
    // patrón-desde-movimiento (issue #745): REQUIRED per this control's own
    // banned-pattern discipline (onMovida/onReclasificado/onCategoriaCreada
    // precedent) — a plain jest.fn() default keeps every pre-existing case
    // that doesn't care about it compiling unchanged.
    onOfrecerPatron: jest.fn<
      void,
      [{ descripcion: string; categoriaId: string }]
    >(),
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
   * Case 1b (UX-clarity fix, reclasificar-bucket-y-categoria): the trigger's
   * accessibilityLabel and the modal's visible title both name "bucket y
   * categoría" — the picker groups options by bucket, so the copy must say
   * so, not just "categoría".
   */
  it('trigger accessibilityLabel and modal title both name "bucket y categoría" (reclasificar-bucket-y-categoria)', async () => {
    const props = defaultProps();
    await render(<ReclasificarMobileControl {...props} />);

    const trigger = screen.getByTestId('reclasificar-trigger-tx-1');
    expect(trigger.props.accessibilityLabel).toBe(
      'Cambiar grupo y categoría de Netflix',
    );

    await act(async () => {
      fireEvent.press(trigger);
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    expect(screen.getByText('Cambiar grupo y categoría')).toBeTruthy();
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
      fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-deseos'));
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
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
    });

    // Alert.alert must have been called with the exact message
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('Confirmar cambio de grupo');
    // ETIQUETA_BUCKET maps Deseos→'Gustos'. Raw key 'Deseos' would fail this
    // pin. El destino nombra bucket Y categoría (issue #782): sin "· Comida"
    // el mensaje le esconde al usuario la mitad de lo que acaba de elegir.
    expect(message).toBe(
      'Esto mueve $50.000 de Gustos a Necesidades · Comida.',
    );
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
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
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
  it('cross-bucket success calls onMovida with the full "{bucket} · {categoría}" label (e.g. "Necesidades · Comida")', async () => {
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
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
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

    // Called with the FULL destination label — ETIQUETA_BUCKET['Necesidades']
    // plus the categoría's own nombre (issue #782).
    expect(onMovida).toHaveBeenCalledWith('Necesidades · Comida');
  });

  /**
   * Case 3b: same-bucket commit calls onMovida with the destination
   * CATEGORÍA's name (confirmacion-reclasificar, issue #749) but still NEVER
   * calls AccessibilityInfo directly — announcing stays the screen's job
   * (D-20 single-announcement-source rule; onMovida is the reused seam).
   */
  it('same-bucket commit calls onMovida with the destination categoría name, never announces directly (confirmacion-reclasificar)', async () => {
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: makeReclasificarDto('Deseos', 'Streaming'),
    });
    mockFetchCatalogo.mockResolvedValue({
      ok: true,
      value: makeCatalogoConDosEnDeseos(),
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

    // Press a DIFFERENT categoría in the SAME bucket (Streaming, Deseos) —
    // the current categoría is Entretenimiento, also Deseos.
    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-deseos-2'));
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledTimes(1);
    });
    expect(mockReclasificarCategoria).toHaveBeenCalledWith(
      'tx-1',
      'cat-deseos-2',
    );

    // Same-bucket now reuses onMovida — but with the categoría NAME, never a
    // bucket label.
    await waitFor(() => expect(onMovida).toHaveBeenCalledTimes(1));
    expect(onMovida).toHaveBeenCalledWith('Streaming');
    // The control must NEVER call AccessibilityInfo (D-20; announcement is
    // the screen's responsibility, driven by its own onMovida handler).
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
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
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
      fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-deseos'));
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
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
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
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
    });
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-necesidades'),
      );
    });

    // Only ONE Alert should have been shown (guard blocks the second)
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Case 11 (MDET-08, categoria-unica-por-bucket D-08): with two categorías
   * sharing the nombre "Transporte" across buckets, EXACTLY ONE row must
   * render as the current selection — the one matching by id, not by nombre.
   * A `cat.nombre === categoriaActual.nombre` comparison would mark BOTH
   * rows selected (the a11y defect this task closes: two elements reporting
   * accessibilityState={{ selected: true }} to VoiceOver/TalkBack at once).
   */
  it('MDET-08: exactly one row shows the "actual" selection when two categorías share a nombre', async () => {
    mockFetchCatalogo.mockResolvedValue({
      ok: true,
      value: makeCatalogoConNombreDuplicado(),
    });

    const props = defaultProps({
      categoriaActual: {
        id: 'cat-transporte-necesidades',
        nombre: 'Transporte',
        bucket: 'Necesidades',
      },
    });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    const filaActual = screen.getByTestId(
      'reclasificar-opcion-cat-transporte-necesidades',
    );
    const filaDuplicada = screen.getByTestId(
      'reclasificar-opcion-cat-transporte-deseos',
    );

    expect(filaActual.props.accessibilityState).toEqual({ selected: true });
    expect(filaDuplicada.props.accessibilityState).toEqual({
      selected: false,
    });
  });

  /**
   * Case 12 (MDET-08): selecting the duplicate-named row in the OTHER bucket
   * and confirming the cross-bucket Alert sends its exact id — never the
   * shared nombre, which would be ambiguous under ADR-042.
   */
  it('MDET-08: selecting the duplicate-named row in the other bucket sends its exact id', async () => {
    mockFetchCatalogo.mockResolvedValue({
      ok: true,
      value: makeCatalogoConNombreDuplicado(),
    });
    mockReclasificarCategoria.mockResolvedValueOnce({
      ok: true,
      value: makeReclasificarDto('Deseos', 'Transporte'),
    });

    const props = defaultProps({
      categoriaActual: {
        id: 'cat-transporte-necesidades',
        nombre: 'Transporte',
        bucket: 'Necesidades',
      },
    });
    await render(<ReclasificarMobileControl {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('reclasificar-opcion-cat-transporte-deseos'),
      );
    });

    // Confirm the cross-bucket Alert
    await act(async () => {
      const confirmButton = capturedAlertButtons.find(
        (b) => b.text !== 'Cancelar',
      );
      confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockReclasificarCategoria).toHaveBeenCalledTimes(1);
    });

    expect(mockReclasificarCategoria).toHaveBeenCalledWith(
      'tx-1',
      'cat-transporte-deseos',
    );
  });

  // ── categoriaVersion (agregar-categoria-desde-bucket, issue #743) ──
  //
  // Reworked from an earlier `key`-based remount on the SCREEN's groups
  // container: that approach also reset `GrupoMovimientosMobile`'s own
  // `expandido` accordion state, collapsing every already-expanded group on
  // every categoría creation (a real UX regression, caught in review). The
  // fix instead threads `categoriaVersion` down as a plain PROP — this
  // control's own effect clears ONLY its cached `catalogo` on a change,
  // never the component tree.
  describe('categoriaVersion prop (issue #743)', () => {
    it('omitted (every pre-existing caller): fetches once and keeps serving the same cached catalog on every re-open', async () => {
      const props = defaultProps();
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() => {
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
      });
      expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-cancelar'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });

      // Re-open with no categoriaVersion change: still the SAME cached
      // catalog, no second fetch ("Do NOT clear catalogo — cache it so
      // re-open is instant").
      expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);
    });

    it('a categoriaVersion change clears the cached catalog, refetches on the NEXT open, and lists a categoría created elsewhere', async () => {
      mockFetchCatalogo.mockResolvedValueOnce({
        ok: true,
        value: makeCatalogo(),
      });

      const props = defaultProps();
      const { rerender } = await render(
        <ReclasificarMobileControl {...props} categoriaVersion={0} />,
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() => {
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
      });
      expect(mockFetchCatalogo).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('reclasificar-opcion-cat-nueva')).toBeNull();

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-cancelar'));
      });

      // A categoría was created elsewhere on the screen — the parent bumps
      // categoriaVersion. The NEW catalog the next fetch will return
      // includes it.
      mockFetchCatalogo.mockResolvedValueOnce({
        ok: true,
        value: {
          categorias: [
            ...makeCatalogo().categorias,
            {
              id: 'cat-nueva',
              nombre: 'Streaming',
              bucket: 'Deseos',
              transaccionesCount: 0,
              patrones: [],
            },
          ],
        },
      });
      await act(async () => {
        rerender(<ReclasificarMobileControl {...props} categoriaVersion={1} />);
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });

      await waitFor(() => {
        expect(mockFetchCatalogo).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(
          screen.getByTestId('reclasificar-opcion-cat-nueva'),
        ).toBeTruthy();
      });
    });
  });

  // ── crear categoría desde el selector (issue #744) ──

  describe('crear categoría desde el selector (issue #744)', () => {
    beforeEach(() => {
      mockCrearCategoria.mockReset();
    });

    it('renders a "Crear categoría" trigger inside the Modal, preselecting the row\'s current bucket (editable)', async () => {
      const props = defaultProps();
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() => {
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy();
      });

      const trigger = screen.getByTestId(
        'reclasificar-crear-categoria-trigger',
      );
      expect(trigger.props.accessibilityRole).toBe('button');

      await act(async () => {
        fireEvent.press(trigger);
      });

      expect(screen.getByTestId('nueva-categoria-form')).toBeTruthy();
      const chipDeseos = within(
        screen.getByTestId('bucket-selector'),
      ).getByRole('radio', { name: 'Deseos' });
      expect(chipDeseos.props.accessibilityState).toMatchObject({
        checked: true,
      });
    });

    it('creating a category in the SAME bucket selects it for the row and commits the reclassify immediately, no Alert', async () => {
      mockCrearCategoria.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'cat-libros',
          nombre: 'Libros',
          bucket: 'Deseos',
          transaccionesCount: 0,
          patrones: [],
        },
      });
      mockReclasificarCategoria.mockResolvedValueOnce({
        ok: true,
        value: makeReclasificarDto('Deseos', 'Libros'),
      });
      const props = defaultProps();
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy(),
      );
      await act(async () => {
        fireEvent.press(
          screen.getByTestId('reclasificar-crear-categoria-trigger'),
        );
      });
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Nombre'), 'Libros');
      });
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(mockCrearCategoria).toHaveBeenCalledWith({
          nombre: 'Libros',
          bucket: 'Deseos',
        });
      });
      await waitFor(() => {
        expect(mockReclasificarCategoria).toHaveBeenCalledWith(
          'tx-1',
          'cat-libros',
        );
      });
      expect(alertSpy).not.toHaveBeenCalled();
      expect(props.onCategoriaCreada).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cat-libros' }),
      );
      await waitFor(() =>
        expect(props.onMovida).toHaveBeenCalledWith('Libros'),
      );
    });

    it('creating a category in a DIFFERENT bucket shows the SAME cross-bucket Alert as picking an existing categoría, and only commits on Confirmar', async () => {
      mockCrearCategoria.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'cat-libros-necesidades',
          nombre: 'Libros',
          bucket: 'Necesidades',
          transaccionesCount: 0,
          patrones: [],
        },
      });
      mockReclasificarCategoria.mockResolvedValueOnce({
        ok: true,
        value: makeReclasificarDto('Necesidades', 'Libros'),
      });
      const props = defaultProps();
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy(),
      );
      await act(async () => {
        fireEvent.press(
          screen.getByTestId('reclasificar-crear-categoria-trigger'),
        );
      });
      // The row's current bucket is Deseos (defaultProps) — pick a
      // DIFFERENT one before saving, the exact usability finding behind
      // this issue.
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Nombre'), 'Libros');
        fireEvent.press(
          within(screen.getByTestId('bucket-selector')).getByRole('radio', {
            name: 'Necesidades',
          }),
        );
      });
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(mockCrearCategoria).toHaveBeenCalledWith({
          nombre: 'Libros',
          bucket: 'Necesidades',
        });
      });
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(mockReclasificarCategoria).not.toHaveBeenCalled();

      const confirmarBtn = capturedAlertButtons.find(
        (b) => b.text === 'Confirmar',
      );
      await act(async () => {
        confirmarBtn?.onPress?.();
      });

      await waitFor(() => {
        expect(mockReclasificarCategoria).toHaveBeenCalledWith(
          'tx-1',
          'cat-libros-necesidades',
        );
      });
    });

    it('a duplicate-name creation error renders inline in the form and keeps the row untouched', async () => {
      mockCrearCategoria.mockResolvedValueOnce({
        ok: false,
        error: { tag: 'http', status: 409, code: 'NOMBRE_DUPLICADO' },
      });
      const props = defaultProps();
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy(),
      );
      await act(async () => {
        fireEvent.press(
          screen.getByTestId('reclasificar-crear-categoria-trigger'),
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByLabelText('Nombre'),
          'Entretenimiento',
        );
      });
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
      });
      expect(mockReclasificarCategoria).not.toHaveBeenCalled();
      expect(props.onCategoriaCreada).not.toHaveBeenCalled();
    });
  });

  /**
   * patrón-desde-movimiento (issue #745): every successful reclassify —
   * same-bucket AND cross-bucket alike — offers to turn the just-picked
   * categoría into a pattern. `onOfrecerPatron` fires with the ROW's
   * description and the DESTINATION categoría id, AFTER the PATCH settles
   * (same settled-announcement discipline as `onMovida`), and never fires
   * on a failed PATCH.
   */
  describe('onOfrecerPatron (issue #745)', () => {
    it('same-bucket commit calls onOfrecerPatron with the description and destination categoriaId', async () => {
      mockReclasificarCategoria.mockResolvedValueOnce({
        ok: true,
        value: makeReclasificarDto('Deseos', 'Entretenimiento'),
      });
      const onOfrecerPatron = jest.fn();
      const props = defaultProps({ onOfrecerPatron });
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy(),
      );
      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-deseos'));
      });

      await waitFor(() => {
        expect(onOfrecerPatron).toHaveBeenCalledWith({
          descripcion: 'Netflix',
          categoriaId: 'cat-deseos',
        });
      });
    });

    it('cross-bucket commit (after confirming the Alert) calls onOfrecerPatron with the destination categoriaId', async () => {
      mockReclasificarCategoria.mockResolvedValueOnce({
        ok: true,
        value: makeReclasificarDto('Necesidades', 'Comida'),
      });
      const onOfrecerPatron = jest.fn();
      const props = defaultProps({ onOfrecerPatron });
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy(),
      );
      await act(async () => {
        fireEvent.press(
          screen.getByTestId('reclasificar-opcion-cat-necesidades'),
        );
      });
      await act(async () => {
        const confirmButton = capturedAlertButtons.find(
          (b) => b.text !== 'Cancelar',
        );
        confirmButton?.onPress?.();
      });

      await waitFor(() => {
        expect(onOfrecerPatron).toHaveBeenCalledWith({
          descripcion: 'Netflix',
          categoriaId: 'cat-necesidades',
        });
      });
    });

    it('a failed PATCH never calls onOfrecerPatron', async () => {
      mockReclasificarCategoria.mockResolvedValueOnce({
        ok: false,
        error: { tag: 'http', status: 400 },
      });
      const onOfrecerPatron = jest.fn();
      const props = defaultProps({ onOfrecerPatron });
      await render(<ReclasificarMobileControl {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-trigger-tx-1'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('reclasificar-modal')).toBeTruthy(),
      );
      await act(async () => {
        fireEvent.press(screen.getByTestId('reclasificar-opcion-cat-deseos'));
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
      });
      expect(onOfrecerPatron).not.toHaveBeenCalled();
    });
  });
});
