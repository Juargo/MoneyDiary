/**
 * Minimal pub/sub so `app/subir.tsx` can ask every subscriber to re-fetch
 * its resumen after a successful upload (CU-10, US-033) without introducing
 * TanStack Query on mobile (design.md Decision 5) or prop-drilling a
 * callback through `expo-router`'s Stack — routes are mounted by the
 * router and never receive props from a parent route.
 *
 * `app/index.tsx` registers its own `cargar()` on mount; `app/subir.tsx`
 * calls `solicitarRecargaResumen()` right after a successful `postIngesta`.
 *
 * US-050 (D-13): promoted from a single-listener slot to a `Set<() => void>`
 * — `ResumenAnual` is a second subscriber this module's original docstring
 * said would never exist. Without this, a US-033 upload would refresh the
 * main chart while the annual grid kept showing the just-fed month as an
 * empty, non-tappable cell. `registrarRecargaResumen`'s caller-facing API is
 * unchanged: each caller still gets back an unregister function that
 * removes only its own callback, which structurally preserves review fix
 * #2's guarantee (a stale cleanup can no longer clobber a newer
 * registration) — `Set.delete` is a no-op if the callback was already
 * removed or was never the one currently registered under that identity.
 */
const listeners = new Set<() => void>();

export function registrarRecargaResumen(cargar: () => void): () => void {
  listeners.add(cargar);
  return () => desregistrarRecargaResumen(cargar);
}

export function desregistrarRecargaResumen(cargar: () => void): void {
  listeners.delete(cargar);
}

export function solicitarRecargaResumen(): void {
  listeners.forEach((cargar) => cargar());
}
