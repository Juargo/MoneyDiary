import { forwardRef } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent, Ref } from 'react';

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
 *
 * `forwardRef` (PR #2, task 5.3): `ConfirmarPasswordDialog` reutiliza este
 * componente para su propio campo `Password actual` — mismo `dry` que evitó
 * un segundo `<label>`-wrapped-`<input>` en este directorio — y necesita un
 * ref al `<input>` para el mecanismo de foco-al-abrir (design.md §1/Q7c).
 * Los cuatro usos existentes en `PerfilForm` no pasan `ref` — opcional, no
 * rompe nada.
 *
 * `onBlur`/`onKeyDown` (US-043 PR #4, design.md §1/Q9b): opcionales,
 * pass-through al `<input>` nativo. `PatronFila`'s los usa para su
 * mecanismo "commits on blur-or-Enter" — los cuatro usos existentes de
 * `PerfilForm`/`NuevaCategoriaForm`/`EditarCategoria` no los pasan, así que
 * esta extensión es puramente aditiva.
 *
 * `ariaDescribedBy` (US-043 PR #4, judgment-day round 2 SUGGESTION):
 * opcional, pass-through a `aria-describedby`. `PatronFila` lo usa para
 * asociar su hint de REGEX (`role="status"`) y su error (`role="alert"`)
 * con el `<input>` `Patrón` — mismo criterio aditivo que `onBlur`/
 * `onKeyDown`, los demás usos no lo pasan.
 */
export const CampoTexto = forwardRef(function CampoTexto(
  {
    label,
    value,
    onChange,
    type = 'text',
    required = false,
    disabled = false,
    autoComplete,
    onBlur,
    onKeyDown,
    ariaDescribedBy,
  }: {
    readonly label: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly type?: 'text' | 'email' | 'password';
    readonly required?: boolean;
    readonly disabled?: boolean;
    readonly autoComplete?: string;
    readonly onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
    readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
    readonly ariaDescribedBy?: string;
  },
  ref: Ref<HTMLInputElement>,
) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
      {label}
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-describedby={ariaDescribedBy}
        className="rounded-md border border-input px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:opacity-50"
      />
    </label>
  );
});
