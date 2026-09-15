import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { GrupoMovimientos } from './GrupoMovimientos';
import { resetUndoManagerParaTests } from '@/lib/undo-manager';
import type { GrupoDetalleMesViewModel } from '@/domain/detalle-bucket-mes-view-model';
import type { CatalogoDto } from '@/api/types';

/**
 * GrupoMovimientos.test.tsx — US-055 T-05 (design §5, tasks.md ledger).
 *
 * Scope: the `onMovida` thread (D-07). The primary falsifiability check
 * proves that `onMovida` is forwarded to `ReclasificarCategoriaControl`
 * and fires on a cross-bucket confirm — i.e. the prop is wired, not
 * silently dropped. Full control behavior is covered in
 * `ReclasificarCategoriaControl.test.tsx`.
 *
 * The harness mocks `GET /api/categorias` (required by every mounted
 * `ReclasificarCategoriaControl`) and the reclassify PATCH — same two-URL
 * pattern as `ReclasificarCategoriaControl.test.tsx`.
 */

// The 2 seed categorías needed for a cross-bucket test:
// - Supermercado (Necesidades) — the current row categoría
// - Streaming (Deseos) — the destination for the cross-bucket move
const CATALOGO_FIXTURE: CatalogoDto = {
  categorias: [
    {
      id: 'cat-supermercado',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-streaming',
      nombre: 'Streaming',
      bucket: 'Deseos',
      patrones: [],
      transaccionesCount: 0,
    },
    {
      id: 'cat-ahorro',
      nombre: 'Ahorro',
      bucket: 'Ahorro',
      patrones: [],
      transaccionesCount: 0,
    },
  ],
};

const RECLASIFICAR_DTO = {
  id: 'tx-1',
  categoria: { id: 'cat-streaming', nombre: 'Streaming' },
  bucket: 'Deseos',
};

function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

function mockFetch() {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/categorias') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(CATALOGO_FIXTURE),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(RECLASIFICAR_DTO),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const GRUPO_FIXTURE: GrupoDetalleMesViewModel = {
  categoriaId: 'cat-supermercado',
  nombre: 'Supermercado',
  subtotalLabel: '$10.000',
  conteo: 1,
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-01',
      descripcion: 'Compra en Líder',
      origen: 'BCI',
      montoLabel: '$10.000',
    },
  ],
};

// Accordion helper (bucket-detalle-acordeon): every group renders collapsed
// unless `destacar` is true, so a test that queries a row/control directly
// must expand the group's own heading trigger first. Every test in this
// suite renders exactly one group, so the sole heading button is
// unambiguous.
function expandirGrupo() {
  const heading = screen.getByRole('heading', { level: 2 });
  fireEvent.click(within(heading).getByRole('button'));
}

