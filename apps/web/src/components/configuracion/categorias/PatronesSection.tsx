import { useState } from 'react';
import { Info } from 'lucide-react';
import type { PatronDto } from '@/api/types';
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
 */
export function PatronesSection({
  categoriaId,
  patrones,
  esDemo,
}: {
  readonly categoriaId: string;
  readonly patrones: ReadonlyArray<PatronDto>;
  readonly esDemo: boolean;
}) {
  const [filasNuevas, setFilasNuevas] = useState<ReadonlyArray<number>>([]);

  function agregarFila() {
    contadorFilasNuevas += 1;
    setFilasNuevas((actual) => [...actual, contadorFilasNuevas]);
  }

  function quitarFilaNueva(clave: number) {
    setFilasNuevas((actual) => actual.filter((c) => c !== clave));
  }

  return (
    <section aria-labelledby="titulo-patrones" className="flex flex-col gap-3">
      <h2 id="titulo-patrones" className="text-sm font-semibold text-slate-900">
        Patrones de auto-categorización
      </h2>
      <ul className="flex flex-col">
        {patrones.map((patron) => (
          <PatronFila
            key={patron.id}
            categoriaId={categoriaId}
            patron={patron}
            esDemo={esDemo}
          />
        ))}
        {filasNuevas.map((clave) => (
          <PatronFila
            key={clave}
            categoriaId={categoriaId}
            esDemo={esDemo}
            onDescartar={() => quitarFilaNueva(clave)}
          />
        ))}
      </ul>
      <div>
        <button
          type="button"
          disabled={esDemo}
          onClick={agregarFila}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Agregar patrón
        </button>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Sin patrones, la categoría solo se puede asignar manualmente.
      </p>
    </section>
  );
}
