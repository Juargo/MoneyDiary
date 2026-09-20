import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OfrecerPatronControl } from './OfrecerPatronControl';

/**
 * OfrecerPatronControl.test.tsx (issue #745, patrón desde movimiento) — the
 * two-stage offer that appears after a successful reclassification: stage 1
 * ("oferta") is a dismissible, non-blocking prompt; stage 2 ("seleccion")
 * hosts `SelectorPalabrasPatron` and wires the confirm action to the
 * existing `POST /api/patrones` mutation (`useCrearPatron`) — no new
 * endpoint, no client-side matching logic (ADR-024).
 */
function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('OfrecerPatronControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts on the dismissible offer stage, with no word buttons and no request fired yet', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <OfrecerPatronControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-streaming"
        onCreado={vi.fn()}
        onCerrar={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    expect(screen.getByText(/próximas cartolas/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear patrón' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ahora no' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'NETFLIX.COM' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dismissing the offer via "Ahora no" calls onCerrar and fires no request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onCerrar = vi.fn();
    const user = userEvent.setup();

    render(
      <OfrecerPatronControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-streaming"
        onCreado={vi.fn()}
        onCerrar={onCerrar}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Ahora no' }));

    expect(onCerrar).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clicking "Crear patrón" moves to the word-picking stage', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();

    render(
      <OfrecerPatronControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-streaming"
        onCreado={vi.fn()}
        onCerrar={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));

    expect(
      screen.getByRole('button', { name: 'NETFLIX.COM' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeInTheDocument();
  });

  it('confirming a selection POSTs to /api/patrones with the categoriaId, the built pattern, and CONTAINS, then calls onCreado with the pattern text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
    const onCreado = vi.fn();
    const user = userEvent.setup();

    render(
      <OfrecerPatronControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-streaming"
        onCreado={onCreado}
        onCerrar={vi.fn()}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));
    await user.click(screen.getByRole('button', { name: 'NETFLIX.COM' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/patrones',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            categoriaId: 'cat-streaming',
            patron: 'NETFLIX.COM',
            matchType: 'CONTAINS',
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(onCreado).toHaveBeenCalledExactlyOnceWith('NETFLIX.COM'),
    );
  });

  it('a failed creation shows an inline error, keeps the picker open, and never calls onCreado or onCerrar (the reclassification already succeeded and must stay that way)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: 'PATRON_DUPLICADO', message: 'x' }),
      }),
    );
    const onCreado = vi.fn();
    const onCerrar = vi.fn();
    const user = userEvent.setup();

    render(
      <OfrecerPatronControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-streaming"
        onCreado={onCreado}
        onCerrar={onCerrar}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));
    await user.click(screen.getByRole('button', { name: 'NETFLIX.COM' }));
    await user.click(screen.getByRole('button', { name: 'Guardar patrón' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes un patrón con ese texto.',
    );
    expect(onCreado).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
    // The picker stays mounted and usable — the row's own reclassification
    // is untouched regardless of this failure.
    expect(
      screen.getByRole('button', { name: 'Guardar patrón' }),
    ).toBeInTheDocument();
  });

  it('cancelling from the word-picking stage calls onCerrar, firing no request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onCerrar = vi.fn();
    const user = userEvent.setup();

    render(
      <OfrecerPatronControl
        descripcion="NETFLIX.COM SANTIAGO CL"
        categoriaId="cat-streaming"
        onCreado={vi.fn()}
        onCerrar={onCerrar}
      />,
      { wrapper: crearWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Crear patrón' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCerrar).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
