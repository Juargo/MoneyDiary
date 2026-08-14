import type { ChangeEvent } from 'react';

/**
 * CampoTexto — `<label>` envolviendo un `<input>` (US-042 design.md §1/Q1a).
 * Extraído en su CUARTO uso (`nombre`, `email`, `passwordActual`,
 * `passwordNueva` en `PerfilForm`) — `dry`'s regla de los 3 strikes ya
 * satisfecha en el primer commit. Presentacional puro: no posee estado, no
 * sabe nada de perfiles ni de la orquestación de guardado — solo `label`,
 * `value`, `onChange`, `type`, `required`, `disabled`, `autoComplete`.
 *
 * El `<label>` envolviendo el `<input>` es el mecanismo exacto del que
 * depende `getByLabelText` (WCFG-12/CA-05) — `jsx-a11y/label-has-associated-
 * control` (scoped `error` en este directorio) lo hace cumplir en lint.
 */
export function CampoTexto({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  disabled = false,
  autoComplete,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'email' | 'password';
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
      />
    </label>
  );
}
