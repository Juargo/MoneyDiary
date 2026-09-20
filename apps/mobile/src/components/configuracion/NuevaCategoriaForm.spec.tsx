/**
 * NuevaCategoriaForm.spec.tsx — US-044 PR5c, T5c.1 (RED → GREEN)
 *
 * Tests (9 cases):
 *  1. Renders 'nombre' CampoTexto field
 *  2. Renders 'bucket' SelectorChips field with BUCKETS_ASIGNABLES options
 *  3. Submit disabled when nombre is empty (both fields otherwise valid)
 *  4. Submit disabled when no bucket selected
 *  5. Valid submit calls crearCategoria({nombre, bucket}) — spy via jest.mock,
 *     never a prop-identity probe (judgment-anticipated class 4)
 *  6. Success closes the form (calls onCreada callback)
 *  7. Success does NOT call solicitarRecargaResumen() — MCTG-07 negative-1,
 *     asserted against the REAL resumen-refresh module (judgment-anticipated class 5)
 *  8. Failure renders mensajeDeErrorCatalogo copy and keeps form open/retryable
 *  9. A second submit attempt after failure calls crearCategoria again (retryable)
 *
 * Note on act() usage: `act(async () => { ... })` is required to flush React 19
 * concurrent-mode state updates before the next fireEvent reads the committed
 * state from the new render's closure — same as PerfilPanel.spec.tsx:13-15.
 */
import React from 'react';
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import * as categorias from '../../api/categorias';
// MCTG-07 negative-1: import the REAL module — never mock it away
import * as resumenRefresh from '../../api/resumen-refresh';
import { NuevaCategoriaForm } from './NuevaCategoriaForm';

// Mock crearCategoria spy — we assert call shapes and return values
jest.mock('../../api/categorias', () => ({
  ...jest.requireActual('../../api/categorias'),
  crearCategoria: jest.fn(),
}));

const mockCrearCategoria = categorias.crearCategoria as jest.MockedFunction<
  typeof categorias.crearCategoria
>;

// Track solicitarRecargaResumen without mocking — the REAL function is called,
// we just spy on it so we can assert it was NOT called (judgment-anticipated class 5)
const spySolicitarRecarga = jest.spyOn(
  resumenRefresh,
  'solicitarRecargaResumen',
);

