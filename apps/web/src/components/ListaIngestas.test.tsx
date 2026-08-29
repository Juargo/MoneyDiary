import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ListaIngestas } from './ListaIngestas';
import { ME_QUERY_KEY } from '@/api/use-me';
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { IngestaListItemDto, MeDto } from '@/api/types';

const dosIngestas: IngestaListItemDto[] = [
  {
    id: 'ingesta-1',
    banco: 'BancoEstado',
    nombreArchivo: 'cartola-bancoestado.xlsx',
    estado: 'PROCESADA',
    motivoFallo: null,
    fecha: '2026-07-15T00:00:00.000Z',
    totalTransacciones: 12,
  },
  {
    id: 'ingesta-2',
    banco: 'BCI',
    nombreArchivo: 'cartola-bci.xlsx',
    estado: 'PROCESADA',
    motivoFallo: null,
    fecha: '2026-07-01T00:00:00.000Z',
    totalTransacciones: 1,
  },
];

const ingestaSantander: IngestaListItemDto = {
  id: 'ingesta-4',
  banco: 'Santander',
  nombreArchivo: 'cartola-santander.xlsx',
  estado: 'PROCESADA',
  motivoFallo: null,
  fecha: '2026-07-10T00:00:00.000Z',
  totalTransacciones: 5,
};

// Bulk-delete tests need a 3rd PROCESADA row so a bulk delete of 2 leaves the
// list non-empty — `ListaIngestas` swaps to the `<Empty>` branch entirely
// when `query.data.length === 0`, which would unmount the heading + live
// region the success announcement asserts against (same reason the existing
// single-delete test above always leaves BCI behind).
const tresIngestas: IngestaListItemDto[] = [...dosIngestas, ingestaSantander];

const ingestaFallida: IngestaListItemDto = {
  id: 'ingesta-3',
  banco: null,
  nombreArchivo: 'cartola.docx',
  estado: 'FALLIDA',
  motivoFallo: 'Extensión de archivo no soportada: .docx',
  fecha: '2026-07-20T00:00:00.000Z',
  totalTransacciones: 0,
};

const ME_NO_DEMO: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

const ME_DEMO: MeDto = { ...ME_NO_DEMO, esDemo: true, email: null };

// `QUERY_CLIENT_DEFAULTS` (same `staleTime` as production, precedent
// `CategoriasPanel.test.tsx`): without it the test client falls back to
// TanStack's own default (`staleTime: 0`), and the pre-seeded `['auth-me']`
// cache below would trigger an instant refetch on mount — an extra `fetch`
// call this file's other tests' `mockResolvedValueOnce` sequences don't
// account for.
function crearQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
        retry: false,
      },
    },
  });
}

