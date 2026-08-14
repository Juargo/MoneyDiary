import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmarPasswordDialog } from './ConfirmarPasswordDialog';

/**
 * ConfirmarPasswordDialog.test.tsx — US-042 design.md §1/Q7c, §1/Q9c. El
 * diálogo no sabe si está vinculando o desvinculando (D-02) — estas pruebas
 * lo ejercitan con props genéricas, sin mencionar Google.
 */
function renderDialog(
  overrides: Partial<{
    readonly titulo: string;
    readonly descripcion: string;
    readonly textoConfirmar: string;
    readonly pendiente: boolean;
    readonly error: string | null;
    readonly onConfirmar: (passwordActual: string) => void;
    readonly onCancelar: () => void;
  }> = {},
) {
  const onConfirmar = overrides.onConfirmar ?? vi.fn();
  const onCancelar = overrides.onCancelar ?? vi.fn();
  render(
    <ConfirmarPasswordDialog
      titulo={overrides.titulo ?? 'Vincular con Google'}
      descripcion={
        overrides.descripcion ??
        'Vas a salir de MoneyDiary para autorizar en Google. Los cambios sin guardar se perderán.'
      }
      textoConfirmar={overrides.textoConfirmar ?? 'Vincular'}
      pendiente={overrides.pendiente ?? false}
      error={overrides.error ?? null}
      onConfirmar={onConfirmar}
      onCancelar={onCancelar}
    />,
  );
  return { onConfirmar, onCancelar };
}

describe('ConfirmarPasswordDialog', () => {
  it('renderiza role=alertdialog con aria-modal=false explícito', () => {
    renderDialog();
    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'false');
  });

  it('aria-labelledby apunta al título y aria-describedby a la advertencia (se anuncia)', () => {
    renderDialog({ descripcion: 'Vas a salir de MoneyDiary.' });
    const dialogo = screen.getByRole('alertdialog');
    const tituloId = dialogo.getAttribute('aria-labelledby');
    const descripcionId = dialogo.getAttribute('aria-describedby');
    expect(tituloId).toBeTruthy();
    expect(descripcionId).toBeTruthy();
    expect(document.getElementById(tituloId!)).toHaveTextContent(
      'Vincular con Google',
    );
    expect(document.getElementById(descripcionId!)).toHaveTextContent(
      'Vas a salir de MoneyDiary.',
    );
  });

  it('el foco se mueve al input de password al montar (no a Confirmar)', () => {
    renderDialog();
    expect(screen.getByLabelText('Password actual')).toHaveFocus();
  });

  it('Escape llama a onCancelar', async () => {
    const user = userEvent.setup();
    const { onCancelar } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancelar).toHaveBeenCalledOnce();
  });

  it('Cancelar llama a onCancelar', async () => {
    const user = userEvent.setup();
    const { onCancelar } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancelar).toHaveBeenCalledOnce();
  });

  it('Confirmar llama a onConfirmar con la password escrita', async () => {
    const user = userEvent.setup();
    const { onConfirmar } = renderDialog({ textoConfirmar: 'Desvincular' });
    await user.type(screen.getByLabelText('Password actual'), 'secreta');
    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    expect(onConfirmar).toHaveBeenCalledWith('secreta');
  });

  it('Confirmar con la password vacía NO llama a onConfirmar (WCFG-08 escenario 2)', async () => {
    // El spec exige que la acción de confirmar quede BLOQUEADA hasta que haya
    // un valor. Sin esta guarda el diálogo mandaba `''` al servidor. Dos
    // capas, igual que `PerfilForm` (design Q1c): `required` nativo es la
    // afordancia, la guarda en JS es el portón — `fireEvent`/`user.click`
    // sobre un submit saltea la validación de constraint nativa en jsdom, así
    // que un test que confiara solo en `required` pasaría en verde sin que el
    // bloqueo exista.
    const user = userEvent.setup();
    const { onConfirmar } = renderDialog({ textoConfirmar: 'Desvincular' });
    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('el input de password del diálogo es required (afordancia nativa, WCFG-08)', () => {
    renderDialog();
    expect(screen.getByLabelText('Password actual')).toBeRequired();
  });

  it('Confirmar está disabled mientras pendiente, pero el input de password sigue habilitado', () => {
    renderDialog({ pendiente: true });
    expect(screen.getByRole('button', { name: 'Vincular' })).toBeDisabled();
    expect(screen.getByLabelText('Password actual')).toBeEnabled();
  });

  it('un error se muestra inline vía role=alert, dentro del diálogo', () => {
    renderDialog({
      error: 'No se pudo cambiar la password. Revisa tu password actual.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo cambiar la password. Revisa tu password actual.',
    );
  });

  it('sin error no renderiza ningún role=alert', () => {
    renderDialog({ error: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
