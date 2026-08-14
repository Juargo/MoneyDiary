import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrearPatron } from '@/api/use-crear-patron';
import { useActualizarPatron } from '@/api/use-actualizar-patron';
import { useEliminarPatron } from '@/api/use-eliminar-patron';
import { MATCH_TYPES } from '@/api/catalogo-constantes';
import type { MatchType } from '@/api/catalogo-constantes';
import type { PatronDto } from '@/api/types';
import { CampoTexto } from '../CampoTexto';
import { CampoSelect } from './CampoSelect';
import { CLASE_BOTON_ICONO } from './estilos';
import {
  ETIQUETA_MATCH_TYPE,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';

const OPCIONES_MATCH_TYPE = MATCH_TYPES.map((matchType) => ({
  value: matchType,
  label: ETIQUETA_MATCH_TYPE[matchType],
}));

/**
 * PatronFila (US-043 PR #4, design.md §1/Q9b, WCTG-04, WCTG-09, WCTG-13) —
 * one pattern row inside `PatronesSection`. Two independently `<label>`-
 * associated controls (`Tipo de coincidencia` `<select>`, `Patrón`
 * `<input>`) that commit IMMEDIATELY, per row — never batched with
 * `Guardar` (WCTG-04's second, independent commit surface). `matchType`
 * commits the moment a new option is picked (a discrete action, no
 * "half-typed" state); `patron`'s free text commits on blur-or-Enter.
 *
 * **No `patron` prop → a not-yet-created row** (design.md §1/Q9a): the
 * mutation success bodies are discarded everywhere in this feature (Q2a),
 * so this component can never learn a freshly `POST`ed pattern's server id
 * from the response — its FIRST commit is a `POST`, and on success it asks
 * the parent to drop this local-only placeholder (`onDescartar`) rather
 * than try to adopt an id it was never given. The persisted row then
 * appears through `PatronesSection`'s normal render of `categoria.patrones`
 * once profile A's invalidation refetches `['categorias']`. Deleting a
 * not-yet-created row is the same `onDescartar` path with **zero** network
 * calls — there is nothing on the server to delete yet.
 *
 * **REGEX pre-validation is a hint, not a gate** (design.md §1/Q9b): the
 * browser's `RegExp` engine is not guaranteed to match the server's, so a
 * client-side *block* would refuse patterns the API would accept (ADR-024).
 * An inline `role="status"` hint renders when `matchType === 'REGEX'` and
 * the current text fails `new RegExp(...)`, but the commit path is
 * untouched — blur/Enter still fires the mutation.
 *
 * **Delete fires with no confirmation dialog** — a pattern touches no
 * persisted transaction (`CAT038-04` does not apply; a confirmation for a
 * reversible one-field edit is friction, not safety). Third and final usage
 * of `CLASE_BOTON_ICONO` (`estilos.ts`'s `dry` 3-strike rule, satisfied on
 * its first write).
 *
 * Errors from any of the three mutations render `mensajeDeErrorCatalogo` in
 * a `role="alert"` — the same closed-table discipline as every other
 * mutation surface in this feature (never a server-supplied string).
 */
export function PatronFila({
  categoriaId,
  patron,
  esDemo,
  bloqueado = false,
  onDescartar,
}: {
  readonly categoriaId: string;
  readonly patron?: PatronDto;
  readonly esDemo: boolean;
  /**
   * External gate (e.g. a `ConfirmarImpactoDialog` open elsewhere on the
   * screen, `EditarCategoria`'s judgment-day fix) — combined with `esDemo`
   * into `bloqueadoTotal` below. Not part of this row's OWN mutation state
   * (see `filaOcupada`), so it needs its own prop rather than folding into
   * `esDemo`, whose name is reserved for the demo-session concept.
   */
  readonly bloqueado?: boolean;
  readonly onDescartar?: () => void;
}) {
  const crear = useCrearPatron();
  const actualizar = useActualizarPatron();
  const eliminar = useEliminarPatron();

  const [valor, setValor] = useState(patron?.patron ?? '');
  const [matchType, setMatchType] = useState<string>(
    patron?.matchType ?? MATCH_TYPES[0],
  );

  const idCreado = patron?.id;

  const bloqueadoTotal = esDemo || bloqueado;

  // Judgment-day finding (PR #4, 2026-08-14): `commit()`/`eliminarFila()`
  // had NO preconditions beyond `esDemo` — each symptom (a re-entrant POST
  // on a not-yet-created row, an empty-value commit, a delete racing an
  // in-flight create) got patched individually across FOUR review rounds of
  // the PREVIOUS PR (#3b); an ad-hoc `disabled` per symptom kept closing one
  // case and opening an adjacent one. `filaOcupada` is the ONE precondition
  // both functions below share: while ANY of this row's three mutations
  // (`crear`/`actualizar`/`eliminar`) is in flight, neither function does
  // anything — this is what stops a second commit fired mid-`POST` (blur
  // then an immediate `matchType` change, or double-Enter) from becoming a
  // second persisted pattern, and what stops `eliminarFila` from taking the
  // "not created yet" branch (zero network calls, `onDescartar` only) while
  // a `POST` for the SAME row is still in flight underneath it.
  const filaOcupada =
    crear.isPending || actualizar.isPending || eliminar.isPending;

  function commit(overrides?: {
    readonly valor?: string;
    readonly matchType?: string;
  }) {
    if (bloqueadoTotal || filaOcupada) {
      return;
    }
    const valorFinal = overrides?.valor ?? valor;
    const matchTypeFinal = overrides?.matchType ?? matchType;

    // A blank (or whitespace-only) value is "not ready to commit yet", not
    // a validation error — no request, no `role="alert"`. Reachable on a
    // brand-new row by picking `matchType` before typing (the natural
    // "pick the type, then write the text" order), and on an existing row
    // by clearing the text and then changing `matchType`.
    if (valorFinal.trim() === '') {
      return;
    }

    if (idCreado === undefined) {
      crear.mutate(
        {
          categoriaId,
          patron: valorFinal,
          matchType: matchTypeFinal as MatchType,
        },
        { onSuccess: () => onDescartar?.() },
      );
      return;
    }
    actualizar.mutate({
      id: idCreado,
      patch: { patron: valorFinal, matchType: matchTypeFinal as MatchType },
    });
  }

  function alCambiarMatchType(nuevoMatchType: string) {
    setMatchType(nuevoMatchType);
    commit({ matchType: nuevoMatchType });
  }

  function alPresionarTecla(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  }

  function eliminarFila() {
    if (bloqueadoTotal || filaOcupada) {
      return;
    }
    if (idCreado === undefined) {
      onDescartar?.();
      return;
    }
    eliminar.mutate(idCreado);
  }

  const regexInvalida = (() => {
    if (matchType !== 'REGEX' || valor === '') {
      return false;
    }
    try {
      new RegExp(valor);
      return false;
    } catch {
      return true;
    }
  })();

  const errorMutacion = crear.isError
    ? crear.error
    : actualizar.isError
      ? actualizar.error
      : eliminar.isError
        ? eliminar.error
        : null;

  return (
    <li className="flex flex-wrap items-start gap-2 border-b border-border py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        <CampoSelect
          label="Tipo de coincidencia"
          value={matchType}
          onChange={alCambiarMatchType}
          options={OPCIONES_MATCH_TYPE}
          disabled={bloqueadoTotal}
        />
        <CampoTexto
          label="Patrón"
          value={valor}
          onChange={setValor}
          disabled={bloqueadoTotal}
          onBlur={() => commit()}
          onKeyDown={alPresionarTecla}
        />
      </div>
      <button
        type="button"
        disabled={bloqueadoTotal || filaOcupada}
        onClick={eliminarFila}
        aria-label={
          valor ? `Eliminar patrón ${valor}` : 'Eliminar patrón nuevo'
        }
        className={cn(
          CLASE_BOTON_ICONO,
          'mt-1 text-destructive disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <Trash2 aria-hidden="true" className="size-[18px]" />
      </button>
      <span aria-live="polite" className="sr-only">
        {actualizar.isSuccess ? 'Patrón guardado.' : ''}
      </span>
      {regexInvalida && (
        <p role="status" className="w-full text-xs text-amber-600">
          Esa expresión regular podría no ser válida.
        </p>
      )}
      {errorMutacion && (
        <p role="alert" className="w-full text-xs text-red-600">
          {mensajeDeErrorCatalogo(errorMutacion)}
        </p>
      )}
    </li>
  );
}
