import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmarImpactoDialog } from './ConfirmarImpactoDialog';

/**
 * ConfirmarImpactoDialog.test.tsx (US-043 PR #3b, design.md §1/Q6a/task 28)
 * — the `EliminarIngestaControl` shape: `role="alertdialog"`,
 * `aria-modal="false"`, focus to confirm on mount, Escape cancels, `role=
 * "alert"` inline error, does NOT close on failure. Takes rendered copy —
 * this test never asserts on what is being confirmed, only on the shell's
 * own mechanics (that is `fraseDeImpacto`'s job, task 27).
 */
function renderDialog(
  overrides: Partial<{
    readonly pendiente: boolean;
    readonly error: string | null;
    readonly onConfirmar: () => void;
    readonly onCancelar: () => void;
  }> = {},
) {
  const onConfirmar = overrides.onConfirmar ?? vi.fn();
  const onCancelar = overrides.onCancelar ?? vi.fn();
  render(
    <ConfirmarImpactoDialog
      titulo="Eliminar categoría"
      lineas={[
        'Vas a eliminar «Supermercado».',
        'Esta acción no se puede deshacer.',
      ]}
      textoConfirmar="Eliminar"
      pendiente={overrides.pendiente ?? false}
      error={overrides.error ?? null}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />,
  );
  return { onConfirmar, onCancelar };
}

describe('ConfirmarImpactoDialog', () => {
  it('renderiza role="alertdialog" con aria-modal="false" y el título/líneas recibidas', () => {
    renderDialog();

    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'false');
    expect(screen.getByText('Eliminar categoría')).toBeInTheDocument();
    expect(
      screen.getByText('Vas a eliminar «Supermercado».'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Esta acción no se puede deshacer.'),
    ).toBeInTheDocument();
  });

  it('el botón Confirmar recibe el foco al montar', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveFocus();
  });

  it('Escape llama a onCancelar', async () => {
    const user = userEvent.setup();
    const { onCancelar } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('el botón Cancelar llama a onCancelar', async () => {
    const user = userEvent.setup();
    const { onCancelar } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('el botón de confirmación (textoConfirmar) llama a onConfirmar', async () => {
    const user = userEvent.setup();
    const { onConfirmar } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('un error se muestra inline en role="alert" y el diálogo NO se desmonta — el caller decide, este componente no tiene estado propio de apertura', () => {
    renderDialog({ error: 'Ocurrió un error inesperado. Intenta nuevamente.' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('pendiente=true deshabilita el botón de confirmación (usado también para el demo-disable defensivo)', () => {
    renderDialog({ pendiente: true });

    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
  });
});
