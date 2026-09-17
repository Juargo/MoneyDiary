/**
 * IngresosMesLista.spec.tsx — bucket-detalle-lista-rediseño mobile port
 * (Cambio 4). First spec for this component (ripgrep-verified: none existed
 * before this change).
 *
 * Scope: the fecha cell now shares `CeldaFecha` with `GrupoMovimientosMobile`
 * (visual parity between the two mobile lists) and the monto carries
 * `fontVariant: ['tabular-nums']`. Origen/descripción/read-only behavior are
 * unchanged and not re-tested here.
 */

import { render, screen, within } from '@testing-library/react-native';
import { IngresosMesLista } from './IngresosMesLista';
import type { IngresosMesFilaViewModel } from '../../domain/ingresos-mes-view-model';

function makeFila(
  overrides: Partial<IngresosMesFilaViewModel> = {},
): IngresosMesFilaViewModel {
  return {
    id: 'ing-1',
    fechaLabel: '2026-07-01',
    diaLabel: '01',
    diaSemanaLabel: 'mié',
    fechaLargaLabel: '1 de julio de 2026',
    descripcion: 'Sueldo',
    origen: 'Banco de Chile',
    montoLabel: '+$1.000.000',
    ...overrides,
  };
}

describe('IngresosMesLista', () => {
  it("renders the fecha cell with the view-model's full Spanish date as accessibilityLabel", async () => {
    await render(<IngresosMesLista filas={[makeFila()]} />);

    expect(screen.getByLabelText('1 de julio de 2026')).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('MIÉ')).toBeTruthy();
  });

  it('renders the monto with tabular-nums fontVariant', async () => {
    await render(<IngresosMesLista filas={[makeFila()]} />);

    const fila = screen.getByTestId('ingreso-fila-ing-1');
    const monto = within(fila).getByText('+$1.000.000');
    const style = Array.isArray(monto.props.style)
      ? Object.assign({}, ...monto.props.style)
      : monto.props.style;
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });

  it('still renders descripción and origen verbatim (unchanged surfaces)', async () => {
    await render(<IngresosMesLista filas={[makeFila()]} />);

    expect(screen.getByText('Sueldo')).toBeTruthy();
    expect(screen.getByText('Banco de Chile')).toBeTruthy();
  });
});
