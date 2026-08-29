import { useSyncExternalStore } from 'react';

/**
 * undo-manager.ts — the single delayed-commit manager behind every
 * destructive delete in the web app (design-hardening change, resolves
 * critique P1 "No undo/grace period on any destructive action").
 *
 * A plain module singleton (YAGNI: no Context/Provider needed — there is
 * genuinely only ONE pending destructive action at a time, app-wide, by
 * product decision below), consumed by three call sites
 * (`EliminarMovimientoControl`, `EliminarIngestaControl`,
 * `useSeleccionMasivaIngestas`) that never need to know about each other.
 *
 * ## The model
 *
 * `programarEliminacion` schedules ONE delayed commit: the caller has
 * ALREADY hidden the affected row(s) from its own render (via
 * `usePendingIds()`, filtering the caller's list by the ids this module
 * reports as pending) before or as part of calling this. This module owns
 * only the TIMER and the notification of what's pending — never the
 * mutation itself, never a client-side cache mutation. That is why "undo"
 * needs no restore logic: nothing was ever removed from the query cache,
 * only hidden by id. Clearing `pending` is the restore.
 *
 * Only one pending action at a time (product decision, design brief):
 * starting a second one flushes (commits) the first immediately — see
 * `programarEliminacion`.
 *
 * ## Commit vs. restore
 *
 * The grace timer expiring (or `flushEliminacionPendiente()` firing it
 * early — route change, unmount, a conflicting new delete) clears `pending`
 * and invokes `onCommit`, which the CALLER supplies: it fires the real
 * mutation (`useEliminarMovimiento`/`useEliminarIngesta`/
 * `useEliminarIngestaMasiva`) and, on failure, calls
 * `reportarErrorEliminacion` with user-facing copy.
 *
 * ## The committing window (adversarial-review fix)
 *
 * An earlier version cleared `pending` — and therefore what
 * `getPendingIds()`/`usePendingIds()` report — the INSTANT the grace window
 * expired, before `onCommit`'s mutation ever settled. For the bulk flow
 * (`useSeleccionMasivaIngestas`, a sequential loop over N ids) that left
 * every row visible again for the ENTIRE loop: a user could re-select and
 * re-delete an already-deleted row mid-loop, hitting the DELETE endpoint's
 * 404 anti-enumeration and surfacing a false "no se pudo eliminar" for a
 * delete that had actually already succeeded.
 *
 * Fixed by tracking a SEPARATE `committingCounts` set: `commit()` moves the
 * record's ids into it BEFORE calling `onCommit`, and only removes them
 * once the returned promise settles (`Promise.resolve(onCommit()).finally`
 * — `onCommit` may return `void` for a caller with no async work of its
 * own to await, in which case the committing window is exactly one
 * microtask). `getPendingIds()` reports the UNION of the grace-timer
 * `pending.ids` and `committingCounts.keys()` — so the three list consumers
 * (`IngresosMesTable`/`GrupoMovimientos`/`ListaIngestas`), which already
 * filter on `usePendingIds()`, need no changes at all to pick this up.
 * `committingCounts` is reference-counted (a `Map<string, number>`, not a
 * `Set`) because two overlapping committing batches CAN exist at once: a
 * bulk delete's committing window can still be running when an unrelated
 * single delete's OWN grace window separately expires.
 *
 * ## pagehide
 *
 * A hard navigation/tab-close fires `pagehide` before any React effect can
 * reliably run to completion. The pending record's `onPageHide` is a
 * fire-and-forget callback the caller supplies that issues the SAME DELETE
 * request(s) with `{ keepalive: true }` (`deleteMovimiento`/`deleteIngesta`)
 * instead of the normal mutation — no query invalidation, no error
 * surfacing (there is no one left to see it). This is the one path that
 * does NOT go through `onCommit`.
 */
export const UNDO_GRACE_MS = 7000;

const ERROR_DISPLAY_MS = 6000;

export interface ProgramarEliminacionParams {
  /** Ids of the row(s) being deleted — what `usePendingIds()` reports while
   * this record is pending. */
  readonly ids: readonly string[];
  /** Toast message, e.g. "Movimiento eliminado." / "3 cartolas eliminadas." */
  readonly mensaje: string;
  /** @default UNDO_GRACE_MS */
  readonly graceMs?: number;
  /** Fires the real mutation. May return `void` (fire-and-forget) or a
   * `Promise` — when it returns a promise, this module keeps `ids` in the
   * "committing" set (still reported by `getPendingIds()`) until that
   * promise settles, so the row(s) stay hidden for the FULL duration of the
   * real DELETE, not just the grace window (see "The committing window"
   * above). The caller handles its own success/error internally (calling
   * `reportarErrorEliminacion` on failure) — this module never inspects
   * whether the promise resolved or rejected, only whether it settled. */
  readonly onCommit: () => void | Promise<void>;
  /** Fire-and-forget keepalive DELETE(s), used only on `pagehide`. */
  readonly onPageHide: () => void;
}

