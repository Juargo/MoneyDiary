import { useState } from 'react';
import { useCrearPatron } from '@/api/use-crear-patron';
import { mensajeDeErrorCatalogo } from '@/components/configuracion/categorias/mensajes-catalogo';
import { SelectorPalabrasPatron } from './SelectorPalabrasPatron';
import { Button } from '@/components/ui/button';

/**
 * OfrecerPatronControl — the non-blocking, dismissible offer to turn a just
 * -reclassified movement into a classification pattern (issue #745). The
 * usability finding this closes: after reclassifying a movement, nothing
 * ever offered to make it stick, and the tester never discovered patterns
 * (which today can only be typed by hand in Configuración → Categorías).
 *
 * Two stages, both dismissible without touching the reclassification that
 * already succeeded (the caller mounts this ONLY after that commit settles
 * — see `ReclasificarCategoriaControl`):
 *   1. "oferta" — a one-line prompt + "Crear patrón" / "Ahora no".
 *   2. "seleccion" — `SelectorPalabrasPatron` (the word-picking widget),
 *      wired to the EXISTING `POST /api/patrones` mutation (`useCrearPatron`,
 *      already used by the Configuración → Categorías patrones editor) —
 *      no new endpoint, no client-side reimplementation of `coincide()`'s
 *      matching logic (ADR-024). `matchType` is always `'CONTAINS'`: the
 *      selected words are always a literal substring of the description
 *      (`SelectorPalabrasPatron`'s own contiguity guarantee), so `CONTAINS`
 *      is the only match type that makes sense here — there is no UI to
 *      pick a different one, deliberately (YAGNI: this flow's whole point
 *      is skipping the manual matchType/patron form).
 *
 * A failed creation renders inline (`role="alert"`, same
 * `mensajeDeErrorCatalogo` table every other catalog mutation uses) and
 * keeps the picker mounted so the user can retry or back out — it NEVER
 * calls `onCerrar` or `onCreado` on its own, and it never touches the
 * reclassification, which already committed before this component existed
 * on screen.
 *
 * Focus discipline (a11y): mounting this component does NOT move focus —
 * unlike `InlineConfirm` (used by the cross-bucket confirmation), this is a
 * non-blocking, low-stakes offer, not an alertdialog interrupting a
 * destructive/money-moving action. The row's already-fired "Movida a
 * {label}." announcement (the page's shared `role="status"` region) already
 * tells a screen-reader user the mutation succeeded; a forced-focus jump
 * into a brand new, unrelated offer right after that would be jarring, not
 * helpful. The offer is reachable in the natural tab order right after the
 * row's own controls instead.
 */
export function OfrecerPatronControl({
  descripcion,
  categoriaId,
  onCreado,
  onCerrar,
}: {
  readonly descripcion: string;
  readonly categoriaId: string;
  /** Fires once the pattern is actually saved, with the exact pattern text
   * that was sent — the caller announces it via the page's shared status
   * region and unmounts this control. */
  readonly onCreado: (patron: string) => void;
  /** Fires when the offer is dismissed WITHOUT creating a pattern (either
   * "Ahora no" or "Cancelar" from the word-picker). Never fires after a
   * successful creation. */
  readonly onCerrar: () => void;
}) {
  const [etapa, setEtapa] = useState<'oferta' | 'seleccion'>('oferta');
  const mutacion = useCrearPatron();

  function confirmarPatron(patron: string) {
    mutacion.mutate(
      { categoriaId, patron, matchType: 'CONTAINS' },
      { onSuccess: () => onCreado(patron) },
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 shadow-md">
      {etapa === 'oferta' ? (
        <>
          <p className="text-sm text-foreground">
            ¿Reconocer automáticamente este movimiento en tus próximas cartolas?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={onCerrar}
            >
              Ahora no
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setEtapa('seleccion')}
            >
              Crear patrón
            </Button>
          </div>
        </>
      ) : (
        <>
          <SelectorPalabrasPatron
            descripcion={descripcion}
            pending={mutacion.isPending}
            onConfirmar={confirmarPatron}
            onCancelar={onCerrar}
          />
          {mutacion.isError && (
            <p role="alert" className="text-xs text-error-foreground">
              {mensajeDeErrorCatalogo(mutacion.error)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
