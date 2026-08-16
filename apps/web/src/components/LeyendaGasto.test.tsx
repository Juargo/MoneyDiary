import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeyendaGasto } from './LeyendaGasto';
import type { ItemLeyenda } from '@/domain/resumen-view-model';

// US-047 (design D-03/D-08): the legend now takes two ordered
// `ItemLeyenda[]` groups instead of one flat `LeyendaTajada[]` — a
// structural divider sits between them (viewport-conditional, D-09/T13
// owns the Playwright visibility proof; this file only proves the element
// exists at the right DOM position). The accessible name is now
// content-derived (the row's own visible text), not a bucket-only
// `aria-label` (R-8/D-08 deliberate removal).
const principales: ReadonlyArray<ItemLeyenda> = [
  {
    kind: 'gasto',
    bucket: 'Necesidades',
    porcentaje: 42,
    montoLabel: '-$624.500',
  },
  { kind: 'gasto', bucket: 'Deseos', porcentaje: 30, montoLabel: '-$450.000' },
  { kind: 'gasto', bucket: 'Ahorro', porcentaje: 20, montoLabel: '-$300.000' },
];
const complemento: ReadonlyArray<ItemLeyenda> = [
  { kind: 'ingreso', montoLabel: '+$1.500.000' },
  {
    kind: 'sinCategoria',
    bucket: 'SinCategoria',
    montoLabel: '-$45.000',
    cantidadLabel: '7 tx',
  },
];

function renderLeyenda(
  overrides: Partial<Parameters<typeof LeyendaGasto>[0]> = {},
) {
  return render(
    <LeyendaGasto
      principales={principales}
      complemento={complemento}
      bucketSeleccionado={null}
      onSelectBucket={vi.fn()}
      {...overrides}
    />,
  );
}

describe('LeyendaGasto', () => {
  it('renders three 50/30/20 rows, a separator, then Ingresos and Sin categoría (US-047 WG5-03)', () => {
    renderLeyenda();
    expect(screen.getAllByTestId('leyenda-item')).toHaveLength(5);
  });

  it('each spend-bucket row announces name, percentage, and amount via a content-derived accessible name (US-047 D-08, aria-label removed)', () => {
    renderLeyenda();
    expect(
      screen.getByRole('button', { name: 'Necesidades 42% -$624.500' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Gustos 30% -$450.000' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ahorro 20% -$300.000' }),
    ).toBeInTheDocument();
  });

  it('still renders the Ingresos row when there is no spending (US-047 D-08, no longer returns null)', () => {
    render(
      <LeyendaGasto
        principales={[]}
        complemento={complemento}
        bucketSeleccionado={null}
        onSelectBucket={vi.fn()}
      />,
    );
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getAllByTestId('leyenda-item')).toHaveLength(2);
  });

  it('the Ingresos row has no % and is not a button or other interactive/focusable control (US-047 CA-04/WG5-06)', () => {
    renderLeyenda();
    const filaIngresos = screen.getByText('Ingresos').closest('li');
    expect(filaIngresos).not.toBeNull();
    expect(filaIngresos?.querySelector('button')).toBeNull();
    expect(filaIngresos?.textContent).not.toContain('%');
    expect(
      screen.queryByRole('button', { name: /Ingresos/ }),
    ).not.toBeInTheDocument();
  });

  it('spend-bucket amounts start with "-", the Ingresos amount starts with "+" (US-047 WG5-04)', () => {
    renderLeyenda();
    expect(screen.getByText('-$624.500')).toBeInTheDocument();
    expect(screen.getByText('+$1.500.000')).toBeInTheDocument();
  });

  it('the Sin categoría row IS a button and shows its transaction count, amount, and chevron, activating the same drill-down (US-047 WG5-03)', () => {
    const onSelectBucket = vi.fn();
    renderLeyenda({ onSelectBucket });
    const boton = screen.getByRole('button', {
      name: 'Sin categoría 7 tx -$45.000',
    });
    expect(boton).toBeInTheDocument();
    fireEvent.click(boton);
    expect(onSelectBucket).toHaveBeenCalledWith('SinCategoria');
  });

  it('the chevron is aria-hidden and never appears in a row accessible name (US-047 WG5-12)', () => {
    renderLeyenda();
    const boton = screen.getByRole('button', {
      name: 'Necesidades 42% -$624.500',
    });
    const chevron = boton.querySelector('svg');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
  });

  it('the separator sits structurally between the two rendered groups (US-047 D-03: two arrays, not a grupo field)', () => {
    renderLeyenda();
    const divisor = screen.getByTestId('leyenda-divisor');
    const filas = screen.getAllByTestId('leyenda-item');
    // Divisor must be AFTER the 3rd row (Ahorro, last principal) and BEFORE
    // the 4th row (Ingresos, first complemento item).
    expect(
      filas[2].compareDocumentPosition(divisor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      filas[3].compareDocumentPosition(divisor) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  // LOCKED — must stay green unmodified (proof these invariants held).
  it('uses the same focus-visible outline color as before (FIX 3, WCAG 1.4.11)', () => {
    renderLeyenda();
    const boton = screen.getByRole('button', {
      name: 'Necesidades 42% -$624.500',
    });
    expect(boton.className).toContain('outline-slate-800');
    expect(boton.className).not.toContain('outline-slate-400');
  });

  it('gives each row a comfortable touch target padding on mobile (Phase 4 mobile audit)', () => {
    renderLeyenda();
    const boton = screen.getByRole('button', {
      name: 'Necesidades 42% -$624.500',
    });
    expect(boton.className).toContain('px-2');
    expect(boton.className).toContain('py-1');
  });

  it('marks the selected bucket row with aria-pressed, others not pressed', () => {
    renderLeyenda({ bucketSeleccionado: 'Ahorro' });
    expect(
      screen.getByRole('button', { name: 'Ahorro 20% -$300.000' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Necesidades 42% -$624.500' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a spend-bucket row reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn();
    renderLeyenda({ onSelectBucket });
    fireEvent.click(
      screen.getByRole('button', { name: 'Gustos 30% -$450.000' }),
    );
    expect(onSelectBucket).toHaveBeenCalledWith('Deseos');
  });
});