describe('GrupoMovimientos', () => {
  afterEach(() => {
    // Design-hardening change (undo grace window): `undo-manager.ts` is a
    // module singleton — a delete scheduled in one test stays pending
    // (hiding its row via `usePendingIds()`) into the next test otherwise.
    resetUndoManagerParaTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── WEB-DEL-01: delete affordance (SDD correccion-movimientos-manuales PR 3) ──

  it('renders EliminarMovimientoControl only for the manual-origin row, formatting fecha via aFechaCorta at the call site (WDM-03)', async () => {
    mockFetch();
    const grupoConManual: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      transacciones: [
        ...GRUPO_FIXTURE.transacciones,
        {
          id: 'tx-2',
          fecha: '2026-07-05T00:00:00.000Z',
          descripcion: 'Bono manual',
          origen: 'Manual',
          montoLabel: '$20.000',
        },
      ],
    };

    render(
      <GrupoMovimientos
        grupo={grupoConManual}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    await screen.findByLabelText('Bucket y categoría de Compra en Líder');

    expect(
      screen.getByRole('button', {
        name: /Eliminar movimiento Bono manual \(2026-07-05\)/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Eliminar movimiento Compra en Líder/i,
      }),
    ).not.toBeInTheDocument();
  });

  // Display-consistency follow-up named BY NAME in `domain/fecha.ts`'s
  // `aFechaCorta` docblock: "el raw-ISO de la página gemela US-053
  // (GrupoMovimientos.tsx:69) es un follow-up de consistencia de display
  // (renderiza aFechaCorta, NO byte-idéntico)". Until now the visible date
  // column rendered `tx.fecha` verbatim, so a backend UTC timestamp showed as
  // "2026-07-05T00:00:00.000Z" in the row while the delete control beside it
  // — already routed through `aFechaCorta` — said "2026-07-05". One row, two
  // spellings of one date.
  //
  // Scoped with `within` to the row's own listitem on purpose: asserting on
  // the whole screen would also see the delete button's accessible name,
  // which has always carried the short form and so cannot fail.
  it('renders the visible date column via aFechaCorta, never the raw ISO timestamp (fecha.ts follow-up)', async () => {
    mockFetch();
    const grupoConIso: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      transacciones: [
        {
          id: 'tx-iso',
          fecha: '2026-07-05T00:00:00.000Z',
          descripcion: 'Bono manual',
          origen: 'Manual',
          montoLabel: '$20.000',
        },
      ],
    };

    render(
      <GrupoMovimientos
        grupo={grupoConIso}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const fila = await screen.findByRole('listitem');
    expect(within(fila).getByText('2026-07-05')).toBeInTheDocument();
    expect(
      within(fila).queryByText('2026-07-05T00:00:00.000Z'),
    ).not.toBeInTheDocument();
  });

  it('confirming a delete calls onEliminado (parent owns the announcement)', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(CATALOGO_FIXTURE),
        });
      }
      return Promise.resolve({ ok: true, status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onEliminado = vi.fn();
    const grupoConManual: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      transacciones: [
        {
          id: 'tx-2',
          fecha: '2026-07-05',
          descripcion: 'Bono manual',
          origen: 'Manual',
          montoLabel: '$20.000',
        },
      ],
    };
    const user = userEvent.setup();

    render(
      <GrupoMovimientos
        grupo={grupoConManual}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        onMovida={vi.fn()}
        onEliminado={onEliminado}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    await user.click(
      await screen.findByRole('button', {
        name: /Eliminar movimiento Bono manual/i,
      }),
    );
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onEliminado).toHaveBeenCalledTimes(1));
  });

  it('esDemo disables the delete trigger on the manual row', async () => {
    mockFetch();
    const grupoConManual: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      transacciones: [
        {
          id: 'tx-2',
          fecha: '2026-07-05',
          descripcion: 'Bono manual',
          origen: 'Manual',
          montoLabel: '$20.000',
        },
      ],
    };

    render(
      <GrupoMovimientos
        grupo={grupoConManual}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        onMovida={vi.fn()}
        esDemo
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    expect(
      await screen.findByRole('button', {
        name: /Eliminar movimiento Bono manual/i,
      }),
    ).toBeDisabled();
  });

  it('threads onMovida to ReclasificarCategoriaControl and fires it on a cross-bucket confirm (D-07)', async () => {
    mockFetch();
    const onMovida = vi.fn();
    const user = userEvent.setup();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    // Wait for the catalog to load and the select to be enabled.
    const select = await screen.findByLabelText(
      'Bucket y categoría de Compra en Líder',
    );
    await waitFor(() => expect(select).not.toBeDisabled());

    // Pick a cross-bucket categoría (Streaming — Deseos). The option text is
    // now "Gustos · Streaming" (bucket prefix, reclasificar-bucket-y-categoria).
    await user.selectOptions(select as HTMLSelectElement, 'Gustos · Streaming');
    // Confirm the cross-bucket dialog.
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    // The onMovida spy must have fired once with the LABEL for Deseos ('Gustos').
    // This proves the prop is forwarded through GrupoMovimientos — not dropped.
    await waitFor(() => expect(onMovida).toHaveBeenCalledTimes(1));
    expect(onMovida).toHaveBeenCalledWith('Gustos');
  });

  it('passes categoriaActual as { id, nombre } — id from grupo.categoriaId, nombre from grupo.nombre (D-07)', async () => {
    // Forces the mid-flight fallback branch inside
    // ReclasificarCategoriaControl (catalog not loaded yet), which renders
    // exactly one <option> sourced straight from the `categoriaActual` prop
    // — the direct, unambiguous way to prove this caller passes an
    // `{ id, nombre }` object, not the bare `grupo.nombre` string a
    // fallback-to-first-option quirk could otherwise mask post-load.
    let resolverCatalogo: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/categorias') {
        return new Promise((resolve) => {
          resolverCatalogo = resolve;
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(RECLASIFICAR_DTO),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const select = screen.getByLabelText(
      'Bucket y categoría de Compra en Líder',
    ) as HTMLSelectElement;

    // GRUPO_FIXTURE.categoriaId is 'cat-supermercado' — the sole mid-flight
    // <option>'s value must be that exact id, sourced from
    // `categoriaActual.id`, not the group's bare `nombre` string.
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(select.value).toBe('cat-supermercado');
    expect(select).toHaveTextContent('Supermercado');

    resolverCatalogo({
      ok: true,
      status: 200,
      json: () => Promise.resolve(CATALOGO_FIXTURE),
    });
    await waitFor(() => expect(select).not.toBeDisabled());
  });
});
