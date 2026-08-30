import { render, screen } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { Empty } from './Empty';

/**
 * `<Empty accion>` needs a real router (`Link`), so any test exercising it
 * mounts through a minimal router harness — same shape as
 * `DemoBanner.test.tsx` — instead of rendering `<Empty>` bare.
 */
async function renderEmptyConRouter(
  props: Parameters<typeof Empty>[0] = undefined,
) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Empty {...props} />,
  });
  const subirRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/subir',
    component: () => <div>pantalla de subida</div>,
  });
  const routeTree = rootRoute.addChildren([homeRoute, subirRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

// DOM port of apps/mobile/src/components/states/Empty.spec.tsx (spec
// W1-02): shown when `sinIngreso: true`. Copy invites a cartola upload,
// deliberately distinct from a bucket rendering "$0" or "0%" — those
// describe a zero amount/percentage, not an absent income.
describe('Empty', () => {
  it('renders empty-state copy inviting a cartola upload, distinct from $0 or 0%', () => {
    render(<Empty />);
    expect(screen.getByText(/no hay movimientos/i)).toBeInTheDocument();
    expect(screen.getByText(/cartola/i)).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  // The resumen screen is unchanged (default copy preserved), but other
  // screens reusing this shared component (e.g. bucket detail, US-017) need
  // context-appropriate copy — optional `title`/`description` props override
  // it.
  it('renders custom title/description when provided, instead of the resumen-specific default', () => {
    render(
      <Empty
        title="No hay movimientos en este bucket"
        description="No hay movimientos en este bucket para el período."
      />,
    );
    expect(
      screen.getByText('No hay movimientos en este bucket'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No hay movimientos en este bucket para el período.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Carga una cartola/)).not.toBeInTheDocument();
  });

  // P1 design-critique fix: the CTA is opt-in via the `accion` prop — no
  // Empty usage gets a `/subir` link unless its caller explicitly wires one
  // (not every empty state's true next step is "upload a cartola").
  it('renders NO call-to-action when `accion` is not provided', () => {
    render(<Empty />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the `accion` call-to-action, linking to the given route, when provided', async () => {
    await renderEmptyConRouter({
      accion: { label: 'Subir cartola', to: '/subir' },
    });

    expect(screen.getByRole('link', { name: 'Subir cartola' })).toHaveAttribute(
      'href',
      '/subir',
    );
  });

  // Semantic wash extension (DESIGN.md "Status Families" update, 2026-08-29):
  // Empty has no state to wash (it isn't a semaforo/ingreso outcome) and no
  // card wrapper of its own — it sits directly on the pale-sky background.
  // Scoped instead to a soft, restrained surface treatment (same
  // `bg-muted/40`/`border-border`/`rounded-xl` idiom already used for notice
  // boxes elsewhere, e.g. `SubirCartola`'s draft-recovery notice) so the
  // empty state reads as considered rather than bare text on the page.
  it('gives the empty state a soft muted surface instead of bare text on the page background', () => {
    const { container } = render(<Empty />);
    const superficie = container.querySelector('.bg-muted\\/40');
    expect(superficie).toBeInTheDocument();
    expect(superficie).toContainElement(
      screen.getByText(/no hay movimientos/i),
    );
  });
});
