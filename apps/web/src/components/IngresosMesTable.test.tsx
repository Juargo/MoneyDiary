import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { IngresosMesTable } from './IngresosMesTable';
import { renderConRouter } from '@/test/router-harness';
import {
  deshacerEliminacionPendiente,
  resetUndoManagerParaTests,
} from '@/lib/undo-manager';
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

function renderTabla(
  filas: IngresosMesViewModel['filas'] = FILAS_FIXTURE,
  props: { readonly esDemo?: boolean; readonly onEliminado?: () => void } = {},
) {
  renderConRouter(
    <IngresosMesTable mes="julio 2026" filas={filas} {...props} />,
  );
}

describe('IngresosMesTable', () => {
  it('renders a table element (semantic table role)', async () => {
    renderTabla();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('renders five column headers each with scope="col" (WEB-DEL-01 adds Acciones)', async () => {
    renderTabla();
    const table = await screen.findByRole('table');
    const columnHeaders = within(table).getAllByRole('columnheader');
    expect(columnHeaders).toHaveLength(5);
    columnHeaders.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
    expect(columnHeaders.map((th) => th.textContent)).toEqual([
      'Fecha',
      'Descripción',
      'Origen',
      'Monto',
      'Acciones',
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

  // ── WEB-DEL-01: delete affordance, manual rows only ──────────────────────

  describe('delete affordance (WEB-DEL-01)', () => {
    afterEach(() => {
      resetUndoManagerParaTests();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('renders EliminarMovimientoControl only on the Manual row, not on the BCI row', async () => {
      renderTabla();
      const table = await screen.findByRole('table');
      expect(
        within(table).getByRole('button', {
          name: /Eliminar movimiento Bono navidad/i,
        }),
      ).toBeInTheDocument();
      expect(
        within(table).queryByRole('button', {
          name: /Eliminar movimiento Sueldo BCI/i,
        }),
      ).not.toBeInTheDocument();
    });

    it('confirming a delete calls onEliminado with the row id (parent owns the announcement)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 204 }),
      );
      const onEliminado = vi.fn();
      const user = userEvent.setup();
      renderTabla(FILAS_FIXTURE, { onEliminado });

      await user.click(
        await screen.findByRole('button', {
          name: /Eliminar movimiento Bono navidad/i,
        }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => expect(onEliminado).toHaveBeenCalledTimes(1));
    });

    it('esDemo disables the delete trigger on the manual row', async () => {
      renderTabla(FILAS_FIXTURE, { esDemo: true });

      expect(
        await screen.findByRole('button', {
          name: /Eliminar movimiento Bono navidad/i,
        }),
      ).toBeDisabled();
    });

    // Design-hardening change (undo grace window, resolves critique P1):
    // confirming hides the row immediately (optimistic) — before this
    // change the row only left the DOM once the DELETE actually resolved.
    it('confirming a delete hides the row immediately, and undo brings it back', async () => {
      const user = userEvent.setup();
      renderTabla();
      const table = await screen.findByRole('table');

      await user.click(
        within(table).getByRole('button', {
          name: /Eliminar movimiento Bono navidad/i,
        }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(within(table).queryByText('Bono navidad')).not.toBeInTheDocument();
      // The other row is untouched.
      expect(within(table).getByText('Sueldo BCI')).toBeInTheDocument();

      act(() => {
        deshacerEliminacionPendiente();
      });

      expect(
        await within(table).findByText('Bono navidad'),
      ).toBeInTheDocument();
    });
  });
});
