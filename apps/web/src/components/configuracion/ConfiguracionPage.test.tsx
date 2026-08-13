import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfiguracionPage } from './ConfiguracionPage';
import { ME_QUERY_KEY } from '@/api/use-me';
import type { MeDto } from '@/api/types';

const ME: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

async function renderConfiguracionPage() {
  const rootRoute = createRootRoute();
  const configRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion',
    component: () => <ConfiguracionPage />,
  });
  const routeTree = rootRoute.addChildren([configRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/configuracion'] }),
  });
  await router.load();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ME_QUERY_KEY, ME);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ConfiguracionPage', () => {
  it('renderiza el heading "Editar perfil" (CA-02)', async () => {
    await renderConfiguracionPage();
    expect(
      screen.getByRole('heading', { name: 'Editar perfil' }),
    ).toBeInTheDocument();
  });

  it('renderiza la lista de tabs con Perfil actual y Categorías inerte', async () => {
    await renderConfiguracionPage();
    expect(screen.getByText('Perfil')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Categorías' })).toBeDisabled();
  });

  it('renderiza PerfilForm con los cuatro campos', async () => {
    await renderConfiguracionPage();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
    expect(screen.getByLabelText('Password actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Password nueva')).toBeInTheDocument();
  });

  it('monta la región del aviso de Google, vacía (se llena en PR #2)', async () => {
    await renderConfiguracionPage();
    const aviso = screen.getByTestId('aviso-google');
    expect(aviso).toBeInTheDocument();
    expect(aviso).toBeEmptyDOMElement();
  });
});
