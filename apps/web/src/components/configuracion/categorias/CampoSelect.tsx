import type { ChangeEvent } from 'react';

/**
 * CampoSelect — `<label>` envolviendo un `<select>` (US-043 design.md
 * §1/D-08). `configuracion/` no tenía ningún `<select>` hasta este PR.
 * Mismo idioma que `CampoTexto.tsx`: presentacional puro, sin estado propio,
 * sin saber nada de categorías ni buckets — solo `label`, `value`,
 * `onChange`, `options`, `required`, `disabled`.
 *
 * Las opciones llegan YA con su `label` de despliegue resuelto — el
 * lookup `ETIQUETA_BUCKET` (A1: se envía `Deseos`, se muestra `Gustos`) vive
 * en el call site (`NuevaCategoriaForm`, y luego `EditarCategoria` en PR
 * #3b), no dentro de este componente genérico. Esto lo mantiene reutilizable
 * para cualquier otro `<select>` de la feature (p.ej. `matchType` en
 * `PatronFila`, PR #4) sin acoplarlo al vocabulario de buckets.
 *
 * El `<label>` envolviendo el `<select>` es el mismo mecanismo del que
 * depende `getByLabelText` (WCFG-12) que ya usa `CampoTexto`.
 */
export function CampoSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  disabled = false,
  srOnly = false,
  columnLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly required?: boolean;
  readonly disabled?: boolean;
  /**
   * srOnly (US-059 D-10) — when `true`, wraps the label text in
   * `<span className="sr-only">` so it remains accessible to screen readers
   * but is visually hidden. Useful when a column header provides the visual
   * affordance and the per-row label is only needed for AT.
   *
   * When absent or `false`, the label renders as a visible plain text node
   * (existing callers: `NuevaCategoriaForm`, `EditarCategoria` — unchanged).
   */
  readonly srOnly?: boolean;
  /**
   * columnLabel (design critique P2 fix 1, responsive column identity) —
   * mutually exclusive with `srOnly`. When set, it REPLACES the default
   * label rendering: the visible text becomes this short word (e.g.
   * "Bucket") instead of the full `label` sentence, and it is shown only
   * below the `sm` breakpoint (`sm:sr-only`) — at `sm` and up a shared
   * column header takes over the same job for the whole list (see
   * `PreviewMuestra`'s `data-columnas-header` row), so the per-row word
   * would be redundant clutter once selects sit in a row.
   *
   * The full `label` sentence never disappears from the accessible name at
   * ANY breakpoint: it moves onto the `<select>`'s own `aria-label`, which
   * wins over the wrapping `<label>` text in accessible-name computation.
   * This keeps WCAG 2.5.3 (label-in-name) satisfied — `columnLabel` is a
   * case-insensitive substring of `label` (e.g. "Bucket" ⊂ "Fila 3: bucket").
   */
  readonly columnLabel?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
      {columnLabel ? (
        <span className="text-xs text-muted-foreground sm:sr-only">
          {columnLabel}
        </span>
      ) : srOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        label
      )}
      <select
        aria-label={columnLabel ? label : undefined}
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
        required={required}
        disabled={disabled}
        className="rounded-md border border-input px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
