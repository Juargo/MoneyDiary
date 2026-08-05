import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewMuestra } from './PreviewMuestra';
import type { PreviewTransaccionDto } from '@/api/types';

// PreviewMuestra (`us-003-vista-previa` Slice 2, design.md §9.4) — SRP:
// presentational sample table + 10/25/50 selector. `cantidad` is a
// controlled prop (owned by SubirCartola's state machine, design §9.1) —
// this suite verifies the slicing/formatting/a11y contract in isolation,
// with NO network mocking at all (PREV-06: purely client-side re-slicing).
function unaFila(indice: number): PreviewTransaccionDto {
  return {
    fecha: `2026-07-${String((indice % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    descripcion: `Transacción ${indice + 1}`,
    cargo: '1000',
    abono: '0',
  };
}

describe('PreviewMuestra', () => {
  it('renders banco, totalFilasDatos and each sample row formatted via formatearMontoCLP', () => {
    const muestra: PreviewTransaccionDto[] = [
      {
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Supermercado Líder',
        cargo: '50000',
        abono: '0',
      },
    ];

    render(
      <PreviewMuestra
        muestra={muestra}
        banco="BancoEstado"
        totalFilasDatos={120}
        cantidad={10}
        onCantidadChange={vi.fn()}
      />,
    );

    expect(screen.getByText('BancoEstado')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Supermercado Líder')).toBeInTheDocument();
    expect(screen.getByText('$50.000')).toBeInTheDocument();
  });

  // PREV-06: the selector slices the SAME in-memory muestra, no re-request —
  // this component has no fetch/mutation dependency at all to prove it.
  it('slices to the given cantidad — cantidad=10 on a 15-row muestra shows exactly 10 rows', () => {
    const muestra = Array.from({ length: 15 }, (_, i) => unaFila(i));

    render(
      <PreviewMuestra
        muestra={muestra}
        banco="BancoEstado"
        totalFilasDatos={15}
        cantidad={10}
        onCantidadChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/^Transacción \d+$/)).toHaveLength(10);
    expect(screen.getByText('Transacción 1')).toBeInTheDocument();
    expect(screen.getByText('Transacción 10')).toBeInTheDocument();
    expect(screen.queryByText('Transacción 11')).not.toBeInTheDocument();
  });

  // PREV-06 boundary scenario (spec.md): selecting 25 on a 12-row sample
  // shows all 12 rows, no padding, no error.
  it('cantidad=25 on a 12-row muestra shows all 12 rows without padding or error', () => {
    const muestra = Array.from({ length: 12 }, (_, i) => unaFila(i));

    render(
      <PreviewMuestra
        muestra={muestra}
        banco="BancoEstado"
        totalFilasDatos={12}
        cantidad={25}
        onCantidadChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/^Transacción \d+$/)).toHaveLength(12);
  });

  it('clicking the "25" option calls onCantidadChange(25)', async () => {
    const onCantidadChange = vi.fn();
    const muestra = Array.from({ length: 30 }, (_, i) => unaFila(i));

    render(
      <PreviewMuestra
        muestra={muestra}
        banco="BancoEstado"
        totalFilasDatos={30}
        cantidad={10}
        onCantidadChange={onCantidadChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '25' }));

    expect(onCantidadChange).toHaveBeenCalledTimes(1);
    expect(onCantidadChange).toHaveBeenCalledWith(25);
  });

  it('exposes the current cantidad via aria-pressed on the selector buttons (a11y, not color-only)', () => {
    const muestra = [unaFila(0)];

    render(
      <PreviewMuestra
        muestra={muestra}
        banco="BancoEstado"
        totalFilasDatos={1}
        cantidad={25}
        onCantidadChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: '25' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '50' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // FIX 3 (review, WARNING): a file with 0 data rows (totalFilasDatos: 0)
  // must render a sane, labeled empty state instead of a phantom empty <ul>.
  it('FIX: renders a labeled empty state and no phantom rows when muestra is empty', () => {
    render(
      <PreviewMuestra
        muestra={[]}
        banco="BancoEstado"
        totalFilasDatos={0}
        cantidad={10}
        onCantidadChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/no hay movimientos/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('the selector group has an accessible name (associated label)', () => {
    render(
      <PreviewMuestra
        muestra={[unaFila(0)]}
        banco="BancoEstado"
        totalFilasDatos={1}
        cantidad={10}
        onCantidadChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('group', { name: /filas a mostrar/i }),
    ).toBeInTheDocument();
  });
});
