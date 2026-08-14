import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ME_QUERY_KEY } from '@/api/use-me';
import type { MeDto } from '@/api/types';
import { PerfilPanel } from './PerfilPanel';

/**
 * `PerfilPanel` — rename+edit of the pre-split `ConfiguracionPage` (US-043
 * design.md §1/Q1d, D-09): it no longer owns the `Configuración` h1, the
 * fluid grid, or `ConfiguracionTabs` — `ConfiguracionLayout` does. It keeps
 * only what is genuinely Perfil's: the `Editar perfil` sub-heading (now an
 * `h2`, since the layout owns the page's one `h1`), `PerfilForm`,
 * `GoogleVinculoSection`, and the two Google-aviso regions.
 *
 * Tested by rendering the component directly (not through the real
 * `/configuracion` route, which now renders `ConfiguracionLayout` + a leaf)
 * — `useMe()`'s cache is pre-populated so no fetch stub is needed, and a
 * minimal synthetic root route supplies the router context `PerfilForm`/
 * `GoogleVinculoSection` need for `useNavigate`.
 */
const ME: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ME_QUERY_KEY, ME);

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <PerfilPanel />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(<RouterProvider router={router} />);
}

describe('PerfilPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza el h2 "Editar perfil" — ya NO un h1 (design.md Q1d, ConfiguracionLayout es dueño del único h1)', async () => {
    renderPanel();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Editar perfil' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('NO renderiza la grilla ni la lista de tabs que ahora posee ConfiguracionLayout', async () => {
    renderPanel();

    await screen.findByRole('heading', { level: 2, name: 'Editar perfil' });
    expect(screen.queryByTestId('configuracion-grid')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Secciones de configuración' }),
    ).not.toBeInTheDocument();
  });

  it('renderiza PerfilForm con los cuatro campos', async () => {
    renderPanel();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
    expect(screen.getByLabelText('Password actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Password nueva')).toBeInTheDocument();
  });

  it('monta las dos regiones del aviso de Google, vacías cuando avisoGoogle no llega por props', async () => {
    renderPanel();

    await screen.findByRole('heading', { level: 2, name: 'Editar perfil' });
    expect(screen.getByTestId('aviso-google')).toBeEmptyDOMElement();
    expect(screen.getByTestId('aviso-google-error')).toBeEmptyDOMElement();
  });

  it('renderiza el tercer bloque (Cuenta de Google) — No vinculada por defecto en el fixture', async () => {
    renderPanel();

    expect(await screen.findByText('No vinculada')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Vincular con Google' }),
    ).toBeInTheDocument();
  });
});
