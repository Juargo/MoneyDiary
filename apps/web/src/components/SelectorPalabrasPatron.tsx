import { useId, useState } from 'react';
import {
  palabrasDeDescripcion,
  patronDesdeRango,
} from '@/domain/palabras-de-descripcion';
import { alternarPalabra } from '@/domain/seleccion-contigua-palabras';
import type { RangoPalabras } from '@/domain/seleccion-contigua-palabras';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * SelectorPalabrasPatron — the word-picking widget for "patrón desde
 * movimiento" (issue #745). The pattern text is NEVER guessed by the app:
 * the description is shown split into words, and the user builds the
 * pattern by tapping the words that identify the merchant.
 *
 * Contiguity is enforced by the INTERACTION itself, not validated
 * afterwards (owner-approved design, hard rule): each click routes through
 * `alternarPalabra` (`domain/seleccion-contigua-palabras.ts`), a pure
 * reducer whose `RangoPalabras` return type can only ever represent a
 * contiguous inclusive range — there is no way for this component to end
 * up with a non-contiguous selection to reject. Clicking a word already
 * selected shrinks the range from whichever edge it sits at (or clears it,
 * if it is the only one); clicking a word adjacent to the range extends it;
 * clicking anywhere else (an interior word or a distant one) resets to a
 * fresh single-word selection there — always contiguous, always a single
 * unsurprising effect per click.
 *
 * The preview (`patronDesdeRango`) is the literal substring of the ORIGINAL
 * description spanning the selected words, never a rejoin of the split
 * tokens — this is what guarantees the saved pattern is a real substring
 * of the description (a `CONTAINS` match by construction, ADR-024: the
 * client never re-implements `coincide()`'s matching logic).
 *
 * a11y: every word is a real `<button>` (keyboard-reachable), `aria-pressed`
 * reflects whether it is part of the current range — never a clickable
 * `<span>`.
 */
export function SelectorPalabrasPatron({
  descripcion,
  pending = false,
  onConfirmar,
  onCancelar,
}: {
  readonly descripcion: string;
  readonly pending?: boolean;
  readonly onConfirmar: (patron: string) => void;
  readonly onCancelar: () => void;
}) {
  const idInstruccion = useId();
  const palabras = palabrasDeDescripcion(descripcion);
  const [rango, setRango] = useState<RangoPalabras | null>(null);

  const patron =
    rango === null
      ? null
      : patronDesdeRango(descripcion, palabras, rango.inicio, rango.fin);

  function alHacerClicEnPalabra(indice: number) {
    setRango((actual) => alternarPalabra(actual, indice));
  }

  function confirmar() {
    if (patron === null) return;
    onConfirmar(patron);
  }

  return (
    <div className="flex flex-col gap-3">
      <p id={idInstruccion} className="text-sm font-medium text-foreground">
        Elige las palabras que identifican a este comercio:
      </p>
      <div
        role="group"
        aria-labelledby={idInstruccion}
        className="flex flex-wrap gap-1.5"
      >
        {palabras.map((palabra, indice) => {
          const seleccionada =
            rango !== null && indice >= rango.inicio && indice <= rango.fin;
          return (
            <button
              key={`${palabra.inicio}-${palabra.texto}`}
              type="button"
              aria-pressed={seleccionada}
              disabled={pending}
              onClick={() => alHacerClicEnPalabra(indice)}
              className={cn(
                'rounded-md border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50',
                seleccionada
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
              )}
            >
              {palabra.texto}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {patron === null ? (
          'Selecciona al menos una palabra.'
        ) : (
          <>
            Se guardará como:{' '}
            <span className="font-medium text-foreground">«{patron}»</span>
          </>
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={patron === null || pending}
          onClick={confirmar}
        >
          Guardar patrón
        </Button>
      </div>
    </div>
  );
}
