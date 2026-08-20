import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import { IngresosMesPage } from './IngresosMesPage';
import { renderConRouter } from '@/test/router-harness';
import type { ApiError } from '@/api/client';
import type { IngresosMesDto } from '@/api/types';

// US-054 T-10 — IngresosMesPage behavior ledger (design.md §5, D-10):
// 15 cases per spec. Router-agnostic: page receives `query` prop; route owns
// the hook. No catalog prefetch (WDI-06). Back link = raw Link with D-10
// LOCKED classes, NOT BotonVolver (US-053 case law — CA-08 bug class).
//
// `renderConRouter` paints asynchronously (RouterProvider loads the tree
// before any route component mounts), so every test awaits a first findBy*
// before sync assertions — BucketDetalleMesPage.test.tsx discipline.

const DTO_COMPLETO: IngresosMesDto = {
  conteo: 2,
  total: '1250000',
  transacciones: [
    {
      id: 'tx-bci',
      fecha: '2026-07-03',
      descripcion: 'Sueldo BCI',
      origen: 'BCI',
      monto: '1200000',
    },
    {
      id: 'tx-manual',
      fecha: '2026-07-15',
      descripcion: 'Bono navidad',
      origen: 'Manual',
      monto: '50000',
    },
  ],
};

const DTO_MES_VACIO: IngresosMesDto = {
  conteo: 0,
  total: '0',
  transacciones: [],
};

function mockQuery(
  overrides: Partial<UseQueryResult<IngresosMesDto, ApiError>>,
): UseQueryResult<IngresosMesDto, ApiError> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as UseQueryResult<IngresosMesDto, ApiError>;
}

function renderPagina({
  query = mockQuery({ data: DTO_COMPLETO }),
  periodo = '2026-07',
  onPeriodoChange = vi.fn(),
}: {
  query?: UseQueryResult<IngresosMesDto, ApiError>;
  periodo?: string | undefined;
  onPeriodoChange?: (periodo: string) => void;
} = {}) {
  return renderConRouter(
    <IngresosMesPage
      query={query}
      periodo={periodo}
      onPeriodoChange={onPeriodoChange}
    />,
  );
}

