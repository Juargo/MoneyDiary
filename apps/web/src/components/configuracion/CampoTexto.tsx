import { forwardRef } from 'react';
import type {
  ChangeEvent,
  ComponentPropsWithoutRef,
  FocusEvent,
  KeyboardEvent,
  Ref,
} from 'react';
import { Input } from '@/components/ui/input';

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
 *
 * `type="date"` + `max`/`inputMode`/`pattern` (US-060, polish pass
 * 2026-08-29): el `<input>` interno ahora es el primitivo compartido
 * `ui/input.tsx` en lugar de un `<input>` a mano, así que hostear `date`
 * (con `max`) y `inputMode`/`pattern` (para el patrón `type="text"
 * inputMode="numeric"` de un campo Monto) ya no requiere reimplementar el
 * wrapper — la nota histórica "CampoTexto no puede hostear date" queda
 * obsoleta. `RegistrarMovimientoForm` deja de duplicar el par
 * `<label><input>` para fecha/monto y usa este componente para fecha,
 * descripción y monto ("Tipo" sigue en `CampoSelect`).
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
    max,
    inputMode,
    pattern,
  }: {
    readonly label: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly type?: 'text' | 'email' | 'password' | 'date';
    readonly required?: boolean;
    readonly disabled?: boolean;
    readonly autoComplete?: string;
    readonly onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
    readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
    readonly ariaDescribedBy?: string;
    readonly max?: string;
    readonly inputMode?: ComponentPropsWithoutRef<'input'>['inputMode'];
    readonly pattern?: string;
  },
  ref: Ref<HTMLInputElement>,
) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
      {label}
      <Input
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
        max={max}
        inputMode={inputMode}
        pattern={pattern}
      />
    </label>
  );
});
