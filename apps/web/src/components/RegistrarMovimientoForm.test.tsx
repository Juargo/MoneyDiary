/**
 * RegistrarMovimientoForm.test.tsx — US-060 Phase 2 (T-10 RED → T-11 GREEN).
 *
 * CA-01 through CA-10 per tasks.md / design.md §7 / spec.md §Testing Emphasis.
 * Hook mocked via vi.mock; catalog mocked via vi.mock; no live router context.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import { RegistrarMovimientoForm } from './RegistrarMovimientoForm';
import { useRegistrarMovimiento } from '@/api/use-registrar-movimiento';
import { useCategorias } from '@/api/use-categorias';
import { hoyLocal } from '@/domain/fecha';
import type { ApiError } from '@/api/client';
import type { RegistrarMovimientoManualDto } from '@/api/types';
import type { CatalogoDto } from '@/api/types';

vi.mock('@/api/use-registrar-movimiento', () => ({
  useRegistrarMovimiento: vi.fn(),
}));

vi.mock('@/api/use-categorias', () => ({
  useCategorias: vi.fn(),
}));

const mockedUseRegistrarMovimiento = vi.mocked(useRegistrarMovimiento);
const mockedUseCategorias = vi.mocked(useCategorias);

// Minimal mutation stand-in (mirrors SubirCartola.test.tsx pattern).
function unaMutacion<T>(
  overrides: {
    isPending?: boolean;
    isSuccess?: boolean;
    isError?: boolean;
    error?: ApiError | null;
    data?: T | undefined;
    mutate?: (...args: unknown[]) => void;
    reset?: () => void;
  } = {},
) {
  return {
    status: overrides.isPending
      ? 'pending'
      : overrides.isSuccess
        ? 'success'
        : overrides.isError
          ? 'error'
          : 'idle',
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

// Catalog query result stand-in (shape useQuery returns, NOT CatalogoEstado).
function unaConsulta<T>(
  overrides: {
    isPending?: boolean;
    isError?: boolean;
    data?: T;
  } = {},
) {
  return {
    isPending: overrides.isPending ?? false,
    isError: overrides.isError ?? false,
    data: overrides.data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// A CatalogoDto (what useCategorias returns) with 2 buckets and 1 category each.
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

function renderForm(esDemo = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RegistrarMovimientoForm esDemo={esDemo} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function setupDefaultHooks(mutateSpy = vi.fn()) {
  mockedUseRegistrarMovimiento.mockReturnValue(
    unaMutacion<RegistrarMovimientoManualDto>({ mutate: mutateSpy }),
  );
  mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
}

// ── Confirmation dialog helpers (critique round-8 P2) ───────────────────────
// Submit now opens the shared InlineConfirm dialog instead of mutating
// directly; these helpers name that two-step interaction so each test's
// intent (validation vs. commit vs. cancel) stays readable.

function getSubmitButton() {
  return screen.getByRole('button', { name: /guardar|registrar|enviar/i });
}

function getConfirmDialog() {
  return screen.getByRole('alertdialog');
}

function getConfirmButton() {
  return within(getConfirmDialog()).getByRole('button', {
    name: /confirmar registro|registrando/i,
  });
}

function getCancelButton() {
  return within(getConfirmDialog()).getByRole('button', { name: /cancelar/i });
}

/** Fills fecha/descripción/monto and clicks submit, opening the confirmation
 * dialog (tipo/cascade, if any, must already be set by the caller). */
async function completarYAbrirConfirmacion(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { descripcion?: string; monto?: string; fecha?: string } = {},
) {
  const hoy = overrides.fecha ?? hoyLocal();
  fireEvent.change(screen.getByLabelText(/fecha/i), { target: { value: hoy } });
  await user.type(
    screen.getByLabelText(/descripci[oó]n/i),
    overrides.descripcion ?? 'Test',
  );
  await user.type(screen.getByLabelText(/monto/i), overrides.monto ?? '5000');
  await user.click(getSubmitButton());
}

