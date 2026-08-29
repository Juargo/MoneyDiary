import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SIDEBAR_CONTENT_OFFSET_CLASS } from '@/components/app-shell/layout';
import {
  deshacerEliminacionPendiente,
  pausarEliminacionPendiente,
  reanudarEliminacionPendiente,
  useUndoSnapshot,
} from '@/lib/undo-manager';
import { cn } from '@/lib/utils';

/**
 * UndoToast — the one shared surface for every delayed-commit delete
 * (design-hardening change, resolves critique P1). Mounted ONCE at the
 * router root (`routes/__root.tsx`); reads `undo-manager`'s singleton
 * state directly (`useUndoSnapshot`) — no props, no per-page instances.
 *
 * Two visual modes, driven by `UndoSnapshot['kind']`:
 * - `pendiente`: `role="status"` (polite — never steals focus, never
 *   `role="alert"`), the toast message, a real "Deshacer" button (house
 *   default 36px, cobalt), and a thin animated countdown track along the
 *   bottom edge. Hover/focus pause BOTH the CSS animation and the
 *   underlying JS timer (WCAG 2.2.1) via `pausarEliminacionPendiente`/
 *   `reanudarEliminacionPendiente` — the manager, not this component, owns
 *   the actual remaining-time math. Hover and focus-within are tracked as
 *   two INDEPENDENT refs (`hoveredRef`/`focusedRef`, adversarial-review fix)
 *   and resume only fires once BOTH are false — mouse leaving while focus
 *   is still on "Deshacer" (or blur while still hovered) must NOT resume
 *   the countdown out from under whichever interaction is still active.
 * - `error`: `role="alert"`, destructive copy, no button — surfaces a
 *   deferred DELETE failure (the confirmation dialog that used to show this
 *   inline is long closed by the time the grace window expires).
 *
 * Positioning: fixed bottom-center, offset above the mobile bottom tab bar
 * (`bottom-20` below `lg`) and clearing the desktop sidebar so it centers
 * over the content column (`lg:bottom-6` + the SHARED
 * `SIDEBAR_CONTENT_OFFSET_CLASS` from `app-shell/layout.ts` —
 * adversarial-review fix: a hand-copied `lg:pl-64` literal here would
 * silently drift from `AppShell`'s own offset if the sidebar width ever
 * changes; that file's docstring already documents this constant as the
 * single source of truth for the pairing). One step up in elevation
 * (`shadow-md`) is allowed here — DESIGN.md's "One Step Up Rule" reserves
 * that exactly for transient overlays like this one.
 *
 * `prefers-reduced-motion: reduce` swaps the animated bar for static text
 * (craft-floor Motion rule) — detected via `matchMedia`, not a CSS-only
 * gate, because the reduced-motion branch renders different DOM (no bar at
 * all), not merely a paused animation.
 */
export function UndoToast() {
  const snapshot = useUndoSnapshot();
  const reducedMotion = usePrefiereMovimientoReducido();
  // Refs, not state: only ever READ by the other handler, never rendered —
  // a ref updates synchronously (unlike `useState`, which would defer to
  // the next render), so the very next event in a fast hover/focus sequence
  // always sees the other condition's current value.
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);

  function alEntrarMouse() {
    hoveredRef.current = true;
    pausarEliminacionPendiente();
  }
  function alSalirMouse() {
    hoveredRef.current = false;
    if (!focusedRef.current) {
      reanudarEliminacionPendiente();
    }
  }
  function alEnfocar() {
    focusedRef.current = true;
    pausarEliminacionPendiente();
  }
  function alDesenfocar() {
    focusedRef.current = false;
    if (!hoveredRef.current) {
      reanudarEliminacionPendiente();
    }
  }

  if (snapshot === null) {
    return null;
  }

  const esError = snapshot.kind === 'error';

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6',
        SIDEBAR_CONTENT_OFFSET_CLASS,
      )}
    >
      <div
        role={esError ? 'alert' : 'status'}
        aria-live={esError ? undefined : 'polite'}
        onMouseEnter={esError ? undefined : alEntrarMouse}
        onMouseLeave={esError ? undefined : alSalirMouse}
        onFocus={esError ? undefined : alEnfocar}
        onBlur={esError ? undefined : alDesenfocar}
        className={cn(
          'pointer-events-auto relative flex w-full max-w-sm items-center gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 text-foreground shadow-md',
        )}
      >
        <p className={cn('flex-1 text-sm', esError && 'text-destructive')}>
          {snapshot.mensaje}
        </p>
        {!esError && (
          <Button type="button" onClick={deshacerEliminacionPendiente}>
            Deshacer
          </Button>
        )}
        {!esError && !reducedMotion && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[3px] bg-primary/20"
          >
            {/* Literal `7000ms` mirrors `UNDO_GRACE_MS` (`lib/undo-manager.ts`)
                — Tailwind's arbitrary-value class can't interpolate a JS
                constant, so keep these two in sync by hand if the grace
                window ever changes. `key={snapshot.startedKey}` restarts the
                animation from 0 for each new pending record without the two
                sharing a mount lifecycle otherwise (`UndoToast` itself never
                unmounts between pending records). `animationPlayState`
                (inline, not a class) is the actual CSS pause — driven by the
                SAME paused flag the manager tracks for the JS timer, so both
                stop and resume in lockstep. */}
            <div
              key={snapshot.startedKey}
              data-testid="undo-toast-progress"
              style={{
                animationPlayState: snapshot.paused ? 'paused' : 'running',
              }}
              className="h-full bg-primary motion-safe:animate-[undo-countdown_7000ms_linear]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function usePrefiereMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(() => leerPreferenciaActual());

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    function alCambiar(event: MediaQueryListEvent) {
      setReducido(event.matches);
    }
    mql.addEventListener('change', alCambiar);
    return () => mql.removeEventListener('change', alCambiar);
  }, []);

  return reducido;
}

function leerPreferenciaActual(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
