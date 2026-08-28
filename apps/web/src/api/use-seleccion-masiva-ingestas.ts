import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidarCachesIngesta,
  useEliminarIngestaMasiva,
} from './use-eliminar-ingesta';
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
  readonly eliminando: boolean;
  readonly progreso: number;
  readonly resumenMasivo: ResumenMasivo | null;
  readonly mensajeFallidas: string | null;
  /** `confirmando || eliminando` — the ONE flag the caller disables every
   * checkbox + the trigger button with (4R review fix, R1-CRITICAL
   * stale-dialog / R4-CRITICAL re-entrancy / R4-WARNING mid-run edits). */
  readonly interaccionBloqueada: boolean;
  readonly alternarFila: (id: string) => void;
  readonly alternarTodas: () => void;
  readonly abrirConfirmacion: () => void;
  readonly cancelarConfirmacion: () => void;
  readonly confirmar: () => Promise<void>;
}

function construirMensajeFallidas(
  fallidas: ReadonlyMap<string, string>,
): string | null {
  if (fallidas.size === 0) {
    return null;
  }
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
 * Structural fixes from the 4R review (R1-CRITICAL stale dialog,
 * R4-CRITICAL re-entrancy, R4-WARNING mid-run edits, R4-BLOCKER Escape
 * during a run, R4-WARNING invalidation storm):
 * - `interaccionBloqueada` (`confirmando || eliminando`) is the ONE flag the
 *   caller disables every checkbox + the trigger button with. Once the
 *   dialog is open, `seleccionados` can never again diverge from
 *   `resumenMasivo` (snapshotted at open time in `abrirConfirmacion`), and a
 *   second click on the trigger can't re-open/reset an in-flight run.
 * - `cancelarConfirmacion` no-ops while `eliminando` — `InlineConfirm`'s
 *   documented caller-owns-the-guard contract (same as
 *   `ConfirmarImpactoDialog`): Escape calls `onCancel` unconditionally, so
 *   the guard against cancelling mid-run has to live HERE, not in a
 *   `cancelDisabled` prop (which only disables the button, never Escape).
 * - `confirmar()` runs every delete through `useEliminarIngestaMasiva()` —
 *   the SAME mutationFn as the per-row `useEliminarIngesta()`, but with none
 *   of its per-call cache invalidation — then calls `invalidarCachesIngesta`
 *   exactly ONCE after the loop, instead of letting N sequential deletes
 *   each trigger their own 4-key invalidation (4×N overlapping refetches).
 *   Per-row `EliminarIngestaControl` keeps using `useEliminarIngesta()`
 *   unchanged.
 * - Deletes run strictly SEQUENTIALLY (`for...of` + `await`, never
 *   `Promise.all`): `progreso` only makes sense, and a failed row only stays
 *   isolated from the rest, if each call resolves before the next starts.
 *
 * `onResultado` fires once after the loop completes, for BOTH outcomes —
 * full success (`ok: true`) and partial failure (`ok: false`) — so the
 * caller can push the outcome into its own stable live region even outside
 * the dialog (a partial failure's `InlineConfirm` error slot alone might not
 * reach a screen-reader user who isn't focused inside the non-modal
 * dialog). The dialog stays open on partial failure (so the caller should
 * NOT move focus away from it there); only a full success closes it.
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
  const [eliminando, setEliminando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [fallidas, setFallidas] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
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
  const mensajeFallidas = construirMensajeFallidas(fallidas);
  const interaccionBloqueada = confirmando || eliminando;

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
    eliminarMasivo.reset();
    setFallidas(new Map());
    setProgreso(0);
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
    // R4-BLOCKER: `InlineConfirm` calls `onCancel` unconditionally on
    // Escape — the guard against cancelling mid-run has to live here, not
    // in `cancelDisabled` (which only disables the Cancelar button).
    if (eliminando) {
      return;
    }
    setConfirmando(false);
  }

  async function confirmar() {
    setEliminando(true);
    const ids = Array.from(seleccionados);
    const nombresPorId = new Map(ingestas.map((i) => [i.id, i.nombreArchivo]));
    const nuevasFallidas = new Map<string, string>();
    for (const id of ids) {
      try {
        // Sequential by construction: each iteration awaits before the
        // next starts, never `Promise.all` — `progreso` and per-id failure
        // isolation both depend on this.
        await eliminarMasivo.mutateAsync(id);
      } catch {
        nuevasFallidas.set(id, nombresPorId.get(id) ?? id);
      }
      setProgreso((p) => p + 1);
    }
    // R4-WARNING: ONE invalidation of the 4 keys after the whole batch,
    // instead of each delete triggering its own (the per-row
    // `useEliminarIngesta` keeps doing that; this hook's mutation
    // deliberately carries no `onSuccess` of its own).
    invalidarCachesIngesta(queryClient);
    setEliminando(false);
    setFallidas(nuevasFallidas);
    setSeleccionados(new Set(nuevasFallidas.keys()));
    if (nuevasFallidas.size === 0) {
      setConfirmando(false);
      onResultado({
        ok: true,
        mensaje:
          ids.length === 1 ? 'Cartola eliminada.' : 'Cartolas eliminadas.',
      });
    } else {
      onResultado({
        ok: false,
        mensaje: construirMensajeFallidas(nuevasFallidas) ?? '',
      });
    }
  }

  return {
    idsSeleccionables,
    seleccionados,
    todasSeleccionadas,
    algunaSeleccionada,
    etiquetaSeleccionarTodas,
    etiquetaSeleccionadas,
    confirmando,
    eliminando,
    progreso,
    resumenMasivo,
    mensajeFallidas,
    interaccionBloqueada,
    alternarFila,
    alternarTodas,
    abrirConfirmacion,
    cancelarConfirmacion,
    confirmar,
  };
}
