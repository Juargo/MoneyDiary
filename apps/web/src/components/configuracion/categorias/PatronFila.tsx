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
  onDescartar,
}: {
  readonly categoriaId: string;
  readonly patron?: PatronDto;
  readonly esDemo: boolean;
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

  function commit(overrides?: {
    readonly valor?: string;
    readonly matchType?: string;
  }) {
    if (esDemo) {
      return;
    }
    const valorFinal = overrides?.valor ?? valor;
    const matchTypeFinal = overrides?.matchType ?? matchType;

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
          disabled={esDemo}
        />
        <CampoTexto
          label="Patrón"
          value={valor}
          onChange={setValor}
          disabled={esDemo}
          onBlur={() => commit()}
          onKeyDown={alPresionarTecla}
        />
      </div>
      <button
        type="button"
        disabled={esDemo || eliminar.isPending}
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