export type UndoSnapshot =
  | {
      readonly kind: 'pendiente';
      readonly mensaje: string;
      readonly graceMs: number;
      readonly paused: boolean;
      /** Unique per scheduled record (NOT per pause/resume) — `UndoToast`
       * keys its countdown-bar element with this so the CSS animation
       * restarts from 0 for each new delete, even though `UndoToast` itself
       * stays mounted across the whole app lifetime and never remounts on
       * its own. */
      readonly startedKey: string;
    }
  | {
      readonly kind: 'error';
      readonly mensaje: string;
    }
  | null;

interface PendingRecord {
  readonly id: string;
  readonly ids: readonly string[];
  readonly mensaje: string;
  readonly graceMs: number;
  remainingMs: number;
  timerId: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  paused: boolean;
  readonly onCommit: () => void;
  readonly onPageHide: () => void;
}

let pending: PendingRecord | null = null;
let nextRecordId = 0;
let errorState: { mensaje: string } | null = null;
let errorTimerId: ReturnType<typeof setTimeout> | null = null;
// Reference-counted (not a plain `Set`): two overlapping committing batches
// with an id in common is a real, if rare, possibility — a ref count means
// each batch's own completion only removes ITS claim on that id.
const committingCounts = new Map<string, number>();

function addCommitting(ids: readonly string[]): void {
  for (const id of ids) {
    committingCounts.set(id, (committingCounts.get(id) ?? 0) + 1);
  }
}

function removeCommitting(ids: readonly string[]): void {
  for (const id of ids) {
    const count = committingCounts.get(id) ?? 0;
    if (count <= 1) {
      committingCounts.delete(id);
    } else {
      committingCounts.set(id, count - 1);
    }
  }
}

// `useSyncExternalStore` requires `getSnapshot()` to return a STABLE
// reference between calls unless the underlying state actually changed —
// otherwise React treats every re-invocation (it calls `getSnapshot` again
// after each render to check for tearing) as a genuine update and
// re-renders forever ("Maximum update depth exceeded"). `getPendingIds`/
// `getUndoSnapshot` below return these cached values instead of computing a
// fresh object each call; `syncSnapshots` recomputes them exactly once per
// real transition, right before `notify()` fires.
let idsSnapshot: ReadonlySet<string> = new Set();
let undoSnapshotCache: UndoSnapshot = null;

const listeners = new Set<() => void>();

function computeIdsSnapshot(): ReadonlySet<string> {
  const ids = new Set<string>(committingCounts.keys());
  if (pending != null) {
    for (const id of pending.ids) {
      ids.add(id);
    }
  }
  return ids;
}

function computeUndoSnapshot(): UndoSnapshot {
  if (errorState != null) {
    return { kind: 'error', mensaje: errorState.mensaje };
  }
  if (pending == null) {
    return null;
  }
  return {
    kind: 'pendiente',
    mensaje: pending.mensaje,
    graceMs: pending.graceMs,
    paused: pending.paused,
    startedKey: pending.id,
  };
}

function notify(): void {
  idsSnapshot = computeIdsSnapshot();
  undoSnapshotCache = computeUndoSnapshot();
  listeners.forEach((listener) => listener());
}

export function subscribeUndo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clearTimer(record: PendingRecord): void {
  if (record.timerId != null) {
    clearTimeout(record.timerId);
    record.timerId = null;
  }
}

function armTimer(record: PendingRecord): void {
  record.startedAt = Date.now();
  record.timerId = setTimeout(() => {
    commit();
  }, record.remainingMs);
}

function clearError(): void {
  if (errorTimerId != null) {
    clearTimeout(errorTimerId);
    errorTimerId = null;
  }
  errorState = null;
}

/** Displays a transient `role="alert"` banner in `UndoToast` — the surface
 * a deferred DELETE failure uses to restore-and-explain, since by the time
 * the grace window expires the confirmation dialog that used to show this
 * inline is long closed. Auto-dismisses so a forgotten error doesn't linger
 * forever. */
export function reportarErrorEliminacion(mensaje: string): void {
  clearError();
  errorState = { mensaje };
  errorTimerId = setTimeout(() => {
    errorState = null;
    errorTimerId = null;
    notify();
  }, ERROR_DISPLAY_MS);
  notify();
}

