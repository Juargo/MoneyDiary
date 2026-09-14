/**
 * HojaClasificacion spec — Phase 7 RED (design.md D-06; MOB-PRV-07/11).
 *
 * Naming deviation from tasks.md (recorded there too, same as PR4/PR5):
 * this repo's mobile tests use `*.spec.tsx`, matching every existing file
 * under `src/components/`.
 *
 * No screen consumer yet — `subir.tsx`'s `revisando` state wires this in
 * Phase 8. Tested in isolation: `grupos` and `categoriaActualId` are passed
 * directly (design's fetch-ownership decision: the screen fetches the
 * catalog once and groups it, this sheet stays presentational).
 */

import { render, screen, fireEvent, act } from '@testing-library/react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { HojaClasificacion } from './HojaClasificacion';
import type { GrupoCategoriaPorBucket } from '../../domain/agrupar-categorias-por-bucket';
import type { EdicionFila } from '../../api/commit-ingesta';

function filaDePreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 3,
    fecha: '2026-09-01T00:00:00.000Z',
    descripcion: 'Compra Jumbo',
    cargo: '15000',
    abono: '0',
    esDuplicado: false,
    sugerido: { bucket: 'Deseos', categoriaId: 'cat-ocio' },
    ...overrides,
  };
}

function gruposDePrueba(): readonly GrupoCategoriaPorBucket[] {
  return [
    {
      bucket: 'Necesidades',
      categorias: [
        {
          id: 'cat-arriendo',
          nombre: 'Arriendo',
          bucket: 'Necesidades',
          transaccionesCount: 3,
          patrones: [],
        },
      ],
    },
    {
      bucket: 'Deseos',
      categorias: [
        {
          id: 'cat-ocio',
          nombre: 'Ocio',
          bucket: 'Deseos',
          transaccionesCount: 1,
          patrones: [],
        },
        {
          id: 'cat-comida-fuera',
          nombre: 'Comida fuera',
          bucket: 'Deseos',
          transaccionesCount: 2,
          patrones: [],
        },
      ],
    },
    // Ahorro intentionally omitted (empty bucket) — mirrors agruparPorBucket
    // dropping empty groups, and pins "BUCKETS_ASIGNABLES with categorías".
  ];
}

function defaultProps(
  overrides?: Partial<Parameters<typeof HojaClasificacion>[0]>,
) {
  return {
    visible: true,
    fila: filaDePreview(),
    categoriaActualId: null,
    grupos: gruposDePrueba(),
    onConfirmar: jest.fn<void, [EdicionFila]>(),
    onCancelar: jest.fn<void, []>(),
    ...overrides,
  };
}