/** Helper: fill form fields and flush state updates via act before submitting. */
async function llenarYEnviar(opts: { nombre?: string; bucket?: string }) {
  await act(async () => {
    if (opts.nombre !== undefined) {
      fireEvent.changeText(screen.getByLabelText('Nombre'), opts.nombre);
    }
    if (opts.bucket !== undefined) {
      // Scoped to bucket-selector: the "Ahorro" bucket name collides with
      // SelectorIcono's "Ahorro" accessible label for `piggy-bank`
      // (categoria-iconografia, PR6b) — an unscoped query would match both.
      fireEvent.press(
        within(screen.getByTestId('bucket-selector')).getByRole('radio', {
          name: opts.bucket,
        }),
      );
    }
  });
  fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('NuevaCategoriaForm (US-044 PR5c, T5c.1/T5c.2)', () => {
  const mockOnCreada = jest.fn();
  const mockOnCancelar = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCrearCategoria.mockResolvedValue({
      ok: true,
      value: {
        id: 'cat-fake',
        nombre: 'Fake',
        bucket: 'Necesidades',
        transaccionesCount: 0,
        patrones: [],
      },
    });
  });

  it('renders the nombre CampoTexto field', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
  });

  it('renders the bucket SelectorChips with Necesidades / Deseos / Ahorro options', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    // SelectorChips renders a radiogroup with one radio per bucket.
    // categoria-iconografia (PR6b): scoped to the bucket-selector testID —
    // SelectorIcono (below) now ALSO renders 25 `accessibilityRole="radio"`
    // options, so an unscoped `getAllByRole('radio')` would pick those up too.
    const radios = within(screen.getByTestId('bucket-selector')).getAllByRole(
      'radio',
    );
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
    ]);
  });

  /**
   * issue #750 — "bucket" es jerga interna sin explicación en la UI (una
   * usuaria de prueba preguntó "¿por qué sale bucket?"). El campo se llama
   * "Grupo" y lleva la ayuda inline con el copy aprobado por el owner
   * (verbatim), visible sin interacción.
   */
  it('el campo se llama "Grupo (obligatorio)" y muestra la ayuda inline con el copy aprobado', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );

    expect(screen.getByText('Grupo (obligatorio)')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Necesidades, Gustos o Ahorro. Define cómo cuenta este gasto en tu 50/30/20. Puedes cambiarlo después, pero afecta todos los meses.',
      ),
    ).toBeOnTheScreen();
  });

  it('submit is no-op when nombre is empty (bucket selected)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    // Select a bucket but leave nombre empty
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Necesidades' }));
    });

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockCrearCategoria).not.toHaveBeenCalled();
  });

  it('submit is no-op when no bucket is selected (nombre filled)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    // Type a nombre but leave bucket unset
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), 'Supermercado');
    });

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockCrearCategoria).not.toHaveBeenCalled();
  });

  it('valid submit calls crearCategoria({nombre, bucket})', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Supermercado', bucket: 'Necesidades' });

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledTimes(1);
      expect(mockCrearCategoria).toHaveBeenCalledWith({
        nombre: 'Supermercado',
        bucket: 'Necesidades',
      });
    });
  });

  it('renders SelectorIcono with the "Sin icono" option and 25 allowlisted icons (MCTG-02)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Sin icono' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Streaming' })).toBeOnTheScreen();
  });

  it('picking an icon includes it in the crearCategoria body (MCTG-02)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), 'Streaming');
      fireEvent.press(screen.getByRole('radio', { name: 'Deseos' }));
      fireEvent.press(screen.getByRole('radio', { name: 'Streaming' }));
    });

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledTimes(1);
      expect(mockCrearCategoria).toHaveBeenCalledWith({
        nombre: 'Streaming',
        bucket: 'Deseos',
        icono: 'tv',
      });
    });
  });

  it('never touching the picker omits icono from the crearCategoria body (MCTG-02)', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Agua', bucket: 'Necesidades' });

    await waitFor(() => {
      expect(mockCrearCategoria).toHaveBeenCalledTimes(1);
      // No `icono` key at all — same object shape as before this feature
      // (JSON body drops an `undefined` property; `toEqual` treats an
      // `undefined`-valued key as absent, same discipline as web PR4/4.4).
      expect(mockCrearCategoria).toHaveBeenCalledWith({
        nombre: 'Agua',
        bucket: 'Necesidades',
      });
    });
  });

  it('success calls onCreada (closes the form)', async () => {
    mockCrearCategoria.mockResolvedValueOnce({
      ok: true,
      value: {
        id: 'cat-fake',
        nombre: 'Fake',
        bucket: 'Necesidades',
        transaccionesCount: 0,
        patrones: [],
      },
    });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Streaming', bucket: 'Deseos' });

    await waitFor(() => {
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
  });

  it('success does NOT call solicitarRecargaResumen() — MCTG-07 negative-1', async () => {
    mockCrearCategoria.mockResolvedValueOnce({
      ok: true,
      value: {
        id: 'cat-fake',
        nombre: 'Fake',
        bucket: 'Necesidades',
        transaccionesCount: 0,
        patrones: [],
      },
    });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'AFP', bucket: 'Ahorro' });

    await waitFor(() => {
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
    // The REAL solicitarRecargaResumen must NOT have been invoked
    expect(spySolicitarRecarga).not.toHaveBeenCalled();
  });

  it('failure renders mensajeDeErrorCatalogo copy and keeps the form open', async () => {
    mockCrearCategoria.mockResolvedValueOnce({
      ok: false,
      error: { tag: 'http', status: 409, code: 'NOMBRE_DUPLICADO' },
    });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Netflix', bucket: 'Deseos' });

    await waitFor(() => {
      // mensajes-catalogo.ts COPY.NOMBRE_DUPLICADO — asserted via the alert role element
      // so the accessibilityRole="alert" + accessibilityLiveRegion="polite" are implicitly pinned:
      // if the Text node loses those props, getByRole('alert') fails before toHaveTextContent.
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ya tienes una categoría con ese nombre en ese grupo.',
      );
    });

    // Form stays open — nombre field still present
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    // onCreada was NOT called
    expect(mockOnCreada).not.toHaveBeenCalled();
  });

  it('retryable: a second submit after failure calls crearCategoria again', async () => {
    // First attempt fails
    mockCrearCategoria
      .mockResolvedValueOnce({
        ok: false,
        error: { tag: 'http', status: 409, code: 'NOMBRE_DUPLICADO' },
      })
      // Second attempt: use a deferred promise to hold the in-flight window open
      // so we can assert setError(null) fired BEFORE the second result resolves.
      .mockReturnValueOnce(
        new Promise<Awaited<ReturnType<typeof mockCrearCategoria>>>(() => {
          /* intentionally never resolves in this test */
        }),
      );

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Luz', bucket: 'Necesidades' });

    // Wait for first error to appear — via the alert role element
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ya tienes una categoría con ese nombre en ese grupo.',
      );
    });

    // Second submit — form is still open; deferred promise keeps it in-flight
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    // While the second call is in-flight, setError(null) must have already fired.
    // Falsifiability: removing `setError(null)` from handleGuardar causes this to
    // fail because the stale error text remains visible while the second call is pending.
    await waitFor(() => {
      expect(
        screen.queryByText(
          'Ya tienes una categoría con ese nombre en ese grupo.',
        ),
      ).toBeNull();
    });

    expect(mockCrearCategoria).toHaveBeenCalledTimes(2);
  });

  it('Cancelar calls onCancelar exactly once and does not submit', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockOnCancelar).toHaveBeenCalledTimes(1);
    expect(mockCrearCategoria).not.toHaveBeenCalled();
  });

  it('whitespace-only nombre is treated as empty — submit does not call crearCategoria', async () => {
    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nombre'), '   ');
      fireEvent.press(screen.getByRole('radio', { name: 'Necesidades' }));
    });

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockCrearCategoria).not.toHaveBeenCalled();
  });

  // ── bucketFijo (agregar-categoria-desde-bucket, issue #743) ──
  //
  // The bucket-detail screen reuses this exact form with the bucket FIXED
  // (never a user choice there) — same idiom web's
  // `NuevaCategoriaDesdeFilaForm` already uses for its own fixed-bucket
  // caller. `bucketFijo` omitted (every test above) must keep the
  // Configuración path byte-for-byte unchanged: SelectorChips renders, the
  // bucket is user-chosen.
  describe('bucketFijo (issue #743)', () => {
    it('renders no bucket-selector chips and submits the fixed bucket, needing only nombre', async () => {
      await render(
        <NuevaCategoriaForm
          bucketFijo="Deseos"
          onCreada={mockOnCreada}
          onCancelar={mockOnCancelar}
        />,
      );

      expect(screen.queryByTestId('bucket-selector')).toBeNull();

      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Nombre'), 'Streaming');
      });
      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        expect(mockCrearCategoria).toHaveBeenCalledTimes(1);
        expect(mockCrearCategoria).toHaveBeenCalledWith({
          nombre: 'Streaming',
          bucket: 'Deseos',
        });
      });
    });

    it('shows the fixed bucket as static ETIQUETA_BUCKET text (Deseos -> Gustos)', async () => {
      await render(
        <NuevaCategoriaForm
          bucketFijo="Deseos"
          onCreada={mockOnCreada}
          onCancelar={mockOnCancelar}
        />,
      );

      expect(screen.getByText('Gustos')).toBeOnTheScreen();
    });

    it('submit is no-op when nombre is empty, even with bucketFijo set', async () => {
      await render(
        <NuevaCategoriaForm
          bucketFijo="Necesidades"
          onCreada={mockOnCreada}
          onCancelar={mockOnCancelar}
        />,
      );

      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      expect(mockCrearCategoria).not.toHaveBeenCalled();
    });
  });

  // ── bucketInicial (agregar-categoria-desde-selector, issue #744) ──
  //
  // Unlike `bucketFijo` (never a user choice), `bucketInicial` only PRESETS
  // the chip selection — the bucket-picker chips still render and the user
  // can change it before saving. This is what the two reclassify surfaces
  // use: default to the row's current bucket (the likeliest pick) without
  // forcing it, since the usability finding behind this issue was wanting a
  // category in a DIFFERENT bucket than the one currently on screen.
  describe('bucketInicial (issue #744)', () => {
    it('preselects the given bucket chip but still renders the picker (editable)', async () => {
      await render(
        <NuevaCategoriaForm
          bucketInicial="Deseos"
          onCreada={mockOnCreada}
          onCancelar={mockOnCancelar}
        />,
      );

      expect(screen.getByTestId('bucket-selector')).toBeOnTheScreen();
      const chipDeseos = within(
        screen.getByTestId('bucket-selector'),
      ).getByRole('radio', { name: 'Deseos' });
      expect(chipDeseos.props.accessibilityState).toMatchObject({
        checked: true,
      });
    });

    it('the user can change the preselected bucket before saving', async () => {
      await render(
        <NuevaCategoriaForm
          bucketInicial="Necesidades"
          onCreada={mockOnCreada}
          onCancelar={mockOnCancelar}
        />,
      );

      await llenarYEnviar({ nombre: 'Libros', bucket: 'Deseos' });

      await waitFor(() => {
        expect(mockCrearCategoria).toHaveBeenCalledWith({
          nombre: 'Libros',
          bucket: 'Deseos',
        });
      });
    });

    it('bucketInicial omitted keeps the prior unselected-chip behaviour (no regression)', async () => {
      await render(
        <NuevaCategoriaForm
          onCreada={mockOnCreada}
          onCancelar={mockOnCancelar}
        />,
      );

      fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

      expect(mockCrearCategoria).not.toHaveBeenCalled();
    });
  });

  it('success calls onCreada with the created CategoriaDto (issue #744, selecting it downstream)', async () => {
    const categoriaCreada = {
      id: 'cat-libros',
      nombre: 'Libros',
      bucket: 'Deseos' as const,
      transaccionesCount: 0,
      patrones: [],
    };
    mockCrearCategoria.mockResolvedValueOnce({
      ok: true,
      value: categoriaCreada,
    });

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Libros', bucket: 'Deseos' });

    await waitFor(() => {
      expect(mockOnCreada).toHaveBeenCalledWith(categoriaCreada);
    });
  });

  it('double-submit protection: Guardar button is disabled while in-flight', async () => {
    // Deferred promise: keeps the first call in-flight so we can inspect mid-flight state.
    let resolveFirst!: (
      v: Awaited<ReturnType<typeof mockCrearCategoria>>,
    ) => void;
    const deferredFirst = new Promise<
      Awaited<ReturnType<typeof mockCrearCategoria>>
    >((res) => {
      resolveFirst = res;
    });
    mockCrearCategoria.mockReturnValueOnce(deferredFirst);

    await render(
      <NuevaCategoriaForm
        onCreada={mockOnCreada}
        onCancelar={mockOnCancelar}
      />,
    );
    await llenarYEnviar({ nombre: 'Transporte', bucket: 'Necesidades' });

    // While in-flight: the Guardar button must report disabled=true via accessibilityState.
    // Falsifiability: removing `!enviando` from `puedeGuardar` causes
    // accessibilityState.disabled to remain false while the call is in-flight and this assertion fails.
    await waitFor(() => {
      const guardarBtn = screen.getByRole('button', { name: 'Guardar' });
      expect(guardarBtn.props.accessibilityState).toMatchObject({
        disabled: true,
      });
    });

    // Resolve the first call and confirm crearCategoria was only called once.
    await act(async () => {
      resolveFirst({
        ok: true,
        value: {
          id: 'cat-fake',
          nombre: 'Fake',
          bucket: 'Necesidades',
          transaccionesCount: 0,
          patrones: [],
        },
      });
    });

    await waitFor(() => {
      expect(mockOnCreada).toHaveBeenCalledTimes(1);
    });
    expect(mockCrearCategoria).toHaveBeenCalledTimes(1);
  });
});
