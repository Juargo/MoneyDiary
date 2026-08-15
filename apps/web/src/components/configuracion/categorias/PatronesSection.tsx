import { useState } from 'react';
import { Info } from 'lucide-react';
import type { PatronDto } from '@/api/types';
import { EtiquetaResponsiva } from '../EtiquetaResponsiva';
import { PatronFila } from './PatronFila';

let contadorFilasNuevas = 0;

/**
 * PatronesSection (US-043 PR #4, design.md §1/Q3b/Q9a/Q9b, WCTG-04, WCTG-06)
 * — the pattern-row list, `Agregar patrón`, and the always-rendered
 * `sin patrones` note. Lives **outside** `#form-identidad` (§1/Q3b's DOM
 * boundary — `EditarCategoria` wires this in task 42): pattern commits are
 * fully independent of `Guardar`/`Cancelar`.
 *
 * **`filasNuevas`**: client-only placeholders for rows not yet `POST`ed
 * (design.md §1/Q9a — `Agregar patrón` appends a blank row whose first
 * commit is a `POST`). Keyed by a monotonically increasing counter, not
 * `crypto.randomUUID()` — this list is presentation-only local state, no
 * persistence, no collision risk across sessions (`kiss`/`yagni`). A row
 * removes itself from this list via `onDescartar` (`PatronFila`'s docblock)
 * either after a successful create (the real row then appears through
 * `patrones`, refetched by profile A's invalidation) or an immediate
 * same-row delete with zero requests.
 *
 * **The `sin patrones` note is always rendered** (decision 9, WCTG-06),
 * below the pattern list, preceded by an `aria-hidden` info icon, in the
 * SAME position regardless of pattern count — helper text, not a
 * conditional zero-state. It reads oddly above several listed patterns;
 * that was settled in the proposal against the drawn evidence and is not
 * re-litigated here.
 *
 * **Success announcement (judgment-day round 2 WARNING, design.md §1/Q3
 * mechanism 2)**: a `role="status"` live region lives HERE, not inside
 * `PatronFila`. Structural clone of `ListaIngestas`'s fix for the same
 * class of bug (`EliminarIngestaControl`'s docblock): a per-row `aria-live`
 * span unmounts along with its `<li>` the moment the row it announces about
 * disappears — a successful create removes the placeholder via
 * `onDescartar`, a successful delete removes the row via the `['categorias']`
 * refetch — racing the announcement against its own removal. This region is
 * OUTSIDE the `<ul>`, so it survives any individual row unmounting.
 * `PatronFila` calls `onAnunciar(mensaje)` on each successful mutation
 * instead of announcing anything itself.
 *
 * **Re-announcing an identical message (judgment-day redesign, PR #4,
 * 2026-08-14)**: two successes in a row producing the SAME sentence (e.g.
 * `Patrón guardado.` twice) used to collapse into one identical `setState`
 * — React bails, the DOM text never actually changes, and assistive tech
 * never re-announces the second one. `anuncio` carries a monotonically
 * increasing `id` alongside the message text, and that `id` is used as the
 * `key` of the inner `<span>` that actually holds the text — a `key` change
 * forces React to unmount the old text node and mount a genuinely new one
 * (a real `childList` DOM mutation), which screen readers'
 * `MutationObserver`-based live-region watchers pick up even when the text
 * CONTENT is unchanged. This idiom is copied from `ListaIngestas`'s
 * `role="status"` region — fixing the re-announce gap here does not
 * obligate fixing it there too (out of scope for this PR).
 *
 * **US-063 PR #3 (D-03/D-04, WCTM-06, text swap only):** the heading,
 * `Agregar patrón`, and the zero-patterns note (WCTG-06) all shorten below
 * `md` via `EtiquetaResponsiva`, all 2-band (`tablet` omitted — `WCTM-06`'s
 * table marks tablet "(unchanged)" for these three). The "always rendered,
 * not a zero-state" semantic (decision 9, above) is untouched — only the
 * STRING shortens (Q-05).
 *
 * The `<h2 id="titulo-patrones">` gains `aria-label={escritorio string}`
 * despite not being interactive — `PatronesSection`'s `<section>` is named
 * via `aria-labelledby="titulo-patrones"`, so an unstable heading name would
 * silently rename the landmark (D-04's one exception to "only interactive
 * controls get `aria-label`"). `Agregar patrón` IS interactive, so it keeps
 * D-04's hard rule: `aria-label="Agregar patrón"`, the same idiom
 * `CategoriasPanel`'s `Nueva categoría` button already uses — without it,
 * jsdom's name-from-content would compute the CONCATENATION of both spans
 * ("AgregarAgregar patrón"), breaking every `getByRole('button', {name:
 * 'Agregar patrón'})` query in the shipped suite. The zero-patterns note
 * stays a non-interactive `<p>` — D-04's rule does NOT apply to it; its test
 * queries the variant string directly (`getByText(...)`), never the
 * paragraph's `textContent` (all variants concatenated in jsdom).
 */