describe('HojaClasificacion', () => {
  it('renders nothing when visible=false', async () => {
    await render(<HojaClasificacion {...defaultProps({ visible: false })} />);

    expect(screen.queryByTestId('hoja-clasificacion')).toBeNull();
  });

  it('shows the target row context and a bucket radiogroup limited to BUCKETS_ASIGNABLES with categorías', async () => {
    await render(<HojaClasificacion {...defaultProps()} />);

    // Row context (the "target row" prop, MOB-PRV-11 row identification).
    expect(screen.getByText('Compra Jumbo')).toBeOnTheScreen();
    expect(screen.getByText('2026-09-01')).toBeOnTheScreen();

    // Necesidades + Gustos (Deseos' display label) present, Ahorro absent —
    // Ahorro has no categorías in this fixture.
    expect(
      screen.getByRole('radio', { name: 'Necesidades' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Gustos' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Ahorro' })).toBeNull();

    // No bucket selected yet — the categoría radiogroup is empty.
    expect(screen.queryAllByTestId(/^hoja-categoria-/)).toHaveLength(0);
  });

  it('selecting a bucket filters the categoría radiogroup to that bucket (MOB-PRV-07)', async () => {
    await render(<HojaClasificacion {...defaultProps()} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Gustos' }));
    });

    expect(screen.getByRole('radio', { name: 'Ocio' })).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Comida fuera' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Arriendo' })).toBeNull();
  });

  it('Confirmar is disabled until a categoría is selected, then enabled', async () => {
    await render(<HojaClasificacion {...defaultProps()} />);

    expect(
      screen.getByTestId('hoja-confirmar').props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Gustos' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Ocio' }));
    });

    expect(
      screen.getByTestId('hoja-confirmar').props.accessibilityState,
    ).toMatchObject({
      disabled: false,
    });
  });

  it('confirming emits {rowIndex, categoriaId} for the selected categoría and never calls onCancelar', async () => {
    const onConfirmar = jest.fn<void, [EdicionFila]>();
    const onCancelar = jest.fn<void, []>();
    await render(
      <HojaClasificacion {...defaultProps({ onConfirmar, onCancelar })} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Gustos' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Comida fuera' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('hoja-confirmar'));
    });

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).toHaveBeenCalledWith({
      rowIndex: 3,
      categoriaId: 'cat-comida-fuera',
    });
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('pressing Confirmar while disabled (no categoría chosen) never emits', async () => {
    const onConfirmar = jest.fn<void, [EdicionFila]>();
    await render(<HojaClasificacion {...defaultProps({ onConfirmar })} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('hoja-confirmar'));
    });

    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('Cancelar closes without emitting, even after making a selection', async () => {
    const onConfirmar = jest.fn<void, [EdicionFila]>();
    const onCancelar = jest.fn<void, []>();
    await render(
      <HojaClasificacion {...defaultProps({ onConfirmar, onCancelar })} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Necesidades' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('hoja-cancelar'));
    });

    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('preselects both radiogroups from categoriaActualId (the current categoría) when it opens', async () => {
    await render(
      <HojaClasificacion
        {...defaultProps({ categoriaActualId: 'cat-comida-fuera' })}
      />,
    );

    expect(
      screen.getByRole('radio', { name: 'Gustos' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByRole('radio', { name: 'Comida fuera' }).props
        .accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('reopening for a different row does not leak the previous row’s selection', async () => {
    const filaA = filaDePreview({ rowIndex: 3 });
    const filaB = filaDePreview({ rowIndex: 9 });

    const { rerender } = await render(
      <HojaClasificacion
        {...defaultProps({
          visible: true,
          fila: filaA,
          categoriaActualId: null,
        })}
      />,
    );

    // Manually select a categoría for row A, unrelated to row B's eventual state.
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Necesidades' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Arriendo' }));
    });

    // Close, then reopen for a different row with its own current categoría.
    await rerender(
      <HojaClasificacion
        {...defaultProps({
          visible: false,
          fila: filaA,
          categoriaActualId: null,
        })}
      />,
    );
    await rerender(
      <HojaClasificacion
        {...defaultProps({
          visible: true,
          fila: filaB,
          categoriaActualId: 'cat-ocio',
        })}
      />,
    );

    expect(
      screen.getByRole('radio', { name: 'Ocio' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    // Row A's stale Necesidades/Arriendo selection is gone — the categoría
    // radiogroup now reflects row B's own bucket (Deseos), not a leftover.
    expect(screen.queryByRole('radio', { name: 'Arriendo' })).toBeNull();
  });

  it('exposes accessible labels identifying each field (ADR-018, MOB-PRV-11)', async () => {
    await render(<HojaClasificacion {...defaultProps()} />);

    expect(screen.getByTestId('hoja-bucket')).toHaveProp(
      'accessibilityLabel',
      'Bucket',
    );
    expect(screen.getByTestId('hoja-categoria')).toHaveProp(
      'accessibilityLabel',
      'Categoría',
    );
    expect(screen.getByTestId('hoja-cancelar')).toHaveProp(
      'accessibilityLabel',
      'Cancelar',
    );
    expect(screen.getByTestId('hoja-confirmar')).toHaveProp(
      'accessibilityLabel',
      'Confirmar',
    );
  });
});
