import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CampoTexto } from '../CampoTexto';

/**
 * ConfirmarPasswordDialog — el diálogo `role="alertdialog"` hand-rolled que
 * gatilla `Vincular con Google`/`Desvincular` (US-042 design.md §1/Q7c,
 * §2/D-02, WCFG-08/WCFG-12).
 *
 * **No sabe si está vinculando o desvinculando** (D-02): solo `titulo`,
 * `descripcion`, `textoConfirmar`, `pendiente`, `error`,
 * `onConfirmar(passwordActual)`, `onCancelar`. `GoogleVinculoSection` (el
 * único caller) decide la copy y qué mutación disparar; un tercer botón
 * password-gated costaría cero cambios acá (OCP).
 *
 * Foco IN → el input de password, no `Confirmar` (divergencia deliberada de
 * `EliminarIngestaControl`: acá lo primero que el usuario debe hacer es
 * escribir, no confirmar). Foco OUT → responsabilidad del CALLER: `onCancelar`
 * cierra Y restaura el foco al trigger en `GoogleVinculoSection` (mismo
 * idioma que `EliminarIngestaControl.cancelar()`) — Escape solo delega a
 * `onCancelar`, no restaura nada por sí mismo.
 *
 * `aria-modal="false"` EXPLÍCITO: es un widget inline, sin focus trap — el
 * resto de la página sigue siendo alcanzable. Decir `"true"` sin atrapar el
 * foco sería mentirle a un lector de pantalla.
 *
 * `aria-labelledby`/`aria-describedby` (NO `aria-label`): la advertencia de
 * "vas a salir de la app" vive en un `<p>` real, así que se anuncia al
 * abrirse el diálogo — con `aria-label` no se anunciaría.
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
  const tituloId = useId();
  const descripcionId = useId();

  // Foco al abrir → el input de password (Q7c). Este componente solo existe
  // montado mientras el diálogo está abierto (el caller lo monta/desmonta
  // condicionalmente), así que un efecto de montaje basta — no hace falta
  // una prop `abierto`.
  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  // `role="alertdialog"`'s ARIA superclass chain is `window > dialog`, not
  // `widget` (verified against aria-query 5.3.2's `roles.get('alertdialog')`),
  // so `isInteractiveRole`/`isInteractiveElement` never recognise it — this
  // rule cannot distinguish a real dialog's Escape-to-close container from an
  // arbitrary `<div onKeyDown>`. The WAI-ARIA dialog pattern (and
  // `EliminarIngestaControl`'s existing, unscoped instance of the exact same
  // shape) binds Escape at the dialog container, not the input; moving it to
  // `<CampoTexto>` would silently drop Escape-to-cancel for anyone tabbed to
  // the Cancelar/Confirmar buttons.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={tituloId}
      aria-describedby={descripcionId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onCancelar();
        }
      }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground shadow-sm"
    >
      <h2 id={tituloId} className="text-sm font-semibold text-slate-900">
        {titulo}
      </h2>
      <p id={descripcionId} className="text-sm text-slate-600">
        {descripcion}
      </p>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <CampoTexto
          ref={passwordRef}
          label="Password actual"
          value={passwordActual}
          onChange={setPasswordActual}
          type="password"
          required
          autoComplete="current-password"
        />
        {error !== null && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {textoConfirmar}
          </button>
        </div>
      </form>
    </div>
  );
}