// `queryClient` is an optional param (not always `crearQueryClient()`
// inline) so a test that needs to `vi.spyOn(queryClient, 'invalidateQueries')`
// can build the client itself, spy on it, THEN hand it to the wrapper —
// same reasoning `use-eliminar-ingesta.test.tsx`'s own `crearWrapper` has.
function crearWrapper(
  me: MeDto = ME_NO_DEMO,
  queryClient: QueryClient = crearQueryClient(),
) {
  queryClient.setQueryData(ME_QUERY_KEY, me);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Bulk-delete fetch stub: routes DELETE /api/ingestas/:id against an
// in-memory copy of `inicial` (so a subsequent GET refetch — triggered by
// `useEliminarIngesta`'s own `invalidateQueries(['ingestas'])` — reflects the
// deletions already applied), same URL/method-routing idiom as
// `BucketDetalleMesPage.test.tsx`'s `stubFetchInteraccion`. `fallarIds` lets
// a test mark specific ids to fail with a 500 instead of deleting, for the
// partial-failure case.
function crearFetchMockIngestas(inicial: readonly IngestaListItemDto[]) {
  let ingestas = [...inicial];
  const fallarIds = new Set<string>();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (method === 'DELETE' && url.includes('/api/ingestas/')) {
      const id = url.split('/').pop();
      if (id && fallarIds.has(id)) {
        return Promise.resolve({ ok: false, status: 500 } as Response);
      }
      ingestas = ingestas.filter((i) => i.id !== id);
      return Promise.resolve({ ok: true, status: 204 } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, fallarIds };
}

// Sequentiality pin (R3 test gap): `crearFetchMockIngestas` above resolves
// every DELETE synchronously, which can't distinguish a strictly sequential
// `for...of await` loop from an eagerly-fired `Promise.all` — both would
// pass its assertions. This stub instead returns a DELETE promise that stays
// pending until the test explicitly calls `resolverSiguiente()`, so a test
// can assert the second DELETE is never issued while the first is still in
// flight.
function crearFetchMockIngestasControlado(
  inicial: readonly IngestaListItemDto[],
) {
  let ingestas = [...inicial];
  const pendientes: Array<() => void> = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (method === 'DELETE' && url.includes('/api/ingestas/')) {
      const id = url.split('/').pop();
      return new Promise<Response>((resolve) => {
        pendientes.push(() => {
          ingestas = ingestas.filter((i) => i.id !== id);
          resolve({ ok: true, status: 204 } as Response);
        });
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    resolverSiguiente: () => pendientes.shift()?.(),
  };
}

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ListaIngestas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the loading state while the query is pending', () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: dosIngestas }),
    });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();
  });

  it('renders the empty state when there are no ingestas', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [] }),
    });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(await screen.findByText(/no hay cartolas/i)).toBeInTheDocument();
  });

  it('renders each ingesta row with banco, formatted fecha, and the movement count, plus its delete control', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: dosIngestas }),
    });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(await screen.findByText('BancoEstado')).toBeInTheDocument();
    expect(screen.getByText('2026-07-15')).toBeInTheDocument();
    expect(screen.getByText('12 movimientos')).toBeInTheDocument();

    expect(screen.getByText('BCI')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('1 movimiento')).toBeInTheDocument();

    expect(
      screen.getAllByRole('button', { name: /^Eliminar cartola/i }),
    ).toHaveLength(2);
  });

  it('a successful delete removes the row, announces it in a stable live region, and keeps focus off document.body', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: dosIngestas }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [dosIngestas[1]] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    await screen.findByText('BancoEstado');
    await user.click(
      screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
    );
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(screen.queryByText('BancoEstado')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('BCI')).toBeInTheDocument();

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Gestionar cartolas' }),
    );
    expect(screen.getByText('Cartola eliminada.')).toBeInTheDocument();
  });

  it('cancelling a delete keeps the existing return-focus-to-trigger behavior intact', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: dosIngestas }),
    });
    const user = userEvent.setup();

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    await screen.findByText('BancoEstado');
    const trigger = screen.getByRole('button', {
      name: /Eliminar cartola BancoEstado/i,
    });
    await user.click(trigger);
    await screen.findByRole('alertdialog');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders a FALLIDA row with nombreArchivo, motivoFallo, banco as "—", and no delete control (US-004, ING-05)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [ingestaFallida] }),
    });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(await screen.findByText('cartola.docx')).toBeInTheDocument();
    expect(
      screen.getByText('Extensión de archivo no soportada: .docx'),
    ).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Fallido')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Eliminar cartola/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a PROCESADA row with its transaction count and the delete control (regression guard, US-018)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [dosIngestas[0]] }),
    });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(
      await screen.findByText('cartola-bancoestado.xlsx'),
    ).toBeInTheDocument();
    expect(screen.getByText('Exitoso')).toBeInTheDocument();
    expect(screen.getByText('12 movimientos')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
    ).toBeInTheDocument();
  });

  it('renders a mixed list (PROCESADA + FALLIDA) with each row branching correctly (US-004, CA-01/CA-02)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ingestas: [dosIngestas[0], ingestaFallida] }),
    });

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    expect(
      await screen.findByText('cartola-bancoestado.xlsx'),
    ).toBeInTheDocument();
    expect(screen.getByText('Exitoso')).toBeInTheDocument();
    expect(screen.getByText('cartola.docx')).toBeInTheDocument();
    expect(screen.getByText('Fallido')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Eliminar cartola/i }),
    ).toHaveLength(1);
  });

  it('the PROCESADA delete flow keeps working exactly as US-018 shipped it, even in a list that also has a FALLIDA row', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ingestas: [dosIngestas[0], ingestaFallida] }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [ingestaFallida] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ListaIngestas />, { wrapper: crearWrapper() });

    await screen.findByText('cartola-bancoestado.xlsx');
    await user.click(
      screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Se eliminarán 12 movimientos de BancoEstado',
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(
        screen.queryByText('cartola-bancoestado.xlsx'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('cartola.docx')).toBeInTheDocument();
  });

  // bulk-delete (power-user efficiency round, critique round-7 P2): mirrors
  // PreviewMuestra's master-checkbox + sticky-toolbar idiom, reusing the
  // existing per-ingesta DELETE endpoint sequentially — no new write surface.
  describe('bulk delete', () => {
    it('renders a selection checkbox for each PROCESADA row and none for a FALLIDA row', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ ingestas: [dosIngestas[0], ingestaFallida] }),
      });

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('cartola-bancoestado.xlsx');
      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      ).toBeInTheDocument();
      // Only the one PROCESADA row's checkbox plus the master — the FALLIDA
      // row gets none.
      expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    });

    it('the master checkbox selects and deselects every PROCESADA row', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      const master = screen.getByRole('checkbox', {
        name: /seleccionar todas las cartolas \(2\)/i,
      });
      const filaBancoEstado = screen.getByRole('checkbox', {
        name: /seleccionar cartola bancoestado/i,
      });
      const filaBci = screen.getByRole('checkbox', {
        name: /seleccionar cartola bci/i,
      });

      await user.click(master);
      expect(filaBancoEstado).toBeChecked();
      expect(filaBci).toBeChecked();
      expect(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      ).toBeInTheDocument();

      await user.click(master);
      expect(filaBancoEstado).not.toBeChecked();
      expect(filaBci).not.toBeChecked();
    });

    it('the bulk trigger opens ONE confirmation stating the aggregate ingesta and movement counts', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar todas las cartolas/i,
        }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );

      const dialogos = await screen.findAllByRole('alertdialog');
      expect(dialogos).toHaveLength(1);
      expect(dialogos[0]).toHaveTextContent(
        'Se eliminarán 2 cartolas y 13 movimientos en total',
      );
      expect(dialogos[0]).toHaveTextContent(
        'Esta acción no se puede deshacer.',
      );
    });

    it('confirming a bulk delete removes each selected row sequentially, clears selection, and announces success', async () => {
      const { fetchMock } = crearFetchMockIngestas(tresIngestas);
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(screen.queryByText('BancoEstado')).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.queryByText('BCI')).not.toBeInTheDocument(),
      );
      expect(screen.getByText('Santander')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('Cartolas eliminadas.')).toBeInTheDocument();
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Gestionar cartolas' }),
      );

      const deleteCalls = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(2);
    });

    it('a partial bulk-delete failure keeps the failed row selected, reports it inline, and leaves the dialog open', async () => {
      const { fallarIds } = crearFetchMockIngestas(tresIngestas);
      fallarIds.add('ingesta-2');
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(screen.queryByText('BancoEstado')).not.toBeInTheDocument(),
      );
      expect(screen.getByText('BCI')).toBeInTheDocument();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        /no se pudo eliminar 1 cartola: cartola-bci\.xlsx/i,
      );
      expect(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      ).toBeChecked();
    });

    it('when the FIRST selected id fails, the loop still continues and deletes the rest (4R review R3 gap)', async () => {
      const { fallarIds } = crearFetchMockIngestas(tresIngestas);
      fallarIds.add('ingesta-1');
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(screen.queryByText('BCI')).not.toBeInTheDocument(),
      );
      expect(screen.getByText('BancoEstado')).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      ).toBeChecked();
      expect(screen.getByRole('alert')).toHaveTextContent(
        /no se pudo eliminar 1 cartola: cartola-bancoestado\.xlsx/i,
      );
    });

    it('a partial-failure outcome is also announced in the stable live region, not just inside the dialog (4R review R4-WARNING)', async () => {
      const { fallarIds } = crearFetchMockIngestas(tresIngestas);
      fallarIds.add('ingesta-2');
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          /no se pudo eliminar 1 cartola: cartola-bci\.xlsx/i,
        ),
      );
    });

    it('freezes every checkbox and the trigger button while the confirmation is open (4R review R1/R4 stale-dialog + re-entrancy)', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (1)' }),
      );
      await screen.findByRole('alertdialog');

      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar todas las cartolas/i,
        }),
      ).toBeDisabled();
      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      ).toBeDisabled();
      expect(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (1)' }),
      ).toBeDisabled();
    });

    it('ignores Escape while a bulk delete is running, so partial-failure feedback cannot be dismissed mid-run (4R review R4-BLOCKER)', async () => {
      const { resolverSiguiente } =
        crearFetchMockIngestasControlado(tresIngestas);
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (1)' }),
      );
      const dialog = await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));
      await screen.findByRole('button', { name: 'Eliminando… (0/1)' });

      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      resolverSiguiente();
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      );
    });

    it('batches cache invalidation into ONE pass of the 4 keys after the whole run, not once per delete (4R review R4-WARNING)', async () => {
      const queryClient = crearQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      crearFetchMockIngestas(tresIngestas);
      const user = userEvent.setup();

      render(<ListaIngestas />, {
        wrapper: crearWrapper(ME_NO_DEMO, queryClient),
      });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() =>
        expect(screen.queryByText('BancoEstado')).not.toBeInTheDocument(),
      );

      const clavesInvalidadas = invalidateSpy.mock.calls.map(
        ([arg]) => (arg as { queryKey?: unknown } | undefined)?.queryKey,
      );
      for (const clave of [
        'resumen',
        'resumen-anual',
        'detalle-bucket-mes',
        'ingestas',
      ]) {
        expect(
          clavesInvalidadas.filter((k) => JSON.stringify(k) === `["${clave}"]`),
        ).toHaveLength(1);
      }
    });

    it('runs deletes strictly sequentially: the second DELETE is not issued until the first resolves, and the progress label updates mid-flight (4R review R3 gap)', async () => {
      const { fetchMock, resolverSiguiente } =
        crearFetchMockIngestasControlado(tresIngestas);
      const user = userEvent.setup();

      function contarDeletes() {
        return fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
        ).length;
      }

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );
      await user.click(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (2)' }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await screen.findByRole('button', { name: 'Eliminando… (0/2)' });
      expect(contarDeletes()).toBe(1);

      resolverSiguiente();
      await screen.findByRole('button', { name: 'Eliminando… (1/2)' });
      expect(contarDeletes()).toBe(2);

      resolverSiguiente();
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      );
      expect(contarDeletes()).toBe(2);
    });

    it('the master checkbox uses the singular label with one PROCESADA row in a mixed list, and only selects that row', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ ingestas: [dosIngestas[0], ingestaFallida] }),
      });
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('cartola-bancoestado.xlsx');
      const master = screen.getByRole('checkbox', {
        name: 'Seleccionar la cartola (1)',
      });
      await user.click(master);

      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      ).toBeChecked();
      expect(screen.getAllByRole('checkbox')).toHaveLength(2);
      expect(
        screen.getByRole('button', { name: 'Eliminar seleccionadas (1)' }),
      ).toBeInTheDocument();
    });

    it('shows the master checkbox as indeterminate when only some PROCESADA rows are selected, and clicking it then selects the rest', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });
      const user = userEvent.setup();

      render(<ListaIngestas />, { wrapper: crearWrapper() });

      await screen.findByText('BancoEstado');
      await user.click(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      );

      const master = screen.getByRole('checkbox', {
        name: /seleccionar todas las cartolas \(2\)/i,
      }) as HTMLInputElement;
      expect(master.indeterminate).toBe(true);
      expect(master.checked).toBe(false);

      await user.click(master);

      expect(master.indeterminate).toBe(false);
      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      ).toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: /seleccionar cartola bci/i }),
      ).toBeChecked();
    });

    it('in a demo session, selection checkboxes are disabled and a note explains why', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });

      render(<ListaIngestas />, { wrapper: crearWrapper(ME_DEMO) });

      await screen.findByText('BancoEstado');
      expect(screen.getByRole('note')).toHaveTextContent(
        /cuenta de demostración/i,
      );
      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar cartola bancoestado/i,
        }),
      ).toBeDisabled();
      expect(
        screen.getByRole('checkbox', {
          name: /seleccionar todas las cartolas/i,
        }),
      ).toBeDisabled();
    });

    // issue #500: the per-row EliminarIngestaControl had no esDemo gating —
    // only the bulk selection did (PR #499). WCTG-11: a single role="note"
    // per screen covers both reasons the delete affordances are disabled.
    it('in a demo session, the per-row delete trigger is ALSO disabled — one note covers both (issue #500)', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });

      render(<ListaIngestas />, { wrapper: crearWrapper(ME_DEMO) });

      await screen.findByText('BancoEstado');
      expect(screen.getAllByRole('note')).toHaveLength(1);
      expect(
        screen.getByRole('button', {
          name: /Eliminar cartola BancoEstado/i,
        }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', {
          name: /Eliminar cartola BCI/i,
        }),
      ).toBeDisabled();
    });

    it('outside a demo session, the per-row delete trigger stays enabled', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ingestas: dosIngestas }),
      });

      render(<ListaIngestas />, { wrapper: crearWrapper(ME_NO_DEMO) });

      await screen.findByText('BancoEstado');
      expect(
        screen.getByRole('button', {
          name: /Eliminar cartola BancoEstado/i,
        }),
      ).toBeEnabled();
    });
  });
});
