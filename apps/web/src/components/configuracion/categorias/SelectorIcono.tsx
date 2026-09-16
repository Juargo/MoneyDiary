import { createElement } from 'react';
import { ICONOS_CATEGORIA } from '@/api/catalogo-constantes';
import type { IconoCategoria } from '@/api/catalogo-constantes';
import { ETIQUETA_ICONO, iconoCategoria } from '@/lib/iconos-categoria';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from '../estilos';

/** "Sin icono" FIRST, then the 24-name allowlist in picker order (D-05/CATICO-01). */
const OPCIONES: ReadonlyArray<IconoCategoria | null> = [
  null,
  ...ICONOS_CATEGORIA,
];

/**
 * SelectorIcono (categoria-iconografia, ADR-045, design.md "UI", WCTG-04,
 * CATICO-08) — a `fieldset`/`legend` "Icono (opcional)" wrapping 25 native
 * radios sharing one `name`. Native `<input type="radio">` grouped by
 * `name` gives arrow-key roving and Space-to-select for free (verified
 * against this repo's jsdom+`@testing-library/user-event` setup — no extra
 * keyboard wiring needed), so this component only has to render controlled
 * inputs and forward `onChange`.
 *
 * Each option is a `size-10` (40px, ≥ design's "≥40px targets") visible
 * radio input with the resolved lucide glyph layered on top
 * (`pointer-events-none`, so clicks land on the input underneath, not the
 * decorative icon). `FOCUS_RING` (`../estilos.ts`) is applied directly to
 * the input itself — same convention as `CategoriaFila`'s icon-only
 * controls — so the visible focus ring tracks REAL keyboard focus, not a
 * simulated one. The selected option gets a 2px `--primary` ring
 * (`checked:` variant, native `:checked` pseudo-class — no extra state to
 * keep in sync with `value`).
 *
 * Accessible name per option is `ETIQUETA_ICONO[opcion]` (Spanish,
 * CATICO-08 — "never the raw lucide identifier"); "Sin icono" is a plain
 * Spanish label, already human-readable by construction. Presentational
 * and controlled (container-presentational pattern) — callers
 * (`NuevaCategoriaForm`, `EditarCategoria`) own the `IconoCategoria | null`
 * state and decide when it travels with a mutation (WCTG-04).
 */
export function SelectorIcono({
  name,
  value,
  onChange,
  disabled,
}: {
  readonly name: string;
  readonly value: IconoCategoria | null;
  readonly onChange: (value: IconoCategoria | null) => void;
  readonly disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">
        Icono (opcional)
      </legend>
      <div className="flex flex-wrap gap-2">
        {OPCIONES.map((opcion) => {
          const etiqueta =
            opcion === null ? 'Sin icono' : ETIQUETA_ICONO[opcion];
          return (
            <span key={opcion ?? 'sin-icono'} className="relative inline-flex">
              <input
                type="radio"
                name={name}
                value={opcion ?? 'sin-icono'}
                checked={value === opcion}
                onChange={() => onChange(opcion)}
                disabled={disabled}
                aria-label={etiqueta}
                className={cn(
                  'size-10 shrink-0 cursor-pointer appearance-none rounded border border-border',
                  'checked:border-primary checked:ring-2 checked:ring-primary',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  FOCUS_RING,
                )}
              />
              {/* `createElement`, not a JSX tag — see IconoCategoriaBadge.tsx's
                  docstring for why `react-hooks/static-components` needs this. */}
              {createElement(iconoCategoria(opcion), {
                'aria-hidden': 'true',
                className:
                  'pointer-events-none absolute inset-0 m-auto size-5 text-foreground',
              })}
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
