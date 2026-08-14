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
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-600">
      {label}
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
        required={required}
        disabled={disabled}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
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
