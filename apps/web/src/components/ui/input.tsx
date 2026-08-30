import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Input — the house `<input>` recipe (DESIGN.md "Inputs / Fields"): 6px
 * radius, 1px `input` stroke, 8px/12px padding, 14px text, focus =
 * `border-ring` + 3px `ring/50`, `aria-invalid` switches border/ring to
 * destructive tints.
 *
 * Extracted (polish pass, 2026-08-29): the exact className string used to be
 * hand-duplicated in `CampoTexto` and, separately, in `LoginForm` and
 * `RegistrarMovimientoForm`'s hand-rolled fecha/monto fields (the latter two
 * had already drifted — missing `text-foreground`/`aria-invalid`). This is a
 * bare, unlabeled primitive: callers that need the `<label>` wrapper compose
 * `CampoTexto` instead of reaching for this directly.
 */
export const Input = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<'input'>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'rounded-md border border-input px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
