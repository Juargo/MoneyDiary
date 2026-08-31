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
 * falls back to `peer-checked:bg-muted`. Color is never the only carrier of
 * selection state: `peer-checked:font-medium` plus the native `checked`
 * value both carry it too.
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
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const relleno = RELLENO_BUCKET[option.value] ?? RELLENO_POR_DEFECTO;
          // Decorative glyph per bucket (`lib/bucket-icons.ts`): `aria-hidden`,
          // so each radio's accessible name stays exactly the option label.
          const Icono = iconoDeBucket(option.value);
          return (
            <label key={option.value} className="cursor-pointer">
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
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm text-foreground hover:bg-accent peer-checked:border-transparent peer-checked:font-medium peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${relleno}`}
              >
                <Icono aria-hidden="true" className="size-3.5 shrink-0" />
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
