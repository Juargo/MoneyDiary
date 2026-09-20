import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useVolverAtras } from './use-volver-atras';

/**
 * useVolverAtras.test.tsx (issue #752) — proves the hook's honesty claim
 * with a REAL `@tanstack/history` instance, not a mocked `useCanGoBack`: a
 * fresh single-entry history (the direct-URL/deep-link case) must report
 * `puedeVolver: false`, and only a genuine in-app navigation (a second
 * history entry the router itself pushed) must flip it to `true` — at which
 * point `volverAtras` must call `router.history.back()`, never
 * `router.navigate()` to a guessed destination.
 */
function Harness() {
  const { puedeVolver, volverAtras } = useVolverAtras();
  return (
    <button type="button" onClick={volverAtras}>
      {puedeVolver ? 'puede-volver' : 'no-puede-volver'}
    </button>
  );
}

function renderHarness() {
  const rootRoute = createRootRoute({ component: Harness });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return { router };
}

describe('useVolverAtras', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports puedeVolver: false on a fresh single-entry history (direct URL / deep link)', async () => {
    renderHarness();
    expect(
      await screen.findByRole('button', { name: 'no-puede-volver' }),
    ).toBeInTheDocument();
  });

  it('flips to puedeVolver: true once the router has an in-app entry to return to', async () => {
    const { router } = renderHarness();
    await screen.findByRole('button', { name: 'no-puede-volver' });

    // A real in-app navigation, performed by the router itself — not a raw
    // browser back-button press with no app history behind it.
    act(() => {
      router.history.push('/');
    });

    expect(
      await screen.findByRole('button', { name: 'puede-volver' }),
    ).toBeInTheDocument();
  });

  it('volverAtras calls router.history.back(), never a guessed navigate() destination', async () => {
    const { router } = renderHarness();
    await screen.findByRole('button', { name: 'no-puede-volver' });

    act(() => {
      router.history.push('/');
    });
    const boton = await screen.findByRole('button', { name: 'puede-volver' });

    const backSpy = vi.spyOn(router.history, 'back');
    fireEvent.click(boton);

    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
