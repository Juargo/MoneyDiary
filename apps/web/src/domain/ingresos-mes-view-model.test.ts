import { afterEach, describe, expect, it, vi } from 'vitest';
import { aIngresosMesViewModel } from './ingresos-mes-view-model';
import type { IngresosMesDto } from '../api/types';

const transaccionesBase: IngresosMesDto['transacciones'] = [
  {
    id: 'tx-1',
    fecha: '2026-07-03T00:00:00.000Z',
    descripcion: 'Sueldo',
    monto: '1000000',
    origen: 'BCI',
  },
  {
    id: 'tx-2',
    fecha: '2026-07-15T00:00:00.000Z',
    descripcion: 'Venta garage',
    monto: '200000',
    origen: 'Manual',
  },
];

function dto(overrides: Partial<IngresosMesDto> = {}): IngresosMesDto {
  return {
    conteo: 2,
    total: '1200000',
    transacciones: transaccionesBase,
    ...overrides,
  };
}

// US-054 (T-07, WDI-06/ADR-024): pure passthrough view-model — labels and
// formatting only; `dto.transacciones` order is the wire's, verbatim.
describe('aIngresosMesViewModel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives mesLabel from the given periodo (WDI-01, MID-01: the wire carries no periodo echo)', () => {
    const viewModel = aIngresosMesViewModel(dto(), '2026-07');

    expect(viewModel.mesLabel).toBe('julio 2026');
  });

  it('defaults mesLabel to the current calendar month when periodo is absent (MID-04)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));

    const viewModel = aIngresosMesViewModel(dto(), undefined);

    expect(viewModel.mesLabel).toBe('agosto 2026');
  });

  it('formats conteoLabel with the singular/plural rule (D-03, WCTG-03 precedent)', () => {
    expect(
      aIngresosMesViewModel(dto({ conteo: 1 }), '2026-07').conteoLabel,
    ).toBe('1 ingreso');
    expect(
      aIngresosMesViewModel(dto({ conteo: 2 }), '2026-07').conteoLabel,
    ).toBe('2 ingresos');
    expect(
      aIngresosMesViewModel(dto({ conteo: 0 }), '2026-07').conteoLabel,
    ).toBe('0 ingresos');
  });

  it('formats totalLabel with a positive sign via formatearMontoConSigno (WDI-01, WG5-04)', () => {
    const viewModel = aIngresosMesViewModel(
      dto({ total: '1500000' }),
      '2026-07',
    );

    expect(viewModel.totalLabel).toBe('+$1.500.000');
  });

  it('formats each row montoLabel with a positive sign (MID-05)', () => {
    const viewModel = aIngresosMesViewModel(dto(), '2026-07');

    expect(viewModel.filas[0].montoLabel).toBe('+$1.000.000');
    expect(viewModel.filas[1].montoLabel).toBe('+$200.000');
  });

  it('formats each row fechaLabel via aFechaCorta (D-02)', () => {
    const viewModel = aIngresosMesViewModel(dto(), '2026-07');

    expect(viewModel.filas.map((fila) => fila.fechaLabel)).toEqual([
      '2026-07-03',
      '2026-07-15',
    ]);
  });

  it('passes origen verbatim — bank name or Manual (MID-02, CA-02)', () => {
    const viewModel = aIngresosMesViewModel(dto(), '2026-07');

    expect(viewModel.filas.map((fila) => fila.origen)).toEqual([
      'BCI',
      'Manual',
    ]);
    expect(viewModel.filas.map((fila) => fila.descripcion)).toEqual([
      'Sueldo',
      'Venta garage',
    ]);
  });

  it('keeps rows in the payload order verbatim (day-3 then day-15)', () => {
    const viewModel = aIngresosMesViewModel(dto(), '2026-07');

    expect(viewModel.filas.map((fila) => fila.id)).toEqual(['tx-1', 'tx-2']);
  });

  it('never re-sorts: a payload ordered day-15 then day-3 renders in that exact order (WDI-06, MID-01)', () => {
    const desordenado = dto({
      transacciones: [transaccionesBase[1], transaccionesBase[0]],
    });

    const viewModel = aIngresosMesViewModel(desordenado, '2026-07');

    expect(viewModel.filas.map((fila) => fila.id)).toEqual(['tx-2', 'tx-1']);
    expect(viewModel.filas[0].fechaLabel).toBe('2026-07-15');
  });

  it('maps an empty month to zero labels and no rows (WDI-04)', () => {
    const viewModel = aIngresosMesViewModel(
      dto({ conteo: 0, total: '0', transacciones: [] }),
      '2026-07',
    );

    expect(viewModel.totalLabel).toBe('$0');
    expect(viewModel.conteoLabel).toBe('0 ingresos');
    expect(viewModel.filas).toEqual([]);
  });
});
