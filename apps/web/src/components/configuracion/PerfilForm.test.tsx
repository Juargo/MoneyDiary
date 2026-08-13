import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PerfilForm } from './PerfilForm';
import { MENSAJE_DEMO_SOLO_LECTURA } from './mensajes';
import { ME_QUERY_KEY } from '@/api/use-me';
import type { MeDto } from '@/api/types';

const ME: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

function stubFetch(
  respuestas: Record<string, { status: number; body?: unknown }>,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const respuesta = respuestas[url] ?? { status: 500 };
    return {
      ok: respuesta.status >= 200 && respuesta.status < 300,
      status: respuesta.status,
      json: async () => respuesta.body ?? {},
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderPerfilForm(me: MeDto = ME) {
  const rootRoute = createRootRoute();
  const configRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion',
    component: () => <PerfilForm me={me} />,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <div>pantalla de login</div>,
  });
  const routeTree = rootRoute.addChildren([configRoute, loginRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/configuracion'] }),
  });
  await router.load();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ME_QUERY_KEY, me);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe('PerfilForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('los cuatro campos son alcanzables por su label (WCFG-12/CA-05)', async () => {
    await renderPerfilForm();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
    expect(screen.getByLabelText('Password actual')).toHaveValue('');
    expect(screen.getByLabelText('Password nueva')).toHaveValue('');
  });

  it('los campos de password están agrupados bajo el label "Cambiar password" (WCFG-02)', async () => {
    await renderPerfilForm();

    const grupo = screen.getByRole('group', { name: 'Cambiar password' });
    expect(within(grupo).getByLabelText('Password actual')).toBeInTheDocument();
    expect(within(grupo).getByLabelText('Password nueva')).toBeInTheDocument();
    // Nombre/Email quedan fuera del grupo — solo el bloque de password lo tiene.
    expect(within(grupo).queryByLabelText('Nombre')).not.toBeInTheDocument();
  });

  it('las dos regiones de mensaje están SIEMPRE montadas, vacías al inicio (Q7d)', async () => {
    await renderPerfilForm();

    const polite = document.querySelector('[aria-live="polite"]');
    const alerta = screen.getByRole('alert');
    expect(polite).toBeInTheDocument();
    expect(polite).toBeEmptyDOMElement();
    expect(alerta).toBeEmptyDOMElement();
  });

  it('Password actual NO es required mientras Email no está sucio', async () => {
    await renderPerfilForm();
    expect(screen.getByLabelText('Password actual')).not.toBeRequired();
  });

  it('Password actual se vuelve required cuando Email cambia (design.md Q1c)', async () => {
    await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nueva@example.com' },
    });

    expect(screen.getByLabelText('Password actual')).toBeRequired();
  });

  it('Guardar cambios se deshabilita mientras la mutación está pendiente', async () => {
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolverFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Ana Nueva' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Guardar cambios' }),
      ).toBeDisabled(),
    );

    resolverFetch({ ok: true, status: 200, json: async () => ({}) });
  });

  it('sin cambios: cero requests, "No hay cambios para guardar." en la región polite', async () => {
    const fetchMock = stubFetch({});
    await renderPerfilForm();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(
        screen.getByText('No hay cambios para guardar.'),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('password-only éxito: un call, limpia AMBOS campos de password (row 7)', async () => {
    stubFetch({ '/api/perfil/password': { status: 204 } });
    await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Password actual'), {
      target: { value: 'correcta' },
    });
    fireEvent.change(screen.getByLabelText('Password nueva'), {
      target: { value: 'nueva12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(
        screen.getByText('Cambios guardados. Se cerraron tus otras sesiones.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Password actual')).toHaveValue('');
    expect(screen.getByLabelText('Password nueva')).toHaveValue('');
  });

  it('password-only falla (perfilGuardado: false): mantiene AMBOS campos de password', async () => {
    stubFetch({
      '/api/perfil/password': {
        status: 403,
        body: { code: 'PERFIL_RECHAZADO' },
      },
    });
    await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Password actual'), {
      target: { value: 'correcta' },
    });
    fireEvent.change(screen.getByLabelText('Password nueva'), {
      target: { value: 'nueva12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'No se pudo cambiar la password. Revisa tu password actual.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Password actual')).toHaveValue('correcta');
    expect(screen.getByLabelText('Password nueva')).toHaveValue('nueva12345');
  });

  it('falla parcial (row 11): mantiene los campos de password para que el retry solo mande la password', async () => {
    stubFetch({
      '/api/perfil': { status: 200 },
      '/api/perfil/password': {
        status: 403,
        body: { code: 'PERFIL_RECHAZADO' },
      },
    });
    await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Ana Nueva' },
    });
    fireEvent.change(screen.getByLabelText('Password actual'), {
      target: { value: 'correcta' },
    });
    fireEvent.change(screen.getByLabelText('Password nueva'), {
      target: { value: 'nueva12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Se guardaron tus datos, pero no se pudo cambiar la password.',
        ),
      ).toBeInTheDocument(),
    );
    const lineaUno = screen.getByText(
      'Se guardaron tus datos, pero no se pudo cambiar la password.',
    );
    const lineaDos = screen.getByText(
      'No se pudo cambiar la password. Revisa tu password actual.',
    );
    expect(lineaDos).toBeInTheDocument();
    // Cada línea vive en su propio bloque (no `<span>` inline adyacente):
    // asegura la separación visual/semántica de las dos oraciones, no solo
    // su presencia (`getByText` solo probaría eso).
    expect(lineaUno.tagName).toBe('P');
    expect(lineaDos.tagName).toBe('P');
    expect(screen.getByRole('alert').children).toHaveLength(2);
    expect(screen.getByLabelText('Password actual')).toHaveValue('correcta');
    expect(screen.getByLabelText('Password nueva')).toHaveValue('nueva12345');
  });

  it('403 PERFIL_RECHAZADO en el perfil: mantiene TODOS los campos, incluida passwordActual (row 6/10)', async () => {
    stubFetch({
      '/api/perfil': {
        status: 403,
        body: { code: 'PERFIL_RECHAZADO' },
      },
    });
    await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'taken@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password actual'), {
      target: { value: 'correcta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'No se pudieron guardar los cambios. Revisa tu password actual y el email.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Email')).toHaveValue('taken@example.com');
    expect(screen.getByLabelText('Password actual')).toHaveValue('correcta');
  });

  it('un tag unauthorized navega a /login sin mostrar mensaje (WCFG-09)', async () => {
    stubFetch({ '/api/perfil': { status: 401 } });
    const { router } = await renderPerfilForm();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Ana Nueva' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.getByText('pantalla de login')).toBeInTheDocument();
  });

  it('demo (esDemo=true): los cuatro campos y el botón quedan disabled, con el aviso role="note" (design Q9c)', async () => {
    await renderPerfilForm({ ...ME, esDemo: true });

    expect(screen.getByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password actual')).toBeDisabled();
    expect(screen.getByLabelText('Password nueva')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      MENSAJE_DEMO_SOLO_LECTURA,
    );
  });

  it('no-demo (esDemo=false): nada queda disabled y no se monta ningún role="note" (design Q9c)', async () => {
    await renderPerfilForm();

    expect(screen.getByLabelText('Nombre')).not.toBeDisabled();
    expect(screen.getByLabelText('Email')).not.toBeDisabled();
    expect(screen.getByLabelText('Password actual')).not.toBeDisabled();
    expect(screen.getByLabelText('Password nueva')).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeDisabled();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
