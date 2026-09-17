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
  icono: null,
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
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    await screen.findByLabelText(
      'Categoría de Compra en Líder: Necesidades · Supermercado',
    );

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
  // bucket-detalle-lista-rediseño (Cambio 3): the visible fecha column no
  // longer goes through `aFechaCorta` — it renders `aDiaConSemana`'s
  // `{ dia, diaSemana }` pair (day + weekday abbreviation, both `aria-hidden`)
  // plus an `sr-only` span carrying `aFechaLargaLabel`'s full Spanish date,
  // never the raw ISO timestamp. 2026-07-05 is a Sunday in UTC.
  //
  // Scoped with `within` to the row's own listitem on purpose: asserting on
  // the whole screen would also see the delete button's accessible name,
  // which has always carried the short form and so cannot fail.
  it('renders the visible date column as day + weekday, with the full date as sr-only, never the raw ISO timestamp', async () => {
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
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const fila = await screen.findByRole('listitem');
    expect(within(fila).getByText('05')).toBeInTheDocument();
    expect(within(fila).getByText('dom')).toBeInTheDocument();
    expect(within(fila).getByText('5 de julio de 2026')).toHaveClass('sr-only');
    expect(
      within(fila).queryByText('2026-07-05T00:00:00.000Z'),
    ).not.toBeInTheDocument();
    expect(within(fila).queryByText('2026-07-05')).not.toBeInTheDocument();
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
        periodoLabel="JUL 2026"
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
        periodoLabel="JUL 2026"
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
        periodoLabel="JUL 2026"
        onMovida={onMovida}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    // Wait for the catalog to load and the select to be enabled.
    const select = await screen.findByLabelText(
      'Categoría de Compra en Líder: Necesidades · Supermercado',
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

  // ── categoria-iconografia (WDM-03, CATICO-06): accordion heading badge ──

  it('renders the group icono as a bucket-colored badge on the heading (WDM-03)', () => {
    mockFetch();
    const grupoConIcono: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      icono: 'shopping-cart',
    };

    render(
      <GrupoMovimientos
        grupo={grupoConIcono}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const heading = screen.getByRole('heading', { level: 2 });
    const glifo = heading.querySelector('svg.lucide-shopping-cart');
    expect(glifo).not.toBeNull();
    expect(glifo).toHaveAttribute('aria-hidden', 'true');
    expect(glifo).toHaveClass('text-pie-etiqueta-necesidades');
  });

  it('a null icono renders the generic fallback badge on the heading (CATICO-06)', () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.querySelector('svg.lucide-tag')).not.toBeNull();
  });

  // The synthetic group carries `icono: null` because MBD-02 makes that a
  // server-side invariant; the client does not special-case it, so this proves
  // the fallback for that shape, not resilience to a spec-violating response.
  it('the synthetic Sin categoría group renders the generic fallback badge', () => {
    mockFetch();
    const sinCategoria: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      categoriaId: null,
      nombre: 'Sin categoría',
      icono: null,
    };

    render(
      <GrupoMovimientos
        grupo={sinCategoria}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.querySelector('svg.lucide-tag')).not.toBeNull();
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
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const select = screen.getByLabelText(
      'Categoría de Compra en Líder: Necesidades · Supermercado',
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

  // ── bucket-detalle-lista-rediseño (Cambio 3): one ledger row per fila ──

  it("the heading's accessible name has no middots between nombre/subtotal/conteo (bucket-detalle-lista-rediseño)", () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Supermercado $10.000 1 movimiento',
      }),
    ).toBeInTheDocument();
  });

  it('renders an aria-hidden column header row (periodoLabel, Descripción, Monto, Categoría) only while expanded', () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    // Collapsed by default (no `destacar`): the column header is hidden
    // along with the row list (same belt-and-braces `hidden` pattern).
    const encabezado = screen.getByText('JUL 2026').closest('div');
    expect(encabezado).not.toBeNull();
    expect(encabezado).toHaveAttribute('aria-hidden', 'true');
    expect(encabezado).not.toBeVisible();
    expect(screen.getByText('Descripción')).not.toBeVisible();
    expect(screen.getByText('Categoría')).not.toBeVisible();

    expandirGrupo();

    expect(screen.getByText('JUL 2026')).toBeVisible();
    expect(screen.getByText('Descripción')).toBeVisible();
    expect(screen.getByText('Categoría')).toBeVisible();
  });

  // bucket-detalle-lista-rediseño (Cambio 5): the manual-origin row's delete
  // trigger renders `compacto` (icon-only, no visible "Eliminar" text) in
  // this ledger — distinct from `IngresosMesTable`'s outline/text mode.
  it('renders the manual-origin delete trigger in compacto (icon-only) mode', async () => {
    mockFetch();
    const grupoConManual: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      transacciones: [
        {
          id: 'tx-manual',
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
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const trigger = await screen.findByRole('button', {
      name: /Eliminar movimiento Bono manual \(2026-07-05\)/i,
    });
    expect(trigger).not.toHaveTextContent('Eliminar');
    expect(trigger.querySelector('svg.lucide-trash2')).not.toBeNull();
  });

  // A non-manual row reserves the action column with an empty `<span />`
  // instead of collapsing it — otherwise the fixed 5-column grid would
  // shift the amount/categoría columns out of alignment across rows.
  it('reserves the action column with an empty span for a non-manual row (no delete control)', async () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const fila = await screen.findByRole('listitem');
    expect(
      within(fila).queryByRole('button', { name: /Eliminar/i }),
    ).not.toBeInTheDocument();
  });

  // ── mobile responsive grid (defecto de layout: rejilla solo-escritorio) ──
  //
  // jsdom NO hace layout — no puede probar anchos reales ni qué breakpoint
  // "gana". Estos tests son estructurales: prueban que las clases responsive
  // existen en el DOM (mobile-first sin prefijo + `sm:` para escritorio) y
  // que las celdas nuevas (conteo en el encabezado de columnas) están
  // presentes. La geometría real a 360px/1280px la cubre
  // `e2e/bucket-detalle-mes.e2e.ts` (proyecto `escritorio`) — ningún
  // proyecto Playwright hoy asertaba el layout MÓVIL de esta rejilla.

  it('the heading button uses a mobile grid-cols-[1fr_auto] and switches to the desktop 4-column grid at sm:', () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const heading = screen.getByRole('heading', { level: 2 });
    const boton = within(heading).getByRole('button');
    expect(boton.className).toContain('grid-cols-[1fr_auto]');
    expect(boton.className).toContain('sm:grid-cols-[1fr_6rem_11rem_2.25rem]');
  });

  it('the conteo span in the heading is hidden on mobile (hidden sm:block) — desktop-only, since mobile shows it in the column header instead', () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    const heading = screen.getByRole('heading', { level: 2 });
    const conteoSpan = within(heading).getByText('1 movimiento');
    expect(conteoSpan.className).toContain('hidden');
    expect(conteoSpan.className).toContain('sm:block');
  });

  it('the column header shows the conteo as its own mobile-only cell (sm:hidden), alongside periodoLabel, while the rest is desktop-only', () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const encabezado = screen.getByText('JUL 2026').closest('div');
    expect(encabezado).not.toBeNull();
    if (!encabezado) throw new Error('encabezado not found');

    // periodoLabel is always visible — no `hidden`/`sm:` classes of its own.
    const periodoSpan = within(encabezado).getByText('JUL 2026');
    expect(periodoSpan.className).not.toContain('hidden');

    // The desktop-only cells (Descripción/Monto/Categoría/blank) are
    // `hidden sm:block`.
    for (const texto of ['Descripción', 'Monto', 'Categoría']) {
      const celda = within(encabezado).getByText(texto);
      expect(celda.className).toContain('hidden');
      expect(celda.className).toContain('sm:block');
    }

    // The new mobile-only conteo cell exists, is `sm:hidden`, and is
    // distinct from the heading's own (desktop-only) conteo span.
    const celdaConteo = within(encabezado).getByText('1 movimiento');
    expect(celdaConteo.className).toContain('sm:hidden');
    expect(celdaConteo).not.toBe(
      within(screen.getByRole('heading', { level: 2 })).getByText(
        '1 movimiento',
      ),
    );
  });

  it('positions the categoría control at col-start-2 row-start-2 on mobile and sm:col-start-4 sm:row-start-1 on desktop, without adding a className prop to ReclasificarCategoriaControl', async () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const select = await screen.findByLabelText(
      'Categoría de Compra en Líder: Necesidades · Supermercado',
    );
    // select -> ReclasificarCategoriaControl's own root div -> the
    // positioning wrapper this component (the call site) owns.
    const wrapper = select.parentElement?.parentElement;
    expect(wrapper).not.toBeNull();
    if (!wrapper) throw new Error('wrapper not found');
    expect(wrapper.className).toContain('col-start-2');
    expect(wrapper.className).toContain('row-start-2');
    expect(wrapper.className).toContain('sm:col-start-4');
    expect(wrapper.className).toContain('sm:row-start-1');
  });

  it('positions the acción cell (delete control) at col-start-3 row-start-2 justify-self-end on mobile and sm:col-start-5 sm:row-start-1 sm:justify-self-auto on desktop', async () => {
    mockFetch();
    const grupoConManual: GrupoDetalleMesViewModel = {
      ...GRUPO_FIXTURE,
      transacciones: [
        {
          id: 'tx-manual',
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
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const trigger = await screen.findByRole('button', {
      name: /Eliminar movimiento Bono manual \(2026-07-05\)/i,
    });
    // trigger -> EliminarMovimientoControl's own root div -> the
    // positioning wrapper this component (the call site) owns.
    const wrapper = trigger.parentElement?.parentElement;
    expect(wrapper).not.toBeNull();
    if (!wrapper) throw new Error('wrapper not found');
    expect(wrapper.className).toContain('col-start-3');
    expect(wrapper.className).toContain('row-start-2');
    expect(wrapper.className).toContain('justify-self-end');
    expect(wrapper.className).toContain('sm:col-start-5');
    expect(wrapper.className).toContain('sm:row-start-1');
    expect(wrapper.className).toContain('sm:justify-self-auto');
  });

  it('the empty filler span (non-manual row) carries the same position classes as the delete trigger wrapper', async () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const fila = await screen.findByRole('listitem');
    const filler = within(fila).getByText('', { selector: 'span:empty' });
    expect(filler.className).toContain('col-start-3');
    expect(filler.className).toContain('row-start-2');
    expect(filler.className).toContain('justify-self-end');
    expect(filler.className).toContain('sm:col-start-5');
    expect(filler.className).toContain('sm:row-start-1');
    expect(filler.className).toContain('sm:justify-self-auto');
  });

  it('the row <li> uses a mobile 3-column grid with a MINIMUM h-16 and switches to the desktop 5-column grid with a minimum h-11 at sm:', async () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const fila = await screen.findByRole('listitem');
    // Token-exact, NOT `className.toContain`: the string 'min-h-16' contains
    // 'h-16', so a substring assert would pass against either spelling and
    // could never tell a fixed height from a minimum one.
    const clases = fila.className.split(/\s+/);
    expect(clases).toContain('grid-cols-[3.5rem_1fr_5.25rem]');
    expect(clases).toContain('sm:grid-cols-[4.75rem_1fr_6rem_11rem_2.25rem]');
    expect(clases).toContain('min-h-16');
    expect(clases).toContain('sm:min-h-11');
    expect(clases).not.toContain('h-16');
    expect(clases).not.toContain('sm:h-11');
  });

  it('shows the full descripción: it wraps instead of truncating, and no title tooltip stands in for it', async () => {
    mockFetch();

    render(
      <GrupoMovimientos
        grupo={GRUPO_FIXTURE}
        destacar={false}
        bucketActual="Necesidades"
        periodo="2026-07"
        periodoLabel="JUL 2026"
        onMovida={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expandirGrupo();
    const descripcion = await screen.findByText('Compra en Líder');
    const clases = descripcion.className.split(/\s+/);
    // `break-words` and not `truncate`: a name longer than the column takes a
    // second line inside its own cell. `break-words` is what keeps a single
    // unspaced token from widening the column and breaking the 5-column grid.
    expect(clases).toContain('break-words');
    expect(clases).not.toContain('truncate');
    // The tooltip was the old workaround for the cut text. With the text
    // shown in full it is not just redundant — keeping it would hide that
    // the truncation came back.
    expect(descripcion).not.toHaveAttribute('title');
  });
});
