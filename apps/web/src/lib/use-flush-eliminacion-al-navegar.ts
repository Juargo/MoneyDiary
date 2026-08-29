import { useEffect } from 'react';
import { flushEliminacionPendiente } from './undo-manager';

/**
 * useFlushEliminacionAlNavegar — mounted once at the router root
 * (`routes/__root.tsx`), NOT per-page: gives the undo-manager singleton its
 * "navigating away flushes the pending delete" behavior (design brief)
 * without any of the three delete flows needing to know about routing.
 *
 * `watchKey` is the current location (e.g. `router.state.location.href`).
 * React re-runs an effect's cleanup before applying the next render's
 * effect whenever a dependency changes — so a changed `watchKey` flushes
 * exactly like an unmount would, and a genuine unmount (app teardown) flushes
 * too, via the same cleanup. One hook covers both triggers named in the
 * brief.
 *
 * Deliberately NOT attached to the per-row delete controls themselves
 * (`EliminarMovimientoControl`/`EliminarIngestaControl`): those unmount as
 * a side effect of their OWN row being hidden by `usePendingIds()` right
 * after the user confirms — an unmount effect there would flush the delete
 * the instant it was scheduled, killing the undo window before it starts.
 */
export function useFlushEliminacionAlNavegar(watchKey: string): void {
  useEffect(() => {
    return () => {
      flushEliminacionPendiente();
    };
  }, [watchKey]);
}
