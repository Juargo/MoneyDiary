import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * `SUPERFICIE_SECCION` — the container surface every other screen in this app
 * already uses (`ListaIngestas.tsx:293`, `SubirCartola.tsx:885`,
 * `GrupoMovimientos.tsx:99`, `SemaforoHeroCard.tsx:47`, `ui/inline-confirm.tsx:240`).
 * Lifted to a constant here rather than re-typed per section: `dry`'s three
 * strikes were met on the first commit (Perfil alone has three sections), and
 * a single literal is what lets the whole screen move together later.
 *
 * NOT shadcn's stock `ui/card.tsx`: that ships `rounded-xl shadow-sm`, and
 * `rounded-xl` is `calc(var(--radius) + 4px)` — a 4px corner on a design
 * system whose `--radius` is deliberately `0rem` (`index.css:150`). The
 * project already corrected `ui/badge.tsx` to `rounded-none` for the same
 * reason. `rounded-lg` resolves to `var(--radius)` itself, so this surface
 * follows the token instead of opting out of it.
 */
export const SUPERFICIE_SECCION =
  'rounded-lg border border-border bg-card p-4 sm:p-6';

/**
 * SeccionConfig — a titled surface for one Configuración concern.
 *
 * **Why this exists (heading parity).** `PerfilPanel` used to render three
 * sibling `h2`s at two different visual weights: `Editar perfil` at
 * `text-xl`, `Cuenta de Google` and `Sesión` at `text-sm`. The screen-reader
 * outline said "three peers", the visual outline said "one title and two
 * sub-labels", and only one of those readings could be right. Routing every
 * section through this component makes the two outlines agree by
 * construction — a section cannot pick its own heading size.
 *
 * `<section>` with no accessible name is NOT exposed as a `region` landmark,
 * so four of these do not add four landmarks to the page. That is deliberate:
 * `ConfiguracionTabs`'s `<nav>` is the only landmark this screen needs beyond
 * the app shell's.
 *
 * Presentational only — no state, no data, no knowledge of what it wraps.
 */
export function SeccionConfig({
  titulo,
  descripcion,
  children,
  className,
}: {
  readonly titulo: string;
  readonly descripcion?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={cn('flex flex-col gap-4', SUPERFICIE_SECCION, className)}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
        {descripcion !== undefined && (
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        )}
      </div>
      {children}
    </section>
  );
}
