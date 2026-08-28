import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineConfirm } from './inline-confirm';

/**
 * InlineConfirm.test.tsx — the shared `role="alertdialog"` recipe extracted
 * from EliminarIngestaControl / ReclasificarCategoriaControl /
 * ConfirmarPasswordDialog / ConfirmarImpactoDialog (a11y round, part 1,
 * DESIGN.md "Inline Confirmation Dialog"). These tests cover the shell's
 * OWN mechanics in isolation; each migrated call site keeps its own test
 * suite for site-specific copy/behavior (that's the whole point of sharing
 * only the scaffolding, not the content).
 */
function renderInlineConfirm(
  overrides: Partial<Parameters<typeof InlineConfirm>[0]> = {},
) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <InlineConfirm
      title={overrides.title ?? 'Confirmar acción'}
      confirmLabel={overrides.confirmLabel ?? 'Confirmar'}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    >
      {overrides.children ?? <p>Esto no se puede deshacer.</p>}
    </InlineConfirm>,
  );
  return { onConfirm, onCancel };
}

describe('InlineConfirm', () => {
  it('renders role="alertdialog" with aria-modal="false" explicit (non-modal by product decision)', () => {
    renderInlineConfirm();
    expect(screen.getByRole('alertdialog')).toHaveAttribute(
      'aria-modal',
      'false',
    );
  });

  it('defaults to a hidden title used as aria-label, with no visible heading rendered', () => {
    renderInlineConfirm({ title: 'Confirmar eliminación' });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-label', 'Confirmar eliminación');
    expect(screen.queryByText('Confirmar eliminación')).not.toBeInTheDocument();
  });

  it('titleVisible renders the title and wires aria-labelledby to it', () => {
    renderInlineConfirm({ title: 'Vincular con Google', titleVisible: true });
    const dialog = screen.getByRole('alertdialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)).toHaveTextContent(
      'Vincular con Google',
    );
    expect(dialog).not.toHaveAttribute('aria-label');
  });

  it('titleAsHeading renders the visible title as an <h2>', () => {
    renderInlineConfirm({
      title: 'Vincular con Google',
      titleVisible: true,
      titleAsHeading: true,
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Vincular con Google' }),
    ).toBeInTheDocument();
  });

  it('an explicit ariaLabel overrides the accessible name even when the title is visible (per-instance disambiguation)', () => {
    renderInlineConfirm({
      title: 'Eliminar categoría',
      titleVisible: true,
      ariaLabel: 'Confirmar eliminación de Supermercado',
    });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute(
      'aria-label',
      'Confirmar eliminación de Supermercado',
    );
    expect(dialog).not.toHaveAttribute('aria-labelledby');
    // The visible title text still renders — only the ACCESSIBLE name changes.
    expect(screen.getByText('Eliminar categoría')).toBeInTheDocument();
  });

  it('aria-describedby always points to an element containing the body (children)', () => {
    renderInlineConfirm({
      children: <p>Se eliminarán 12 movimientos.</p>,
    });
    const dialog = screen.getByRole('alertdialog');
    const describedById = dialog.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById!)).toHaveTextContent(
      'Se eliminarán 12 movimientos.',
    );
  });

  it('moves focus to the Confirmar button on mount by default', () => {
    renderInlineConfirm({ confirmLabel: 'Confirmar' });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
  });

  it('honors initialFocusRef, moving focus there instead of the confirm button', () => {
    function Wrapper() {
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <InlineConfirm
          title="Vincular con Google"
          confirmLabel="Vincular"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          initialFocusRef={inputRef}
          extra={<input ref={inputRef} aria-label="Password actual" />}
        >
          <p>Vas a salir de la app.</p>
        </InlineConfirm>
      );
    }
    render(<Wrapper />);
    expect(screen.getByLabelText('Password actual')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Vincular' })).not.toHaveFocus();
  });

  it('Escape calls onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderInlineConfirm();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancelar calls onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderInlineConfirm();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking Confirmar calls onConfirm (non-form mode)', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderInlineConfirm({ confirmLabel: 'Confirmar' });
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('pending disables the confirm button but not the cancel button by default', () => {
    renderInlineConfirm({ pending: true, confirmLabel: 'Confirmar' });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('cancelDisabled disables the cancel button', () => {
    renderInlineConfirm({ cancelDisabled: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('Escape still calls onCancel even when cancelDisabled is true — the shell always forwards Escape unconditionally; a caller that must also block Escape while pending (e.g. ConfirmarImpactoDialog) is responsible for guarding inside its own onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderInlineConfirm({ cancelDisabled: true, onCancel });
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders Confirmar and Cancelar at the house default (36px) size, never xs', () => {
    renderInlineConfirm({ confirmLabel: 'Confirmar' });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveAttribute(
      'data-size',
      'default',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute(
      'data-size',
      'default',
    );
  });

  it('destructive renders the confirm button with the destructive variant', () => {
    renderInlineConfirm({ destructive: true, confirmLabel: 'Eliminar' });
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
  });

  it('without destructive the confirm button uses the default variant', () => {
    renderInlineConfirm({ confirmLabel: 'Confirmar' });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveAttribute(
      'data-variant',
      'default',
    );
  });

  it('renders the error inline via role="alert" and keeps the dialog mounted', () => {
    renderInlineConfirm({ error: 'Ocurrió un error inesperado.' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado.',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('renders no role="alert" when error is null', () => {
    renderInlineConfirm({ error: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asForm wraps the body in a real <form>, and submitting it (fireEvent.submit — the same event Enter-in-field dispatches) calls onConfirm exactly once', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <InlineConfirm
        title="Vincular con Google"
        confirmLabel="Vincular"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        asForm
      >
        <p>Vas a salir de la app.</p>
      </InlineConfirm>,
    );
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('asForm: clicking the submit Confirmar calls onConfirm exactly once and does not reload (preventDefault)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <InlineConfirm
        title="Vincular con Google"
        confirmLabel="Vincular"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        asForm
      >
        <p>Vas a salir de la app.</p>
      </InlineConfirm>,
    );
    await user.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('without asForm the confirm button is type="button", not a submit', () => {
    renderInlineConfirm({ confirmLabel: 'Confirmar' });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('extra renders after the described body, outside the aria-describedby element', () => {
    render(
      <InlineConfirm
        title="Vincular con Google"
        confirmLabel="Vincular"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        extra={<input aria-label="Password actual" />}
      >
        <p>Vas a salir de la app.</p>
      </InlineConfirm>,
    );
    const dialog = screen.getByRole('alertdialog');
    const describedById = dialog.getAttribute('aria-describedby');
    const described = document.getElementById(describedById!);
    // The extra field's own label text must not leak into the description.
    expect(described).not.toHaveTextContent('Password actual');
    expect(screen.getByLabelText('Password actual')).toBeInTheDocument();
  });

  it('cancelDisabled renders a native disabled Cancelar — clicking it never reaches onCancel (the shell adds no guard of its own on top of `disabled`; a site needing to also block Escape while pending, like ConfirmarImpactoDialog, supplies an `onCancel` that already no-ops)', () => {
    const onCancel = vi.fn();
    renderInlineConfirm({ cancelDisabled: true, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
