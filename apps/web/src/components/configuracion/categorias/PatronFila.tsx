import { useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
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
 *
 * **`onAnunciar` (judgment-day round 2 WARNING)**: optional callback fired
 * with a Spanish sentence on every successful mutation (`crear`/
 * `actualizar`/`eliminar`). This component does NOT render its own
 * `aria-live` region any more — see `PatronesSection`'s docblock for why
 * (the region has to survive this row's own unmount, which a per-row span
 * cannot).
 */
export function PatronFila({
  categoriaId,
  patron,
  esDemo,
  bloqueado = false,
  onDescartar,
  onAnunciar,
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
  /** See this component's docblock, "`onAnunciar`". */
  readonly onAnunciar?: (mensaje: string) => void;
}) {
  const crear = useCrearPatron();
  const actualizar = useActualizarPatron();
  const eliminar = useEliminarPatron();

  const [valor, setValor] = useState(patron?.patron ?? '');
  const [matchType, setMatchType] = useState<string>(
    patron?.matchType ?? MATCH_TYPES[0],
  );
  // Last value actually sent to the server (or the row's initial loaded
  // value) — the dirty-check baseline for `commit()` below. Judgment-day
  // round 2: only advances on a SUCCESSFUL `actualizar`, never
  // optimistically — a failed `PATCH` must stay retryable on the very next
  // identical-looking blur/Enter, not get silently swallowed by the dirty
  // check.
  const [ultimoComprometido, setUltimoComprometido] = useState({
    valor: patron?.patron ?? '',
    matchType: patron?.matchType ?? MATCH_TYPES[0],
  });

  const idCreado = patron?.id;
  const filaId = useId();
  const botonEliminarRef = useRef<HTMLButtonElement>(null);

  const bloqueadoTotal = esDemo || bloqueado;

  // Judgment-day finding (PR #4, 2026-08-14, round 1): `commit()`/
  // `eliminarFila()` had NO preconditions beyond `esDemo` — each symptom (a
  // re-entrant POST on a not-yet-created row, an empty-value commit, a
  // delete racing an in-flight create) got patched individually across FOUR
  // review rounds of the PREVIOUS PR (#3b). `filaOcupada` closed those, but
  // round 2 found it ALSO opened two new CRITICALs on its own: (a) it left
  // `CampoSelect`/`CampoTexto` editable while their own mutation was in
  // flight, silently discarding a second edit; (b) combined with the
  // ambiguous `blur` commit trigger, it could disable the delete button out
  // from under the very click that was about to fire it. `accionesBloqueadas`
  // is still the ONE precondition every gate below shares (mutation pending,
  // OR demo, OR an external dialog open) — round 2 additionally disables the
  // row's OWN inputs on it (see the JSX below) and fixes the `blur` trigger
  // itself (see `alPerderFocoPatron`) rather than adding a fifth `disabled`
  // condition on top.
  const filaOcupada =
    crear.isPending || actualizar.isPending || eliminar.isPending;
  const accionesBloqueadas = bloqueadoTotal || filaOcupada;

  function commit(overrides?: {
    readonly valor?: string;
    readonly matchType?: string;
  }) {
    if (accionesBloqueadas) {
      return;
    }
    const valorFinal = (overrides?.valor ?? valor).trim();
    const matchTypeFinal = overrides?.matchType ?? matchType;

    // A blank (or whitespace-only) value is "not ready to commit yet", not
    // a validation error — no request, no `role="alert"`. Reachable on a
    // brand-new row by picking `matchType` before typing (the natural
    // "pick the type, then write the text" order), and on an existing row
    // by clearing the text and then changing `matchType`.
    if (valorFinal === '') {
      return;
    }

    // Dirty check (judgment-day round 2 CRITICAL #1 fix direction): nothing
    // changed since the last successful commit — an incidental re-blur
    // (e.g. focus bounced away and back without an edit) must not repeat an
    // identical request. Also makes blur-commit idempotent under repeated
    // Enter/blur on an unchanged field.
    if (
      valorFinal === ultimoComprometido.valor &&
      matchTypeFinal === ultimoComprometido.matchType
    ) {
      return;
    }

    if (idCreado === undefined) {
      crear.mutate(
        {
          categoriaId,
          patron: valorFinal,
          matchType: matchTypeFinal as MatchType,
        },
        {
          onSuccess: () => {
            onAnunciar?.('Patrón guardado.');
            onDescartar?.();
          },
        },
      );
      return;
    }
    actualizar.mutate(
      {
        id: idCreado,
        patch: { patron: valorFinal, matchType: matchTypeFinal as MatchType },
      },
      {
        onSuccess: () => {
          setUltimoComprometido({
            valor: valorFinal,
            matchType: matchTypeFinal,
          });
          onAnunciar?.('Patrón guardado.');
        },
      },
    );
  }

  function alCambiarMatchType(nuevoMatchType: string) {
    setMatchType(nuevoMatchType);
    commit({ matchType: nuevoMatchType });
  }

  // Judgment-day round 2 CRITICAL #1 fix: `blur` is an AMBIGUOUS commit
  // trigger — it cannot tell "I finished editing, save this" from "I am
  // leaving this field to press this row's own delete button". A native
  // click ALWAYS fires `blur` (with `relatedTarget` = the element about to
  // receive focus) before dispatching `click` — so an unguarded `commit()`
  // here starts a real mutation for text the user is about to discard, and
  // (for a not-yet-created row) that create's `onSuccess` unconditionally
  // re-adds the pattern the user tried to delete. Comparing
  // `event.relatedTarget` against the delete button's own ref fixes the
  // TRIGGER instead of gating the CONSEQUENCE — and, unlike
  // `onMouseDown`+`preventDefault()`, this also covers keyboard Tab onto the
  // delete button, not just a mouse click.
  function alPerderFocoPatron(event: FocusEvent<HTMLInputElement>) {
    if (event.relatedTarget === botonEliminarRef.current) {
      return;
    }
    commit();
  }

  function alPresionarTecla(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  }

  function eliminarFila() {
    if (accionesBloqueadas) {
      return;
    }
    if (idCreado === undefined) {
      onDescartar?.();
      return;
    }
    eliminar.mutate(idCreado, {
      onSuccess: () => onAnunciar?.('Patrón eliminado.'),
    });
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

  // Judgment-day round 2 SUGGESTION: associate the REGEX hint and the error
  // with the `Patrón` input via `aria-describedby` so a screen-reader user
  // returning to the field gets a persistent association, not just a
  // one-time announcement. Only the ids that are actually rendered go in.
  const idHint = `${filaId}-hint`;
  const idError = `${filaId}-error`;
  const describedBy =
    [regexInvalida && idHint, errorMutacion && idError]
      .filter((id): id is string => Boolean(id))
      .join(' ') || undefined;

  // Judgment-day round 2 SUGGESTION: trim before sending AND before
  // building the accessible name — leading/trailing whitespace in `valor`
  // silently changes CONTAINS/STARTS_WITH matching semantics, and an
  // untrimmed `aria-label` would echo that same invisible whitespace back to
  // a screen-reader user. Applied uniformly, including REGEX — this project
  // has no `MatchType` where trailing/leading whitespace is a documented,
  // intentional part of the pattern, so special-casing REGEX here would be
  // silent, undiscussed behavior for a case nobody has asked for (see this
  // PR's fix report for the explicit call-out).
  const valorParaEtiqueta = valor.trim();

  return (
    <li className="flex flex-wrap items-start gap-2 border-b border-border py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        <CampoSelect
          label="Tipo de coincidencia"
          value={matchType}
          onChange={alCambiarMatchType}
          options={OPCIONES_MATCH_TYPE}
          disabled={accionesBloqueadas}
        />
        <CampoTexto
          label="Patrón"
          value={valor}
          onChange={setValor}
          disabled={accionesBloqueadas}
          onBlur={alPerderFocoPatron}
          onKeyDown={alPresionarTecla}
          ariaDescribedBy={describedBy}
        />
      </div>
      <button
        ref={botonEliminarRef}
        type="button"
        disabled={accionesBloqueadas}
        onClick={eliminarFila}
        aria-label={
          valorParaEtiqueta
            ? `Eliminar patrón ${valorParaEtiqueta}`
            : 'Eliminar patrón nuevo'
        }
        className={cn(
          CLASE_BOTON_ICONO,
          'mt-1 text-destructive disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <Trash2 aria-hidden="true" className="size-[18px]" />
      </button>
      {regexInvalida && (
        <p id={idHint} role="status" className="w-full text-xs text-amber-600">
          Esa expresión regular podría no ser válida.
        </p>
      )}
      {errorMutacion && (
        <p id={idError} role="alert" className="w-full text-xs text-red-600">
          {mensajeDeErrorCatalogo(errorMutacion)}
        </p>
      )}
    </li>
  );
}