function commit(): void {
  const record = pending;
  if (record == null) {
    return;
  }
  clearTimer(record);
  pending = null;
  clearError();
  // Move into "committing" BEFORE calling `onCommit` — `getPendingIds()`
  // must report these ids without a gap between the grace timer clearing
  // and the committing window starting (adversarial-review fix).
  addCommitting(record.ids);
  notify();
  // `.catch(() => {})` at the tail (not on the original `onCommit()` call):
  // `.finally()` still runs its callback either way, but re-throws/rejects
  // on the settled chain if `onCommit` rejected — this module documents
  // that it never inspects success/failure, so it must not surface an
  // "unhandled rejection" for a caller whose own internal try/catch (every
  // real caller has one) happened to miss a case.
  Promise.resolve(record.onCommit())
    .finally(() => {
      removeCommitting(record.ids);
      notify();
    })
    .catch(() => {});
}

/** Fires the pending commit early — route change, component unmount, or a
 * conflicting new delete. No-op when nothing is pending. */
export function flushEliminacionPendiente(): void {
  if (pending != null) {
    commit();
  }
}

/** Cancels the pending delete. Nothing was ever removed from any cache —
 * clearing `pending` IS the restore (see module docstring). */
export function deshacerEliminacionPendiente(): void {
  const record = pending;
  if (record == null) {
    return;
  }
  clearTimer(record);
  pending = null;
  notify();
}

/** Pauses the grace countdown — WCAG 2.2.1: hover/focus inside `UndoToast`
 * pauses the real timer, not just its CSS animation. */
export function pausarEliminacionPendiente(): void {
  const record = pending;
  if (record == null || record.paused) {
    return;
  }
  const elapsed = Date.now() - record.startedAt;
  record.remainingMs = Math.max(0, record.remainingMs - elapsed);
  clearTimer(record);
  record.paused = true;
  notify();
}

export function reanudarEliminacionPendiente(): void {
  const record = pending;
  if (record == null || !record.paused) {
    return;
  }
  record.paused = false;
  armTimer(record);
  notify();
}

/**
 * Schedules a delayed commit. If one is already pending, it is flushed
 * (committed) immediately first — "only one pending undo at a time"
 * (design brief): confirming a new delete while another is pending commits
 * the previous one rather than silently dropping it.
 */
export function programarEliminacion(params: ProgramarEliminacionParams): void {
  if (pending != null) {
    commit();
  }
  clearError();
  const graceMs = params.graceMs ?? UNDO_GRACE_MS;
  nextRecordId += 1;
  const record: PendingRecord = {
    id: String(nextRecordId),
    ids: params.ids,
    mensaje: params.mensaje,
    graceMs,
    remainingMs: graceMs,
    timerId: null,
    startedAt: 0,
    paused: false,
    onCommit: params.onCommit,
    onPageHide: params.onPageHide,
  };
  pending = record;
  armTimer(record);
  notify();
}

export function getPendingIds(): ReadonlySet<string> {
  return idsSnapshot;
}

export function getUndoSnapshot(): UndoSnapshot {
  return undoSnapshotCache;
}

/** Test-only reset: clears the pending record, the committing set, and the
 * error banner without running any callback (unlike
 * `deshacerEliminacionPendiente`, which only clears `pending`). Exists so
 * test files can guarantee a clean module-singleton slate in `afterEach`
 * regardless of which state a given test left behind. */
export function resetUndoManagerParaTests(): void {
  if (pending != null) {
    clearTimer(pending);
    pending = null;
  }
  committingCounts.clear();
  clearError();
  notify();
}

function handlePageHide(): void {
  const record = pending;
  if (record == null) {
    return;
  }
  clearTimer(record);
  pending = null;
  notify();
  record.onPageHide();
}

// Module-load-time registration (once per module instance — `main.tsx`
// imports this exactly once in production; each test file gets a fresh
// module instance under Vitest's isolation). Guarded for non-browser
// environments (SSR has none here, but this keeps the module import
// side-effect-safe regardless).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', handlePageHide);
}

// ---------------------------------------------------------------------------
// React hooks — thin `useSyncExternalStore` wrappers. Kept in this file
// (not split out) because they are trivial and tightly coupled to the
// module's own subscribe/snapshot pair (KISS: no separate hooks file for
// two one-liners).
// ---------------------------------------------------------------------------

export function usePendingIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeUndo, getPendingIds, getPendingIds);
}

export function useUndoSnapshot(): UndoSnapshot {
  return useSyncExternalStore(subscribeUndo, getUndoSnapshot, getUndoSnapshot);
}