describe('IngresosMesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Case 1: loading state (WDI-05)
  it('renders the loading state while the query is pending (WDI-05)', async () => {
    renderPagina({ query: mockQuery({ isPending: true }) });
    expect(await screen.findByText('Cargando ingresos…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // Case 2: error state renders (WDI-05)
  it('renders the error state with a retry button (WDI-05)', async () => {
    const error: ApiError = {
      tag: 'network',
      message: 'Sin conexión.',
    };
    renderPagina({ query: mockQuery({ isError: true, error }) });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // Case 3: retry activates refetch (WDI-05)
  it('calls refetch when the retry button is clicked (WDI-05)', async () => {
    const refetch = vi.fn();
    const error: ApiError = { tag: 'network', message: 'Sin conexión.' };
    renderPagina({ query: mockQuery({ isError: true, error, refetch }) });

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // Case 4: empty month — $0, 0 ingresos, empty copy, NO table (WDI-04)
  it('renders $0 and 0 ingresos for an empty month (WDI-04)', async () => {
    renderPagina({
      query: mockQuery({ data: DTO_MES_VACIO }),
      periodo: '2026-07',
    });
    expect(await screen.findByText(/0 ingresos/)).toBeInTheDocument();
    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // Case 5: empty month empty copy "Sin ingresos en {mes}" (WDI-04)
  it('renders the empty copy "Sin ingresos en julio 2026" for an empty month (WDI-04)', async () => {
    renderPagina({
      query: mockQuery({ data: DTO_MES_VACIO }),
      periodo: '2026-07',
    });
    expect(
      await screen.findByText('Sin ingresos en julio 2026'),
    ).toBeInTheDocument();
  });

  // Case 6: empty month keeps PeriodoSelector operable (WDI-04)
  it('keeps PeriodoSelector operable on an empty month (WDI-04)', async () => {
    const onPeriodoChange = vi.fn();
    renderPagina({
      query: mockQuery({ data: DTO_MES_VACIO }),
      periodo: '2026-07',
      onPeriodoChange,
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mes anterior' }),
    );
    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06');
  });

  // Case 7: header — all elements + static note (WDI-01)
  it('renders the full header with breadcrumb nav, h1, note, and selector (WDI-01)', async () => {
    renderPagina();
    const nav = await screen.findByRole('navigation', { name: 'Ruta' });
    expect(within(nav).getByText('Dashboard')).toBeInTheDocument();
    expect(within(nav).getByText('Ingresos')).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: 'Volver al resumen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Ingresos',
    );
    expect(
      screen.getByText(
        'Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /julio 2026/ }),
    ).toBeInTheDocument();
  });

  // Case 8: deep link honours ?periodo= (WDI-03)
  it('honours the explicit periodo prop for the month label (WDI-03)', async () => {
    renderPagina({ periodo: '2026-03' });
    expect(
      await screen.findByRole('button', { name: /marzo 2026/ }),
    ).toBeInTheDocument();
  });

  // Case 9: absent periodo → current month (WDI-03/MID-04)
  // shouldAdvanceTime is required here because renderConRouter's async
  // RouterProvider needs waitFor's retry timers to fire before the route
  // component mounts. PeriodoSelector.test.tsx uses sync render + getByRole
  // and does not need it. renderConRouter is called directly (not renderPagina)
  // because renderPagina's default `periodo = '2026-07'` swallows undefined
  // before it reaches the component — mirroring the Case 10b pattern.
  // The mocked clock is set to September 2026 (not July) so the assertion is
  // genuinely falsifiable: if undefined were swallowed into '2026-07' the
  // render would show 'julio 2026' and the findByRole would fail.
  describe('when periodo is absent', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('falls back to the current month when periodo is undefined (WDI-03/MID-04)', async () => {
      renderConRouter(
        <IngresosMesPage
          query={mockQuery({ data: DTO_COMPLETO })}
          periodo={undefined}
          onPeriodoChange={vi.fn()}
        />,
      );
      expect(
        await screen.findByRole('button', { name: /septiembre 2026/ }),
      ).toBeInTheDocument();
    });
  });

  // Case 10: back link preserves periodo (WDI-01, D-10)
  it('back link carries the current periodo as search param (WDI-01, D-10)', async () => {
    renderPagina({ periodo: '2026-07' });
    const backLink = await screen.findByRole('link', {
      name: 'Volver al resumen',
    });
    expect(backLink).toHaveAttribute('href', '/?periodo=2026-07');
  });

  // Case 10b: back link when periodo is undefined → href is "/" (TanStack Router
  // strips undefined search params, so no "?periodo=undefined" in the URL).
  // renderPagina defaults periodo to '2026-07', so renderConRouter is called
  // directly here to pass the explicit undefined.
  it('back link href is "/" when periodo is undefined (WDI-01, D-10)', async () => {
    renderConRouter(
      <IngresosMesPage
        query={mockQuery({ data: DTO_COMPLETO })}
        periodo={undefined}
        onPeriodoChange={vi.fn()}
      />,
    );
    const backLink = await screen.findByRole('link', {
      name: 'Volver al resumen',
    });
    expect(backLink).toHaveAttribute('href', '/');
  });

  // Case 11: back control ≥24×24 CSS px + non-empty accname (WDI-01, D-10)
  it('back link has a non-empty accessible name (WDI-01, D-10)', async () => {
    renderPagina();
    const backLink = await screen.findByRole('link', {
      name: 'Volver al resumen',
    });
    // Non-empty accname — the visible text "Volver al resumen" IS the accname (D-10)
    expect(backLink).toHaveAccessibleName('Volver al resumen');
    // D-10 LOCKED classes: py-1 gives ≥24 CSS px target height
    expect(backLink).toHaveClass('py-1');
  });

  // Case 12: onPeriodoChange updates URL (WDI-03)
  it('calls onPeriodoChange when the month selector fires (WDI-03)', async () => {
    const onPeriodoChange = vi.fn();
    renderPagina({ onPeriodoChange });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mes anterior' }),
    );
    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06');
  });

  // Case 13: one h1 (WDI-01)
  it('renders exactly one h1 on the page (WDI-01)', async () => {
    renderPagina();
    await screen.findByRole('heading', { level: 1 });
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
  });

  // Case 14: table renders (WDI-02)
  it('renders the transactions table when data is present (WDI-02)', async () => {
    renderPagina();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  // Case 15: table rows show Origen Badge + +montos in payload order, no re-sort
  // Also: only interactive controls = nav/back/retry and period buttons (WDI-06)
  it('renders Origen Badge and +montos in payload order; no unexpected interactive controls (WDI-02/MID-01/WDI-06)', async () => {
    renderPagina();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');

    // Payload order: BCI first (day 3), Manual second (day 15)
    expect(within(rows[1]).getByText('BCI')).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    expect(within(rows[1]).getByText('+$1.200.000')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Manual')).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    expect(within(rows[2]).getByText('+$50.000')).toBeInTheDocument();

    // Only interactive controls: period buttons (prev/next/Hoy/cambiar) + back link
    // No comboboxes (reclassify), no extra buttons (WDI-06)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // PeriodoSelector (closed): prev (1) + month-picker trigger (2) + next (3) + Hoy (4)
    // Page success state: no retry button (renders only in error state)
    // Total buttons = 4; total links = 1 (back link "Volver al resumen")
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