describe('RegistrarMovimientoForm (US-060)', () => {
  afterEach(() => {
    mockedUseRegistrarMovimiento.mockReset();
    mockedUseCategorias.mockReset();
    vi.restoreAllMocks();
  });

  // ── CA-01: WEB-REG-02 — fields + date defaults ────────────────────────────

  it('CA-01: renders tipo selector, fecha with today default and max, descripción, monto', () => {
    setupDefaultHooks();
    renderForm();

    const hoy = hoyLocal();

    // Tipo selector
    const tipoSelect = screen.getByLabelText(/tipo/i);
    expect(tipoSelect).toBeInTheDocument();

    // Fecha input with correct default and max
    const fechaInput = screen.getByLabelText(/fecha/i);
    expect(fechaInput).toBeInTheDocument();
    expect((fechaInput as HTMLInputElement).value).toBe(hoy);
    expect((fechaInput as HTMLInputElement).max).toBe(hoy);

    // Descripción
    expect(screen.getByLabelText(/descripci[oó]n/i)).toBeInTheDocument();

    // Monto
    expect(screen.getByLabelText(/monto/i)).toBeInTheDocument();
  });

  // ── Permanence expectation note (impeccable critique r7 P2, harden) ──────

  it('shows the permanence note before submit: movement cannot be edited or deleted, only reclassified', () => {
    setupDefaultHooks();
    renderForm();

    expect(
      screen.getByText(
        'Un movimiento registrado no se puede editar ni eliminar después; su categoría sí puede reclasificarse desde el dashboard.',
      ),
    ).toBeInTheDocument();
  });

  // ── CA-02: WEB-REG-03 — Ingreso zeroing + wire-body assertion ─────────────

  it('CA-02: switching Gasto→Ingreso zeroes cascade; submit body has NO bucket/categoriaId', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();

    // Switch to Gasto
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');

    // Choose a bucket
    await user.selectOptions(screen.getByLabelText(/bucket/i), 'Deseos');

    // Choose a categoría
    await user.selectOptions(
      screen.getByLabelText(/categor[ií]a/i),
      'cat-des-1',
    );

    // Switch back to Ingreso
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Ingreso');

    // Fill valid fecha, descripción, monto
    const hoy = hoyLocal();
    const fechaInput = screen.getByLabelText(/fecha/i);
    fireEvent.change(fechaInput, { target: { value: hoy } });

    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test ingreso');
    await user.type(screen.getByLabelText(/monto/i), '10000');

    // Submit opens the confirmation dialog; confirming fires the POST.
    await user.click(getSubmitButton());
    await user.click(getConfirmButton());

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const body = mutateSpy.mock.calls[0][0];
    expect(body.tipo).toBe('Ingreso');
    expect(body).not.toHaveProperty('bucket');
    expect(body).not.toHaveProperty('categoriaId');
  });

  // ── CA-03: WEB-REG-04 — Gasto cascade ────────────────────────────────────

  it('CA-03: Gasto renders cascade; Deseos bucket filters categories; bucket change resets categoría', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();

    // Select Gasto
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');

    // Bucket select should appear; categoría should be present-but-disabled (no bucket)
    const bucketSelect = screen.getByLabelText(/bucket/i);
    expect(bucketSelect).toBeInTheDocument();

    const categoriaSelect = screen.getByLabelText(/categor[ií]a/i);
    expect(categoriaSelect).toBeDisabled();

    // Select "Deseos" bucket
    await user.selectOptions(bucketSelect, 'Deseos');

    // Categoría should be enabled and contain only Deseos categories
    expect(categoriaSelect).not.toBeDisabled();
    expect(
      within(categoriaSelect as HTMLSelectElement).getByText('Restaurantes'),
    ).toBeInTheDocument();
    expect(
      within(categoriaSelect as HTMLSelectElement).queryByText('Supermercado'),
    ).not.toBeInTheDocument();

    // Select a categoría
    await user.selectOptions(categoriaSelect, 'cat-des-1');

    // Change bucket to Necesidades — categoría should reset
    await user.selectOptions(bucketSelect, 'Necesidades');
    expect((categoriaSelect as HTMLSelectElement).value).toBe('');

    // Select categoría for Necesidades
    await user.selectOptions(categoriaSelect, 'cat-nec-1');

    // Fill required fields and submit
    const hoy = hoyLocal();
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test gasto');
    await user.type(screen.getByLabelText(/monto/i), '5000');

    await user.click(getSubmitButton());
    await user.click(getConfirmButton());

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const body = mutateSpy.mock.calls[0][0];
    expect(body.tipo).toBe('Gasto');
    expect(body.bucket).toBe('Necesidades');
    expect(body.categoriaId).toBe('cat-nec-1');
  });

  // ── CA-04: WEB-REG-07 — 201 success: form clears + confirmation ──────────
  // Uses a Gasto submission to also assert cascade is cleared on success (D-10).

  it('CA-04: on Gasto onSuccess callback form clears to Ingreso, cascade cleared, confirmation appears, dashboard link present', async () => {
    let capturedOnSuccess: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutateSpy = vi.fn((_body: any, options: any) => {
      capturedOnSuccess = options?.onSuccess;
    });
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();

    // Switch to Gasto and fill cascade
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');
    await user.selectOptions(screen.getByLabelText(/bucket/i), 'Deseos');
    await user.selectOptions(
      screen.getByLabelText(/categor[ií]a/i),
      'cat-des-1',
    );

    // Fill remaining fields
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Almuerzo');
    await user.type(screen.getByLabelText(/monto/i), '5000');

    // Submit opens the confirmation dialog; confirming fires the POST.
    await user.click(getSubmitButton());
    await user.click(getConfirmButton());

    // Simulate 201 success
    expect(capturedOnSuccess).toBeDefined();
    capturedOnSuccess?.();

    await waitFor(() => {
      // tipo RESET to Ingreso (cascade state cleared — Gasto-201 coverage)
      expect((screen.getByLabelText(/tipo/i) as HTMLSelectElement).value).toBe(
        'Ingreso',
      );
      // Cascade no longer rendered (tipo is Ingreso)
      expect(screen.queryByLabelText(/bucket/i)).not.toBeInTheDocument();
      // descripcion/monto cleared
      expect(
        (screen.getByLabelText(/descripci[oó]n/i) as HTMLInputElement).value,
      ).toBe('');
      expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
        '',
      );
      // fecha reset to today
      expect((screen.getByLabelText(/fecha/i) as HTMLInputElement).value).toBe(
        hoyLocal(),
      );
      // Confirmation dialog closes on success (unchanged existing flow).
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      // Inline confirmation in aria-live="polite" region (role="status")
      expect(screen.getByRole('status')).toHaveTextContent(
        /registrado|guardado|éxito|ok/i,
      );
    });

    // "Ir al dashboard" link always present
    expect(
      screen.getByRole('link', { name: /ir al dashboard/i }),
    ).toBeInTheDocument();
  }, 10000);

  // ── CA-05: WEB-REG-05/WEB-REG-08 — pre-validation + input preserved ──────

  it('CA-05: empty descripción fails pre-validation, no fetch, input preserved', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/monto/i), '5000');
    // Leave descripción empty

    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
    // Error alert shows the specific descripción message
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La descripción es obligatoria.',
    );
    // Monto preserved
    expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
      '5000',
    );
    // A validation failure never opens the confirmation dialog.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('CA-05: monto=0 fails esMontoManualValido, no fetch, input preserved', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '0');

    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
    // Error alert shows the specific monto message
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ingresa un monto válido (número entero positivo).',
    );
    expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
      '0',
    );
  });

  it('CA-05: monto=-5 fails pre-validation, input preserved as -5', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '-5');

    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
    // Error alert shows the specific monto message
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ingresa un monto válido (número entero positivo).',
    );
    expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
      '-5',
    );
  });

  it('CA-05: future fecha fails pre-validation, no fetch', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    // Compute tomorrow's date
    const hoy = hoyLocal();
    const [y, m, d] = hoy.split('-').map(Number);
    const tomorrow = new Date(y, m - 1, d + 1);
    const tomorrowStr = new Intl.DateTimeFormat('en-CA').format(tomorrow);

    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: tomorrowStr },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '5000');

    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
    // Error alert shows the specific fecha message
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha no puede ser futura.',
    );
  });

  it('CA-05: Gasto with missing categoriaId fails pre-validation', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();

    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');
    // Choose bucket but NOT categoría
    await user.selectOptions(screen.getByLabelText(/bucket/i), 'Deseos');

    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '5000');

    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
    // Error alert shows the specific cascade message
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Selecciona una categoría.',
    );
  });

  it('CA-05: Gasto with bucket at sentinel fails pre-validation, no fetch, alert shown', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();

    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');
    // Leave bucket at sentinel (do NOT select a bucket)

    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(
      screen.getByLabelText(/descripci[oó]n/i),
      'Test gasto sin bucket',
    );
    await user.type(screen.getByLabelText(/monto/i), '3000');

    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Selecciona un bucket válido.',
    );
  });

  // ── Confirmation dialog: error reconciliation (critique round-8 P2) ──────
  // On an API error, the failure lives INSIDE the still-open dialog (its own
  // `role="alert"` slot) — NOT mirrored into the outer feedback region below
  // the form, which would otherwise announce the identical failure twice.

  it('API error on confirm: dialog stays open, error shown inline in the dialog only, ALL fields preserved', async () => {
    let capturedOnError: ((err: ApiError) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutateSpy = vi.fn((_body: any, options: any) => {
      capturedOnError = options?.onError;
    });
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();
    const descripcionValue = 'Mi gasto';
    const montoValue = '8000';

    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), descripcionValue);
    await user.type(screen.getByLabelText(/monto/i), montoValue);

    await user.click(getSubmitButton());
    await user.click(getConfirmButton());

    // Simulate 400 error
    const apiError: ApiError = {
      tag: 'invalid',
      message: 'Datos inválidos. Revisa los campos y vuelve a intentar.',
    };
    capturedOnError?.(apiError);

    await waitFor(() => {
      // Error rendered INSIDE the dialog (InlineConfirm's error slot).
      expect(within(getConfirmDialog()).getByRole('alert')).toHaveTextContent(
        'Datos inválidos',
      );
    });

    // Dialog stays open — user can retry without reopening it.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // The outer form-level alert region is NOT also populated (no
    // duplicated announcement of the same failure).
    const outerAlerts = screen
      .getAllByRole('alert')
      .filter((el) => el !== within(getConfirmDialog()).getByRole('alert'));
    for (const alertEl of outerAlerts) {
      expect(alertEl).toHaveTextContent('');
    }

    // ALL inputs preserved
    expect(
      (screen.getByLabelText(/descripci[oó]n/i) as HTMLInputElement).value,
    ).toBe(descripcionValue);
    expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
      montoValue,
    );
    expect((screen.getByLabelText(/fecha/i) as HTMLInputElement).value).toBe(
      hoy,
    );
  });

  // ── In-dialog async feedback (critique round-8 P2, relocated from the
  //    submit button — which now only opens the dialog — to the confirm
  //    button, the control that actually fires the mutation) ───────────────

  it('el botón "Registrar movimiento" nunca cambia de texto; el confirmar del diálogo muestra "Registrando…" y queda disabled mientras la mutación está pendiente', async () => {
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ isPending: false }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
    const { rerender, queryClient } = renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user);

    // Submit button stays "Registrar movimiento" — it only opens the dialog.
    expect(
      screen.getByRole('button', { name: 'Registrar movimiento' }),
    ).toBeInTheDocument();
    expect(getConfirmButton()).toHaveTextContent('Confirmar registro');
    expect(getConfirmButton()).not.toBeDisabled();

    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ isPending: true }),
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <RegistrarMovimientoForm esDemo={false} />
      </QueryClientProvider>,
    );

    // Dialog stays open while pending; its confirm button carries the
    // in-flight label and is disabled.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    const boton = getConfirmButton();
    expect(boton).toHaveTextContent('Registrando…');
    expect(boton).toBeDisabled();
  });

  // ── Form sectioning (impeccable critique P2) ───────────────────────────────

  it('agrupa los datos del movimiento bajo el legend "Movimiento" (siempre visible)', () => {
    setupDefaultHooks();
    renderForm();

    const grupo = screen.getByRole('group', { name: 'Movimiento' });
    expect(within(grupo).getByLabelText(/tipo/i)).toBeInTheDocument();
    expect(within(grupo).getByLabelText(/fecha/i)).toBeInTheDocument();
    expect(within(grupo).getByLabelText(/descripci[oó]n/i)).toBeInTheDocument();
    expect(within(grupo).getByLabelText(/monto/i)).toBeInTheDocument();
  });

  it('agrupa la cascada bucket/categoría bajo el legend "Clasificación" cuando tipo=Gasto', async () => {
    setupDefaultHooks();
    renderForm();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');

    const grupo = screen.getByRole('group', { name: 'Clasificación' });
    expect(within(grupo).getByLabelText(/bucket/i)).toBeInTheDocument();
    expect(within(grupo).getByLabelText(/categor[ií]a/i)).toBeInTheDocument();
  });

  // ── CA-06: WEB-REG-06 — double-submit guard ───────────────────────────────
  // The guard now lives on the dialog's confirm button (the control that
  // actually fires the mutation) — submit itself only opens the dialog and
  // never touches `isSubmittingRef`.

  it('CA-06: two synchronous confirm clicks call mutate exactly once', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '5000');

    await user.click(getSubmitButton());
    const confirmBtn = getConfirmButton();
    // Two rapid clicks
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(mutateSpy).toHaveBeenCalledTimes(1);
  });

  it('CA-06: two synchronous submit clicks only ever open one dialog (mutate not yet called)', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '5000');

    const submitBtn = getSubmitButton();
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  // ── Confirmation dialog content + cancel/Escape (critique round-8 P2) ────

  it('Ingreso: el diálogo resume tipo, fecha, descripción, monto formateado CLP y la nota de permanencia (sin bucket/categoría)', async () => {
    setupDefaultHooks();
    renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user, {
      descripcion: 'Sueldo agosto',
      monto: '850000',
    });

    const dialog = getConfirmDialog();
    expect(within(dialog).getByText('Ingreso')).toBeInTheDocument();
    expect(within(dialog).getByText('Sueldo agosto')).toBeInTheDocument();
    // formatearMontoCLP('850000') → '$850.000' (thousands separator, no decimals)
    expect(within(dialog).getByText('$850.000')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Un movimiento registrado no se puede editar ni eliminar después; su categoría sí puede reclasificarse desde el dashboard.',
      ),
    ).toBeInTheDocument();
    // No bucket/categoría line for an Ingreso.
    expect(within(dialog).queryByText(/Gustos|Necesidades|Ahorro/)).toBeNull();
  });

  it('Gasto: el diálogo resume el bucket con su etiqueta UI ("Gustos" para Deseos) y el nombre de la categoría', async () => {
    setupDefaultHooks();
    renderForm();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');
    await user.selectOptions(screen.getByLabelText(/bucket/i), 'Deseos');
    await user.selectOptions(
      screen.getByLabelText(/categor[ií]a/i),
      'cat-des-1',
    );
    await completarYAbrirConfirmacion(user, {
      descripcion: 'Cena',
      monto: '15000',
    });

    const dialog = getConfirmDialog();
    // ETIQUETA_BUCKET maps the wire value 'Deseos' to the UI label "Gustos".
    expect(within(dialog).getByText(/Gustos/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Restaurantes/)).toBeInTheDocument();
  });

  it('Cancelar: cierra el diálogo, preserva los campos, no dispara mutate, y devuelve el foco al botón de envío', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user, {
      descripcion: 'Test cancelar',
      monto: '7000',
    });

    await user.click(getCancelButton());

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mutateSpy).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/descripci[oó]n/i) as HTMLInputElement).value,
    ).toBe('Test cancelar');
    expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
      '7000',
    );
    expect(document.activeElement).toBe(getSubmitButton());
  });

  it('Escape: cierra el diálogo, preserva los campos, no dispara mutate, y devuelve el foco al botón de envío', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user, {
      descripcion: 'Test escape',
      monto: '9000',
    });

    fireEvent.keyDown(getConfirmDialog(), { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mutateSpy).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/descripci[oó]n/i) as HTMLInputElement).value,
    ).toBe('Test escape');
    expect((screen.getByLabelText(/monto/i) as HTMLInputElement).value).toBe(
      '9000',
    );
    expect(document.activeElement).toBe(getSubmitButton());
  });

  // ── Confirmation dialog: guard cancel/Escape while mutation is in-flight
  //    (fresh review BLOCKER, mirrors useSeleccionMasivaIngestas's
  //    `cancelarConfirmacion` no-op on `eliminando` + `cancelDisabled`) ─────
  // Without this guard, a "cancel" while pending either lets a stale POST
  // land after fields were wiped (false-consent write) or writes
  // `confirmError` with the dialog already unmounted (silently swallowed).

  it('Cancelar click mientras la mutación está pendiente: no-op — el diálogo permanece, nada se limpia; al resolver, el éxito completa normalmente', async () => {
    let capturedOnSuccess: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutateSpy = vi.fn((_body: any, options: any) => {
      capturedOnSuccess = options?.onSuccess;
    });
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ mutate: mutateSpy }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
    const { rerender, queryClient } = renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user, {
      descripcion: 'En vuelo',
      monto: '4000',
    });
    await user.click(getConfirmButton());
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    // Simulate the mutation now being in-flight (isPending: true).
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({
        isPending: true,
        mutate: mutateSpy,
      }),
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <RegistrarMovimientoForm esDemo={false} />
      </QueryClientProvider>,
    );

    // Cancelar is visually disabled (cancelDisabled) AND a click is a no-op.
    const cancelBtn = getCancelButton();
    expect(cancelBtn).toBeDisabled();
    fireEvent.click(cancelBtn);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/descripci[oó]n/i) as HTMLInputElement).value,
    ).toBe('En vuelo');
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    // Resolve the (still in-flight) mutation afterwards — success flow
    // completes exactly as if cancel had never been attempted.
    capturedOnSuccess?.();

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        /registrado|guardado|éxito|ok/i,
      );
    });
  });

  it('Escape mientras la mutación está pendiente: no-op — el diálogo permanece, nada se limpia; al resolver, el éxito completa normalmente', async () => {
    let capturedOnSuccess: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutateSpy = vi.fn((_body: any, options: any) => {
      capturedOnSuccess = options?.onSuccess;
    });
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ mutate: mutateSpy }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));
    const { rerender, queryClient } = renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user, {
      descripcion: 'En vuelo escape',
      monto: '4500',
    });
    await user.click(getConfirmButton());
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({
        isPending: true,
        mutate: mutateSpy,
      }),
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <RegistrarMovimientoForm esDemo={false} />
      </QueryClientProvider>,
    );

    fireEvent.keyDown(getConfirmDialog(), { key: 'Escape' });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/descripci[oó]n/i) as HTMLInputElement).value,
    ).toBe('En vuelo escape');
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    capturedOnSuccess?.();

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        /registrado|guardado|éxito|ok/i,
      );
    });
  });

  // ── Confirmation dialog: freezes the form (fresh review CRITICAL) ────────
  // InlineConfirm is non-modal — without freezing, the user can tab back
  // into the (still visible) fields, edit them, and an implicit Enter
  // re-invokes handleEnviar, silently REPLACING the already-open snapshot
  // and defeating the review step it exists for.

  it('con el diálogo abierto, todos los campos y el botón de envío quedan deshabilitados', async () => {
    setupDefaultHooks();
    renderForm();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');
    await user.selectOptions(screen.getByLabelText(/bucket/i), 'Deseos');
    await user.selectOptions(
      screen.getByLabelText(/categor[ií]a/i),
      'cat-des-1',
    );
    await completarYAbrirConfirmacion(user, {
      descripcion: 'Congelado',
      monto: '2000',
    });

    expect(screen.getByLabelText(/tipo/i)).toBeDisabled();
    expect(screen.getByLabelText(/fecha/i)).toBeDisabled();
    expect(screen.getByLabelText(/descripci[oó]n/i)).toBeDisabled();
    expect(screen.getByLabelText(/monto/i)).toBeDisabled();
    expect(screen.getByLabelText(/bucket/i)).toBeDisabled();
    expect(screen.getByLabelText(/categor[ií]a/i)).toBeDisabled();
    expect(getSubmitButton()).toBeDisabled();
  });

  it('un reenvío forzado del form mientras el diálogo está abierto NO reemplaza el snapshot ya mostrado (belt-and-suspenders)', async () => {
    const mutateSpy = vi.fn();
    setupDefaultHooks(mutateSpy);
    const { container } = renderForm();

    const user = userEvent.setup();
    await completarYAbrirConfirmacion(user, {
      descripcion: 'Original',
      monto: '1000',
    });

    expect(
      within(getConfirmDialog()).getByText('Original'),
    ).toBeInTheDocument();

    // Force a value into the (visually disabled) descripción field via a
    // raw DOM event — `fireEvent.change` dispatches synthetically and
    // reaches React's onChange regardless of the `disabled` attribute
    // (unlike real user interaction, which the browser itself blocks). This
    // simulates the freeze being bypassed some other way, so the ONLY thing
    // left standing between this and a replaced snapshot is handleEnviar's
    // own early return.
    fireEvent.change(screen.getByLabelText(/descripci[oó]n/i), {
      target: { value: 'Hackeado' },
    });

    const formEl = container.querySelector('form');
    if (!formEl) throw new Error('form element not found');
    // Bypasses the disabled UI (e.g. a stray submit event) — the
    // belt-and-suspenders early return in handleEnviar must hold even if
    // the freeze above were ever removed or bypassed.
    fireEvent.submit(formEl);

    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    // The dialog still shows the ORIGINAL snapshot — the forced edit above
    // never made it into a new confirmación.
    expect(
      within(getConfirmDialog()).getByText('Original'),
    ).toBeInTheDocument();
    expect(
      within(getConfirmDialog()).queryByText('Hackeado'),
    ).not.toBeInTheDocument();
    expect(mutateSpy).not.toHaveBeenCalled();

    // Confirming now still posts the ORIGINAL body, not the forced edit.
    await user.click(getConfirmButton());
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy.mock.calls[0][0].descripcion).toBe('Original');
  });

  // ── CA-07: WEB-REG-09 — demo disabled ────────────────────────────────────

  it('CA-07: esDemo=true disables all fields, shows role=note, mutate never called', async () => {
    const mutateSpy = vi.fn();
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ mutate: mutateSpy }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    renderForm(true);

    const user = userEvent.setup();

    // All inputs disabled
    expect(screen.getByLabelText(/tipo/i)).toBeDisabled();
    expect(screen.getByLabelText(/fecha/i)).toBeDisabled();
    expect(screen.getByLabelText(/descripci[oó]n/i)).toBeDisabled();
    expect(screen.getByLabelText(/monto/i)).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    ).toBeDisabled();

    // Demo notice visible (getAllByRole: the permanence note is a second,
    // always-present role="note" — assert the demo one by its text)
    const notas = screen.getAllByRole('note');
    expect(
      notas.some((nota) =>
        nota.textContent?.includes('No es posible registrar movimientos'),
      ),
    ).toBe(true);

    // Submit attempt = no-op — the submit button is disabled, so the click
    // never reaches handleEnviar: no confirmation dialog opens, no mutation.
    await user.click(getSubmitButton());
    expect(mutateSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  // ── CA-08: WEB-REG-04 — catalog error, cascade incomplete ────────────────

  it('CA-08: catalog error with empty bucket/categoría → inline alert, submit blocked', async () => {
    const mutateSpy = vi.fn();
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ mutate: mutateSpy }),
    );
    mockedUseCategorias.mockReturnValue(
      unaConsulta({ isError: true, data: undefined }),
    );

    renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();

    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');

    // Catalog error alert visible
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    // Cascade selects disabled
    expect(screen.getByLabelText(/bucket/i)).toBeDisabled();
    expect(screen.getByLabelText(/categor[ií]a/i)).toBeDisabled();

    // Attempt to submit with empty cascade
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Test');
    await user.type(screen.getByLabelText(/monto/i), '5000');
    await user.click(
      screen.getByRole('button', { name: /guardar|registrar|enviar/i }),
    );

    expect(mutateSpy).not.toHaveBeenCalled();
  });

  // ── CA-09: WEB-REG-04 — catalog error, cascade COMPLETE, submit proceeds ──

  it('CA-09: catalog error after cascade selection — state kept, submit proceeds', async () => {
    let capturedOnSuccess: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutateSpy = vi.fn((_body: any, options: any) => {
      capturedOnSuccess = options?.onSuccess;
    });

    // First render with catalog loaded so user can make selections
    mockedUseRegistrarMovimiento.mockReturnValue(
      unaMutacion<RegistrarMovimientoManualDto>({ mutate: mutateSpy }),
    );
    mockedUseCategorias.mockReturnValue(unaConsulta({ data: unCatalogoDto() }));

    const { rerender, queryClient } = renderForm();

    const user = userEvent.setup();
    const hoy = hoyLocal();

    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');
    await user.selectOptions(screen.getByLabelText(/bucket/i), 'Deseos');
    await user.selectOptions(
      screen.getByLabelText(/categor[ií]a/i),
      'cat-des-1',
    );

    // Now simulate catalog error (re-render hook returns error)
    mockedUseCategorias.mockReturnValue(
      unaConsulta({ isError: true, data: undefined }),
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <RegistrarMovimientoForm esDemo={false} />
      </QueryClientProvider>,
    );

    // Alert visible, selects disabled — but state is kept
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    // Fill other fields
    fireEvent.change(screen.getByLabelText(/fecha/i), {
      target: { value: hoy },
    });
    await user.type(screen.getByLabelText(/descripci[oó]n/i), 'Restaurante');
    await user.type(screen.getByLabelText(/monto/i), '12000');

    // Submit should proceed (bucket + categoriaId were selected before error)
    await user.click(getSubmitButton());
    await user.click(getConfirmButton());

    // mutate called because both values are non-empty
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const body = mutateSpy.mock.calls[0][0];
    expect(body.tipo).toBe('Gasto');
    expect(body.bucket).toBe('Deseos');
    expect(body.categoriaId).toBe('cat-des-1');
    // Unused in this path; satisfy TS
    void capturedOnSuccess;
  });

  // ── CA-10: WEB-REG-11 — a11y + focus management ───────────────────────────

  it('CA-10: vitest-axe has no violations on Ingreso render', async () => {
    setupDefaultHooks();
    const { container } = renderForm();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('CA-10: vitest-axe has no violations on Gasto render (cascade visible)', async () => {
    setupDefaultHooks();
    const { container } = renderForm();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('CA-10: switching to Gasto moves focus to bucket select (D-09 ordering invariant)', async () => {
    setupDefaultHooks();
    renderForm();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'Gasto');

    // The first <select> inside cascadaRef (bucket) must receive focus.
    await waitFor(() => {
      const bucketSelect = screen.getByLabelText(/bucket/i);
      expect(document.activeElement).toBe(bucketSelect);
    });
  });

  // ── Regression guard: "Ir al dashboard" link is always present ────────────

  it('"Ir al dashboard" link is present before any submission', () => {
    setupDefaultHooks();
    renderForm();

    expect(
      screen.getByRole('link', { name: /ir al dashboard/i }),
    ).toBeInTheDocument();
  });
});
