/**
 * Purpose-built one-tick guard for the SINGLE synthetic self-navigation that
 * `/configuracion`'s `?google=` cleanup effect performs
 * (`routes/_authenticated/configuracion.tsx`, US-042 WCFG-10): rewriting the
 * URL back to `/configuracion` (`router.history.replace('/configuracion')`)
 * still re-runs `_authenticated`'s `beforeLoad` — TanStack Router's
 * `Transitioner` re-runs `beforeLoad` on any REPLACE/PUSH history event, with
 * no public API that changes the URL without doing so — but that re-run is
 * for the exact landing whose identity `beforeLoad` already fetched a moment
 * ago; a second `/api/auth/me` round trip there is pure waste (WCFG-03's
 * exactly-once MUST).
 *
 * Deliberately NOT a general cache. A prior fix routed `beforeLoad` through
 * `queryClient.ensureQueryData` — reverted, because it silently stopped
 * re-validating identity on every OTHER navigation too (a stale-but-present
 * `['auth-me']` entry is never revalidated without `revalidateIfStale`, so
 * the session guard stopped catching server-side revocation for the rest of
 * the SPA session). This flag is armed by exactly one call site right before
 * the ONE rewrite that needs it, and is consumed (read + cleared) by exactly
 * one other call site on the very next `beforeLoad` run. A real, distinct
 * navigation between two authenticated pages never arms it, so `beforeLoad`
 * keeps issuing a fresh `/api/auth/me` for those — see
 * `test/configuracion-google-aviso.test.tsx` (task-6.2 exactly-once pin +
 * the genuine-navigation-still-refetches pin).
 */
let armed = false;

export function markSkipNextAuthRefetch(): void {
  armed = true;
}

export function consumeSkipNextAuthRefetch(): boolean {
  const wasArmed = armed;
  armed = false;
  return wasArmed;
}

/**
 * Solo para tests. `armed` es estado mutable a nivel de módulo, e `isolate`
 * de vitest aísla ENTRE archivos, no entre los `it()` de un mismo archivo. En
 * producción armar y consumir ocurren en el mismo turno sincrónico de JS (ver
 * el comentario de arriba), así que el flag nunca sobrevive a su navegación;
 * pero un test que falle o expire ENTRE `markSkipNextAuthRefetch()` y el
 * `beforeLoad` que lo consume dejaría `armed = true` filtrándose al siguiente
 * test del archivo, que saltearía su fetch real y leería caché ausente — un
 * falso verde, o una falla en un test que no tiene nada que ver.
 *
 * Llamar desde un `afterEach` incondicional, no desde el cuerpo del test: el
 * punto es limpiar TAMBIÉN cuando el test falló a mitad de camino.
 */
export function resetSkipNextAuthRefetch(): void {
  armed = false;
}