export function PatronesSection({
  categoriaId,
  patrones,
  esDemo,
  bloqueado = false,
}: {
  readonly categoriaId: string;
  readonly patrones: ReadonlyArray<PatronDto>;
  readonly esDemo: boolean;
  /**
   * Judgment-day finding (PR #4, 2026-08-14): `ConfirmarImpactoDialog` is
   * intentionally non-modal (no focus trap), so a keyboard user could Tab
   * past an OPEN confirmation into this section's still-live rows/button.
   * `EditarCategoria` passes `dialogo !== null` here — the SAME condition
   * that already gates `Nombre`/`Bucket`/`Cancelar`/`Guardar` on that
   * screen, not a new mechanism.
   */
  readonly bloqueado?: boolean;
}) {
  const [filasNuevas, setFilasNuevas] = useState<ReadonlyArray<number>>([]);
  const [anuncio, setAnuncio] = useState({ mensaje: '', id: 0 });

  function agregarFila() {
    contadorFilasNuevas += 1;
    setFilasNuevas((actual) => [...actual, contadorFilasNuevas]);
  }

  function quitarFilaNueva(clave: number) {
    setFilasNuevas((actual) => actual.filter((c) => c !== clave));
  }

  function anunciar(mensaje: string) {
    setAnuncio((actual) => ({ mensaje, id: actual.id + 1 }));
  }

  return (
    <section aria-labelledby="titulo-patrones" className="flex flex-col gap-3">
      <h2
        id="titulo-patrones"
        aria-label="Patrones de auto-categorización"
        className="text-sm font-semibold text-slate-900"
      >
        <EtiquetaResponsiva
          movil="Patrones"
          escritorio="Patrones de auto-categorización"
        />
      </h2>
      <span role="status" aria-live="polite" className="sr-only">
        <span key={anuncio.id}>{anuncio.mensaje}</span>
      </span>
      <ul className="flex flex-col">
        {patrones.map((patron) => (
          <PatronFila
            key={patron.id}
            categoriaId={categoriaId}
            patron={patron}
            esDemo={esDemo}
            bloqueado={bloqueado}
            onAnunciar={anunciar}
          />
        ))}
        {filasNuevas.map((clave) => (
          <PatronFila
            key={clave}
            categoriaId={categoriaId}
            esDemo={esDemo}
            bloqueado={bloqueado}
            onDescartar={() => quitarFilaNueva(clave)}
            onAnunciar={anunciar}
          />
        ))}
      </ul>
      <div>
        <button
          type="button"
          aria-label="Agregar patrón"
          disabled={esDemo || bloqueado}
          onClick={agregarFila}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          <EtiquetaResponsiva movil="Agregar" escritorio="Agregar patrón" />
        </button>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <EtiquetaResponsiva
          movil="Sin patrones: solo asignación manual."
          escritorio="Sin patrones, la categoría solo se puede asignar manualmente."
        />
      </p>
    </section>
  );
}
