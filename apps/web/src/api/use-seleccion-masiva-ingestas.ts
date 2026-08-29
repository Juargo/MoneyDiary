import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteIngesta } from './client';
import {
  invalidarCachesIngesta,
  useEliminarIngestaMasiva,
} from './use-eliminar-ingesta';
import {
  programarEliminacion,
  reportarErrorEliminacion,
} from '@/lib/undo-manager';
import { pluralizar } from '@/lib/pluralizar';
import type { IngestaListItemDto } from './types';

export interface ResultadoEliminacionMasiva {
  readonly ok: boolean;
  readonly mensaje: string;
}

interface ResumenMasivo {
  readonly cantidad: number;
  readonly movimientos: number;
}

export interface UseSeleccionMasivaIngestasResult {
  readonly idsSeleccionables: readonly string[];
  readonly seleccionados: ReadonlySet<string>;
  readonly todasSeleccionadas: boolean;
  readonly algunaSeleccionada: boolean;
  readonly etiquetaSeleccionarTodas: string;
  readonly etiquetaSeleccionadas: string;
  readonly confirmando: boolean;
  readonly resumenMasivo: ResumenMasivo | null;
  /** `confirmando` — the ONE flag the caller disables every checkbox + the
   * trigger button with while the confirmation dialog itself is open.
   * Unlike the pre-undo-window version, there is no longer a separate
   * "running" phase to guard against re-entrancy for: Confirmar now closes
   * the dialog immediately (schedule, not run) — see `confirmar` below. */
  readonly interaccionBloqueada: boolean;
  readonly alternarFila: (id: string) => void;
  readonly alternarTodas: () => void;
  readonly abrirConfirmacion: () => void;
  readonly cancelarConfirmacion: () => void;
  readonly confirmar: () => void;
}

function mensajeToastMasivo(cantidad: number): string {
  return cantidad === 1
    ? 'Cartola eliminada.'
    : `${pluralizar(cantidad, 'cartola', 'cartolas')} eliminadas.`;
}

function construirMensajeFallidas(
  fallidas: ReadonlyMap<string, string>,
): string {
  const verbo = fallidas.size === 1 ? 'pudo' : 'pudieron';
  return `No se ${verbo} eliminar ${pluralizar(fallidas.size, 'cartola', 'cartolas')}: ${Array.from(
    fallidas.values(),
  ).join(', ')}.`;
}

/**
 * useSeleccionMasivaIngestas — bulk-delete state machine for `ListaIngestas`
 * (readability round, R2 nit: extracted from ~125 inline lines so the
 * component composes instead of implementing the machine itself).
 *
 * Rewired for the design-hardening change (undo grace window, resolves
 * critique P1 "No undo/grace period on any destructive action"):
 * `confirmar` no longer runs the sequential DELETE loop itself. It closes
 * the dialog and hands off to `programarEliminacion` (`lib/undo-manager.ts`,
 * the ONE delayed-commit manager shared with `EliminarMovimientoControl`/
 * `EliminarIngestaControl`) with ALL selected ids in a single record —
 * `ListaIngestas` hides every selected row for the grace window by
 * filtering on `usePendingIds()`, `UndoToast` (mounted once at the router
 * root) shows "Deshacer" for the whole batch, and the real sequential
 * delete loop only runs once the window expires (`onCommit`) — or never, if
 * the user undoes.
 *
 * The structural fixes from the 4R review that predate this change still
 * hold, now inside `onCommit`'s deferred run instead of `confirmar` itself:
 * - Deletes still run strictly SEQUENTIALLY (`for...of` + `await`, never
 *   `Promise.all`) — a failed row stays isolated from the rest.
 * - `useEliminarIngestaMasiva()` (no per-call cache invalidation) +
 *   `invalidarCachesIngesta` exactly ONCE after the whole batch, instead of
 *   N sequential deletes each triggering their own 4-key invalidation.
 *
 * `onCommit` returns (does not discard) `ejecutarEliminacion`'s promise
 * (adversarial-review fix): the manager keeps every selected id hidden —
 * via its "committing" set, unioned into `usePendingIds()` — for the WHOLE
 * sequential loop, not just until the grace window expires. Discarding that
 * promise used to reappear every selected row for the entire (possibly
 * long) loop, letting a user re-select and re-delete an already-deleted row
 * and get a false "no se pudo eliminar" for a delete that had actually
 * succeeded.
 *
 * What changed: there is no more visible "Eliminando… (n/N)" progress label
 * or "dialog stays open on partial failure" — both were affordances for a
 * run happening WHILE the dialog was still open. Now the dialog is long
 * closed by the time the run happens (deferred past the grace window), so a
 * deferred partial failure reports through `reportarErrorEliminacion`
 * (`UndoToast`'s `role="alert"` slot) instead. `onResultado` still fires
 * exactly once — now when the DEFERRED run settles (success or partial
 * failure), preserving the page-level stable `role="status"` announcement
 * `ListaIngestas` already owned, just delayed by the grace window instead of
 * synchronous with the click.
 *
 * `onPageHide` fires the SAME per-id DELETE with `{ keepalive: true }` for
 * every selected id — the `pagehide` escape hatch `undo-manager.ts` needs
 * for a hard navigation/tab-close.
 */
