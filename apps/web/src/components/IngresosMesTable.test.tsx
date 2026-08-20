import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IngresosMesTable } from './IngresosMesTable';
import { renderConRouter } from '@/test/router-harness';
import type { IngresosMesViewModel } from '@/domain/ingresos-mes-view-model';

// US-054 T-09 — IngresosMesTable behavior ledger (design.md §5, D-04):
// Semantic <table> with <caption>, 4 × <th scope="col">, rows keyed by id,
// Origen Badge (secondary variant), +monto sign, payload order verbatim.
// a11y: role/scope/accname assertions (D-09 form — no vitest-axe dep, D-09).
//
// `renderConRouter` paints asynchronously (RouterProvider loads the tree
// before any route component mounts), so every test awaits a first findBy*
// before sync assertions — same discipline as BucketDetalleMesPage.test.tsx.

const FILAS_FIXTURE: IngresosMesViewModel['filas'] = [
  {
    id: 'tx-bci',
    fechaLabel: '2026-07-03',
    descripcion: 'Sueldo BCI',
    origen: 'BCI',
    montoLabel: '+$1.200.000',
  },
  {
    id: 'tx-manual',
    fechaLabel: '2026-07-15',
    descripcion: 'Bono navidad',
    origen: 'Manual',
    montoLabel: '+$50.000',
  },
];

function renderTabla(filas: IngresosMesViewModel['filas'] = FILAS_FIXTURE) {
  renderConRouter(<IngresosMesTable mes="julio 2026" filas={filas} />);
}

describe('IngresosMesTable', () => {
  it('renders a table element (semantic table role)', async () => {
    renderTabla();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('renders four column headers each with scope="col"', async () => {
    renderTabla();
    const table = await screen.findByRole('table');
    const columnHeaders = within(table).getAllByRole('columnheader');
    expect(columnHeaders).toHaveLength(4);
    columnHeaders.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
    expect(columnHeaders.map((th) => th.textContent)).toEqual([
      'Fecha',
      'Descripción',
      'Origen',
      'Monto',
    ]);
  });

  it('has an accessible caption naming the table with the month (a11y, D-04)', async () => {
    renderTabla();
    // <caption className="sr-only"> provides the table's accessible name
    expect(
      await screen.findByRole('table', { name: 'Ingresos de julio 2026' }),
    ).toBeInTheDocument();
  });

  it('renders rows verbatim in the payload order (MID-01, WDI-06)', async () => {
    renderTabla();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // Row 0 = header; rows 1+ = data rows
    expect(rows[1]).toHaveTextContent('2026-07-03');
    expect(rows[1]).toHaveTextContent('Sueldo BCI');
    expect(rows[2]).toHaveTextContent('2026-07-15');
    expect(rows[2]).toHaveTextContent('Bono navidad');
  });

  it('renders the Origen cell as a Badge with secondary variant for BCI and Manual (MID-02, D-04)', async () => {
    renderTabla();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');

    // BCI row — Badge secondary
    const bciOrigenCell = within(rows[1]).getAllByRole('cell')[2];
    const bciBadge = within(bciOrigenCell).getByText('BCI');
    expect(bciBadge).toHaveAttribute('data-variant', 'secondary');

    // Manual row — Badge secondary
    const manualOrigenCell = within(rows[2]).getAllByRole('cell')[2];
    const manualBadge = within(manualOrigenCell).getByText('Manual');
    expect(manualBadge).toHaveAttribute('data-variant', 'secondary');
  });

  it('renders monto with "+" prefix sign for positive income rows (MID-05, D-04)', async () => {
    renderTabla();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');

    expect(within(rows[1]).getByText('+$1.200.000')).toBeInTheDocument();
    expect(within(rows[2]).getByText('+$50.000')).toBeInTheDocument();
  });

  it('exposes one row per fila under the semantic table structure (D-09)', async () => {
    renderTabla();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
  });
});
