import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { GrupoMovimientos } from './GrupoMovimientos';
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

describe('GrupoMovimientos', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

    // Wait for the catalog to load and the select to be enabled.
    const select = await screen.findByLabelText(
      'Cambiar categoría de Compra en Líder',
    );
    await waitFor(() => expect(select).not.toBeDisabled());

    // Pick a cross-bucket categoría (Streaming — Deseos).
    await user.selectOptions(select as HTMLSelectElement, 'Streaming');
    // Confirm the cross-bucket dialog.
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    // The onMovida spy must have fired once with the LABEL for Deseos ('Gustos').
    // This proves the prop is forwarded through GrupoMovimientos — not dropped.
    await waitFor(() => expect(onMovida).toHaveBeenCalledTimes(1));
    expect(onMovida).toHaveBeenCalledWith('Gustos');
  });
});
