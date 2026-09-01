import { useId } from 'react';
import { construirOpcionesBucket } from '@/lib/bucket-colors';
import { iconoDeBucket } from '@/lib/bucket-icons';

/**
 * SelectorBucket (2026-08-30) — segmented control of native radio inputs,
 * replacing the per-row bucket `<select>` in `FilaRevision`. Presentational
 * only: no internal state, no catalog knowledge beyond the `buckets` prop it
 * receives — the same contract `CampoSelect` follows for the categoría
 * select it sits next to.
 *
 * Markup: `<fieldset aria-label>` (the group's accessible name, e.g.
 * "Fila 3: bucket") → a short visible `columnLabel` (mirrors `CampoSelect`'s
 * `columnLabel`: visible on mobile, `sm:sr-only` once `PreviewMuestra`'s
 * shared column header takes over) → one `<label>` per option, each wrapping
 * a `sr-only` native radio (`peer`) plus a visible `<span>` chip. Native
 * radios give arrow-key navigation and `checked` semantics for free — no
 * `role="radio"` hand-rolling.
 *
 * Options: a leading `{ value: '', label: 'Sin categoría' }` sentinel, then
 * one per `buckets` entry via `construirOpcionesBucket` (so the UI label is
 * "Gustos" while the option value stays the domain key "Deseos").
 *
 * Chip fill (DESIGN.md shape lock: 6px radius/`rounded-md`, 32px height/`h-8`,
 * 14px text/`text-sm`): unselected chips are a plain bordered card; the
 * `peer-checked:` variant paints the SAME bucket pastel `FilaRevision`
 * already keyed off `ETIQUETA_BUCKET`/`bg-*` tokens elsewhere (index.css
 * `@theme`). Tailwind can't see dynamic class strings, so the fill classes
 * are a literal, static map — anything not in it (there is nothing today)
 * falls back to `peer-checked:bg-muted`.
 *
 * Checked emphasis (2026-08-31): the pastels are light by design (Two-Tier
 * Color Rule), and the first version paired them with
 * `peer-checked:border-transparent` — so the selected chip actually LOST
 * definition and read as the weakest chip in the group. It now gains
 * definition instead: an ink `border-foreground` outline, `shadow-sm`
 * elevation (the house ceiling short of `shadow-md`, which is reserved for
 * popovers) and `font-semibold`. Geometry is untouched on purpose — the
 * chips live in a fixed 2-column grid, so scaling the checked one would
 * shove its neighbours around on every click. Color is still never the only
 * carrier of selection: outline, elevation, weight and the native `checked`
 * value all carry it. Focus stays distinguishable because it adds the
 * shared 3px `ring/50` halo on top.
 *
 * Equal-width chips (2026-08-31, DESIGN.md "Bucket Segmented Control"): the
 * options wrapper is a `grid`, not `flex flex-wrap` — a flex-wrap row gave
 * every chip its own intrinsic width ("Sin categoría" wide, "Ahorro"
 * cramped), which read as uneven and, at narrow widths, wrapped
 * unpredictably. `grid-cols-2` (2×2) at EVERY breakpoint: this control
 * lives in half a row from `sm` up (`FilaRevision`'s `sm:flex-1` column,
 * the other half is the categoría select), and four equal chips in that
 * half-row clipped to "S… / N… / G… / A…" even at 1280px — a one-row
 * `auto-cols-fr` variant was tried and reverted on that screenshot. Two
 * columns give every chip 150–225px, so no label is ever truncated: there
 * is deliberately NO `truncate` on the label text, and the chip is
 * `min-h-8` (not `h-8`) so an unexpectedly long label wraps and grows the
 * chip instead of clipping. Each `<label>` is `block min-w-0` (grid item,
 * no intrinsic flex-basis) and its chip `<span>` is `flex w-full
 * justify-center` so the chip fills its grid cell. Option count is NOT
 * fixed at 4: `agruparPorBucket` drops buckets with no categorías, so 2, 3
 * or 4 options are all real — with an odd count the last chip spans both
 * columns (`[&>label:last-child:nth-child(odd)]:col-span-2`) so the grid
 * closes evenly instead of leaving an orphan half-row. `px-2` (not `px-3`)
 * keeps "Sin categoría" + glyph on one line inside a ~140px cell at 360px.
 */

const RELLENO_BUCKET: Record<string, string> = {
  Necesidades: 'peer-checked:bg-necesidades',
  Deseos: 'peer-checked:bg-gustos',
  Ahorro: 'peer-checked:bg-ahorro',
};
const RELLENO_POR_DEFECTO = 'peer-checked:bg-muted';

const SENTINEL_BUCKET_OPTION = { value: '', label: 'Sin categoría' } as const;

export function SelectorBucket({
  label,
  columnLabel,
  value,
  onChange,
  buckets,
  disabled = false,
}: {
  readonly label: string;
  readonly columnLabel: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly buckets: readonly string[];
  readonly disabled?: boolean;
}) {
  const name = useId();
  const options = [SENTINEL_BUCKET_OPTION, ...construirOpcionesBucket(buckets)];

  return (
    <fieldset
      aria-label={label}
      disabled={disabled}
      className="m-0 flex flex-col gap-1 border-0 p-0"
    >
      <span
        className="text-xs text-muted-foreground sm:sr-only"
        aria-hidden="true"
      >
        {columnLabel}
      </span>
      <div className="grid grid-cols-2 gap-1.5 [&>label:last-child:nth-child(odd)]:col-span-2">
        {options.map((option) => {
          const relleno = RELLENO_BUCKET[option.value] ?? RELLENO_POR_DEFECTO;
          // Decorative glyph per bucket (`lib/bucket-icons.ts`): `aria-hidden`,
          // so each radio's accessible name stays exactly the option label.
          const Icono = iconoDeBucket(option.value);
          return (
            <label key={option.value} className="block min-w-0 cursor-pointer">
              <input
                type="radio"
                className="peer sr-only"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                disabled={disabled}
              />
              <span
                className={`flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-card px-2 text-sm text-foreground hover:bg-accent peer-checked:border-foreground peer-checked:font-semibold peer-checked:shadow-sm peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${relleno}`}
              >
                <Icono aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0">{option.label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
