import { useRef, useState } from 'react';
import { CampoTexto } from '../CampoTexto';
import { InlineConfirm } from '@/components/ui/inline-confirm';

/**
 * ConfirmarPasswordDialog — the `Vincular con Google`/`Desvincular`
 * confirmation (US-042 design.md §1/Q7c, §2/D-02, WCFG-08/WCFG-12), built on
 * the shared `InlineConfirm` shell (a11y round, part 1). This component only
 * owns the password field + submit guard; the alertdialog scaffolding
 * (Escape, focus, footer, sizing) lives in `InlineConfirm`.
 *
 * **No sabe si está vinculando o desvinculando** (D-02): solo `titulo`,
 * `descripcion`, `textoConfirmar`, `pendiente`, `error`,
 * `onConfirmar(passwordActual)`, `onCancelar`. `GoogleVinculoSection` (el
 * único caller) decide la copy y qué mutación disparar; un tercer botón
 * password-gated costaría cero cambios acá (OCP).
 *
 * Foco IN → el input de password, no `Confirmar` (divergencia deliberada de
 * `EliminarIngestaControl`: acá lo primero que el usuario debe hacer es
 * escribir, no confirmar) — via `InlineConfirm`'s `initialFocusRef`. Foco OUT
 * → responsabilidad del CALLER: `onCancelar` cierra Y restaura el foco al
 * trigger en `GoogleVinculoSection` (mismo idioma que
 * `EliminarIngestaControl.cancelar()`) — Escape solo delega a `onCancelar`,
 * no restaura nada por sí mismo.
 *
 * `InlineConfirm`'s `asForm` wraps the password field in a `<form>` so Enter
 * submits — the guard below (`onConfirmar` blocked on empty password) is the
 * same gate this component always owned, just no longer wired to a raw
 * `FormEvent` (that plumbing moved into `InlineConfirm`).
 *
 * `titleVisible`/`titleAsHeading` (real `<h2>`) + real `aria-labelledby`/
 * `aria-describedby` (NO `aria-label`): la advertencia de "vas a salir de la
 * app" vive en un `<p>` real (pasado como `children`, no `extra`), así que
 * se anuncia al abrirse el diálogo. El input de password va en `extra`
 * — participa del layout pero NO de la descripción anunciada (su propio
 * `<label>` visible ya lo nombra).
 *
 * `Confirmar` se deshabilita mientras `pendiente`; el input de password NO
 * (deshabilitarlo le quitaría el foco justo cuando el usuario podría querer
 * corregirlo).
 */
export function ConfirmarPasswordDialog({
  titulo,
  descripcion,
  textoConfirmar,
  pendiente,
  error,
  onConfirmar,
  onCancelar,
}: {
  readonly titulo: string;
  readonly descripcion: string;
  readonly textoConfirmar: string;
  readonly pendiente: boolean;
  readonly error: string | null;
  readonly onConfirmar: (passwordActual: string) => void;
  readonly onCancelar: () => void;
}) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [passwordActual, setPasswordActual] = useState('');

  function confirmar() {
    // WCFG-08 escenario 2: con la password vacía la confirmación queda
    // BLOQUEADA. El `required` del input de abajo es la afordancia; ESTA
    // guarda es el portón real, porque `fireEvent.submit`/`user.click` sobre
    // un submit saltean la validación de constraint nativa en jsdom (mismo
    // par de capas que `PerfilForm`, design Q1c). Comparación con `''`
    // estricta, sin `trim`, igual que el gate `falta-password-actual` de
    // `use-guardar-perfil.ts`: una password de espacios puede ser legítima y
    // no nos toca a nosotros rechazarla.
    if (passwordActual === '') return;
    onConfirmar(passwordActual);
  }

  return (
    <InlineConfirm
      title={titulo}
      titleVisible
      titleAsHeading
      confirmLabel={textoConfirmar}
      onConfirm={confirmar}
      onCancel={onCancelar}
      pending={pendiente}
      error={error}
      asForm
      initialFocusRef={passwordRef}
      className="gap-3 p-4 text-sm"
      extra={
        <CampoTexto
          ref={passwordRef}
          label="Password actual"
          value={passwordActual}
          onChange={setPasswordActual}
          type="password"
          required
          autoComplete="current-password"
        />
      }
    >
      <p className="text-sm text-muted-foreground">{descripcion}</p>
    </InlineConfirm>
  );
}
