import { fireEvent, render, screen } from '@testing-library/react';
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

  /**
   * Judgment-day round 3, WCTG-07: `onKeyDown`'s Escape (and the "Cancelar"
   * button) used to call `onCancelar()` unconditionally, unlike the confirm
   * button which already respects `pendiente`. This let a user "cancel" the
   * dialog while ITS OWN mutation was still in flight — the caller then
   * tried to restore focus to a trigger it had itself disabled for the same
   * pending state (a disabled element cannot receive focus, so focus fell
   * to `<body>`), and the in-flight mutation's `onSuccess` still fired
   * later regardless, contradicting the dialog having visually "closed".
   * Gating BOTH controls on `pendiente`, mirroring the confirm button, is
   * the single place that answers "what happens on Escape/Cancel while our
   * own mutation is pending": nothing, until it settles.
   */
  it('pendiente=true bloquea Escape — NO llama a onCancelar mientras la propia mutación está en vuelo', () => {
    const { onCancelar } = renderDialog({ pendiente: true });

    // `fireEvent.keyDown` directo sobre el contenedor `alertdialog`, no
    // `user.keyboard`: con `pendiente=true` desde el montaje, el botón de
    // confirmación YA nace `disabled` y el efecto de foco-al-montar no
    // puede posarlo ahí (un elemento disabled no es focuseable) — el foco
    // real de jsdom queda en `<body>`, fuera del árbol del diálogo, así que
    // `user.keyboard` (que despacha sobre `document.activeElement`) nunca
    // llegaría al `onKeyDown` del propio diálogo y el test pasaría por la
    // razón equivocada. Disparar el evento directo sobre el contenedor
    // ejercita el guard real, independiente de dónde esté el foco del DOM.
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

    expect(onCancelar).not.toHaveBeenCalled();
  });

  // Touch-target quick win (round 2, P2): destructive confirms get the
  // house default 36px control, not the 24px `xs` size. Asserted via
  // Button's own `data-size` contract, not class strings.
  it('renderiza Confirmar y Cancelar en el tamaño default (36px), no xs', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'data-size',
      'default',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'data-size',
      'default',
    );
  });

  it('pendiente=true deshabilita el botón Cancelar y su click NO llama a onCancelar', async () => {
    const { onCancelar } = renderDialog({ pendiente: true });

    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelar).toBeDisabled();

    // `fireEvent` bypasea el `disabled` (jsdom no impone interactability como
    // `userEvent`) — ejercita el guard directamente, no solo el atributo
    // visual, como el resto de la suite hace con los triggers del footer.
    fireEvent.click(cancelar);

    expect(onCancelar).not.toHaveBeenCalled();
  });
});
