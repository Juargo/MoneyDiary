/**
 * Minimal pub/sub so `app/subir.tsx` can ask `app/index.tsx` to re-fetch the
 * resumen after a successful upload (CU-10, US-033) without introducing
 * TanStack Query on mobile (design.md Decision 5) or prop-drilling a
 * callback through `expo-router`'s Stack — routes are mounted by the
 * router and never receive props from a parent route.
 *
 * `app/index.tsx` registers its own `cargar()` as the listener on mount;
 * `app/subir.tsx` calls `solicitarRecargaResumen()` right after a successful
 * `postIngesta`. KISS: a single in-memory listener slot, not a full
 * event-emitter or React context — this app has exactly one screen that
 * ever needs to be notified.
 */
let listener: (() => void) | null = null;

export function registrarRecargaResumen(cargar: () => void): () => void {
  listener = cargar;
  return () => desregistrarRecargaResumen(cargar);
}

/**
 * Clears the listener slot — but ONLY if it still holds `cargar` (review
 * fix #2). Guards against a stale unmount cleanup clobbering a newer
 * registration: if `index.tsx` unmounts/remounts and re-registers before an
 * older cleanup runs, the older cleanup must not unregister the new one.
 */
export function desregistrarRecargaResumen(cargar: () => void): void {
  if (listener === cargar) {
    listener = null;
  }
}

export function solicitarRecargaResumen(): void {
  listener?.();
}
