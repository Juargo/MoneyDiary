import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { AvisoVersionNueva } from './AvisoVersionNueva';
import { ContextoControladorVersion } from '@/lib/use-aviso-version';
import type {
  ControladorVersion,
  EstadoVersion,
} from '@/lib/controlador-version';

/**
 * AvisoVersionNueva.test.tsx (issue #751). Inyecta un `ControladorVersion`
 * falso a través de `ContextoControladorVersion` — sin efectos globales
 * sobre el singleton real, sin `fetch`/timers reales involucrados (mismo
 * patrón que `SelectorTema.test.tsx`/`ContextoControladorTema`).
 */
function crearControladorFalso(
  nuevaVersionDisponible = false,
): ControladorVersion {
  const estado: EstadoVersion = { nuevaVersionDisponible };
  const listeners = new Set<() => void>();
  return {
    obtenerEstado: () => estado,
    suscribir: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    verificarAhora: vi.fn().mockResolvedValue(undefined),
    iniciar: () => () => {},
  };
}

function renderAviso(
  controlador: ControladorVersion,
  onRecargar: () => void = vi.fn(),
) {
  return render(
    <ContextoControladorVersion.Provider value={controlador}>
      <AvisoVersionNueva onRecargar={onRecargar} />
    </ContextoControladorVersion.Provider>,
  );
}

describe('AvisoVersionNueva', () => {
  it('no renderiza nada cuando no hay una versión nueva disponible', () => {
    renderAviso(crearControladorFalso(false));

    expect(
      screen.queryByRole('status', { name: /versión nueva/i }),
    ).not.toBeInTheDocument();
  });

  it('muestra el aviso cuando hay una versión nueva disponible', () => {
    renderAviso(crearControladorFalso(true));

    expect(
      screen.getByRole('status', { name: /versión nueva/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/hay una nueva versión/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Recargar' }),
    ).toBeInTheDocument();
  });

  it('el botón Recargar invoca la función de recarga inyectada (no window.location.reload)', async () => {
    const user = userEvent.setup();
    const onRecargar = vi.fn();
    renderAviso(crearControladorFalso(true), onRecargar);

    await user.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(onRecargar).toHaveBeenCalledTimes(1);
  });

  it('se puede descartar con el botón de cerrar y deja de mostrarse', async () => {
    const user = userEvent.setup();
    renderAviso(crearControladorFalso(true));

    await user.click(screen.getByRole('button', { name: /cerrar aviso/i }));

    expect(
      screen.queryByRole('status', { name: /versión nueva/i }),
    ).not.toBeInTheDocument();
  });

  it('el botón de cerrar es alcanzable por teclado (Tab) y accionable con Enter', async () => {
    const user = userEvent.setup();
    renderAviso(crearControladorFalso(true));

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: /cerrar aviso/i })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(
      screen.queryByRole('status', { name: /versión nueva/i }),
    ).not.toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad detectables', async () => {
    const { container } = renderAviso(crearControladorFalso(true));

    expect(await axe(container)).toHaveNoViolations();
  });
});