export function useSeleccionMasivaIngestas(
  ingestas: readonly IngestaListItemDto[],
  onResultado: (resultado: ResultadoEliminacionMasiva) => void,
): UseSeleccionMasivaIngestasResult {
  const queryClient = useQueryClient();
  const eliminarMasivo = useEliminarIngestaMasiva();
  const [seleccionados, setSeleccionados] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [confirmando, setConfirmando] = useState(false);
  const [resumenMasivo, setResumenMasivo] = useState<ResumenMasivo | null>(
    null,
  );

  const idsSeleccionables = ingestas
    .filter((i) => i.estado === 'PROCESADA')
    .map((i) => i.id);
  const todasSeleccionadas =
    idsSeleccionables.length > 0 &&
    idsSeleccionables.every((id) => seleccionados.has(id));
  const algunaSeleccionada = idsSeleccionables.some((id) =>
    seleccionados.has(id),
  );
  const etiquetaSeleccionarTodas =
    idsSeleccionables.length === 1
      ? `Seleccionar la cartola (${idsSeleccionables.length})`
      : `Seleccionar todas las cartolas (${idsSeleccionables.length})`;
  const etiquetaSeleccionadas = pluralizar(
    seleccionados.size,
    'seleccionada',
    'seleccionadas',
  );
  const interaccionBloqueada = confirmando;

  function alternarTodas() {
    setSeleccionados(
      todasSeleccionadas ? new Set() : new Set(idsSeleccionables),
    );
  }

  function alternarFila(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function abrirConfirmacion() {
    const filasSeleccionadas = ingestas.filter((i) => seleccionados.has(i.id));
    setResumenMasivo({
      cantidad: filasSeleccionadas.length,
      movimientos: filasSeleccionadas.reduce(
        (acc, i) => acc + i.totalTransacciones,
        0,
      ),
    });
    setConfirmando(true);
  }

  function cancelarConfirmacion() {
    setConfirmando(false);
  }

  async function ejecutarEliminacion(ids: readonly string[]) {
    const nombresPorId = new Map(ingestas.map((i) => [i.id, i.nombreArchivo]));
    const fallidas = new Map<string, string>();
    for (const id of ids) {
      try {
        // Sequential by construction: each iteration awaits before the
        // next starts, never `Promise.all` — per-id failure isolation
        // depends on this.
        await eliminarMasivo.mutateAsync(id);
      } catch {
        fallidas.set(id, nombresPorId.get(id) ?? id);
      }
    }
    // ONE invalidation of the 4 keys after the whole batch, instead of
    // each delete triggering its own (the per-row `useEliminarIngesta`
    // keeps doing that; this hook's mutation deliberately carries no
    // `onSuccess` of its own).
    invalidarCachesIngesta(queryClient);
    if (fallidas.size > 0) {
      reportarErrorEliminacion(construirMensajeFallidas(fallidas));
      onResultado({ ok: false, mensaje: construirMensajeFallidas(fallidas) });
    } else {
      onResultado({
        ok: true,
        mensaje:
          ids.length === 1 ? 'Cartola eliminada.' : 'Cartolas eliminadas.',
      });
    }
  }

  function confirmar() {
    const ids = Array.from(seleccionados);
    setConfirmando(false);
    setSeleccionados(new Set());
    programarEliminacion({
      ids,
      mensaje: mensajeToastMasivo(ids.length),
      // Returns (not discards) `ejecutarEliminacion`'s promise
      // (adversarial-review fix): `undo-manager.ts` keeps every id in
      // `ids` in its "committing" set — still reported by
      // `usePendingIds()`, so every row stays hidden — until the WHOLE
      // sequential loop settles, not just until the grace window expires.
      // The pre-fix `void ejecutarEliminacion(ids)` let the manager treat
      // the commit as instantly done, reappearing every row for the
      // entire (possibly long) loop — a user could then re-select and
      // re-delete an already-deleted row, producing a false "no se pudo
      // eliminar" for a delete that had actually succeeded.
      onCommit: () => ejecutarEliminacion(ids),
      onPageHide: () => {
        ids.forEach((id) => {
          void deleteIngesta(id, { keepalive: true });
        });
      },
    });
  }

  return {
    idsSeleccionables,
    seleccionados,
    todasSeleccionadas,
    algunaSeleccionada,
    etiquetaSeleccionarTodas,
    etiquetaSeleccionadas,
    confirmando,
    resumenMasivo,
    interaccionBloqueada,
    alternarFila,
    alternarTodas,
    abrirConfirmacion,
    cancelarConfirmacion,
    confirmar,
  };
}
