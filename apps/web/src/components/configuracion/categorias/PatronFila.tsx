import { useEffect, useId, useRef, useState } from 'react';
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
 * `Guardar` (WCTG-04's second, independent commit surface).
 *
 * **Redesign (judgment-day, 2026-08-14, after three fix rounds each of
 * which opened the next round's defect — see `docs/adr/` change log for the
 * full account)**: the frozen spec (`specs/web-app/spec.md`) only requires
 * patterns to commit "the moment each row action is confirmed" — it never
 * said `blur`. The three previous rounds all treated `blur` as ONE
 * ambiguous commit trigger shared by both a not-yet-created row and an
 * existing one, then patched each new misfire individually. This version
 * splits the two cases instead:
 *
 * - **A not-yet-created row** (`patron` prop absent, design.md §1/Q9a) does
 *   **not** commit on blur AT ALL — its first commit is an EXPLICIT confirm
 *   (Enter in `Patrón`, or picking a `matchType` once `Patrón` already has
 *   text — both are discrete, deliberate actions, unlike `blur`, which
 *   fires just as often when the user is merely leaving the field). This
 *   kills the entire "delete races an in-flight create" class structurally:
 *   a not-yet-created row can ALWAYS be discarded via `onDescartar` with
 *   **zero** network calls, because nothing ever auto-creates behind the
 *   user's back.
 * - **An existing row** (`patron` id known) keeps commit-on-blur-or-Enter —
 *   delete is always well-defined here (there is always a server id). The
 *   remaining ambiguity — Tab-ing onto the delete button must still commit
 *   the edit, but a real CLICK on it must not fire a save the user is about
 *   to discard — is resolved by tracking genuine POINTER intent
 *   (`onMouseDown` on the delete button, which always precedes a real
 *   click but never a Tab landing), not by inspecting `blur`'s
 *   `relatedTarget` (round 2's approach, which conflated the two: it also
 *   ate a keyboard user's edit on a plain Tab, no signal given).
 *
 * Mutation success bodies are discarded everywhere in this feature (Q2a),
 * so this component can never learn a freshly `POST`ed pattern's server id
 * from the response — on success it asks the parent to drop the local-only
 * placeholder (`onDescartar`); the persisted row then appears through
 * `PatronesSection`'s normal render of `categoria.patrones` once profile
 * A's invalidation refetches `['categorias']`.
 *
 * **Resync from `patron`**: local `valor`/`matchType` seed once from props
 * but ALSO resync whenever the incoming `patron.patron`/`patron.matchType`
 * diverge from what this row last knew as committed (e.g. a background
 * `['categorias']` refetch) — but ONLY when the user has no unsaved local
 * edit (`valor`/`matchType` still equal the last-committed baseline). An
 * active, unsaved edit is never clobbered by a refetch.
 *
 * **A blank commit reverts, it doesn't freeze**: clearing an EXISTING row's
 * `Patrón` to blank and leaving the field is a no-op (no request — a blank
 * pattern is meaningless), but the display now reverts to the last
 * committed text instead of staying blank forever, permanently diverged
 * from the still-live server value. A not-yet-created row has nothing to
 * revert to, so it just stays blank.
 *
 * **Focus restoration**: setting `disabled` on a focused native control
 * blurs it to `<body>` synchronously — the Enter-commit path re-disables
 * `Patrón` while its mutation is in flight, so without this, every
 * Enter-commit silently drops the user's place. Mirrors
 * `EditarCategoria`'s `restaurarFocoGuardarRef` (a ref flag + a `useEffect`
 * keyed on the fields being re-enabled, deferring `.focus()` until React
 * has actually committed `disabled: false`).
 *
 * **REGEX pre-validation is a hint, not a gate** (design.md §1/Q9b): the
 * browser's `RegExp` engine is not guaranteed to match the server's, so a
 * client-side *block* would refuse patterns the API would accept (ADR-024).
 * An inline `role="status"` hint renders when `matchType === 'REGEX'` and
 * the current text fails `new RegExp(...)`, but the commit path is
 * untouched.
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

  // `PatronDto.matchType` is deliberately plain `string` at the HTTP
  // boundary (see `types.ts`'s docblock, design.md Q2b/Q4c) — the server is
  // the authority on validity (ADR-024), and a value the web does not
  // recognise must still round-trip, not vanish. Local state keeps that
  // same `string` boundary all the way through (mirrors `EditarCategoria`'s
  // `bucket`) — `esPatronDto` (`api/categorias.ts`) only checks
  // `typeof === 'string'`, never membership in `MATCH_TYPES`, so narrowing
  // to `MatchType` here would assert an invariant nothing actually
  // enforces. The single legitimate `MatchType` cast happens at the two
  // mutate call sites below, the same boundary `bucket as BucketAsignable`
  // uses in `EditarCategoria` — a value the user picked FROM
  // `OPCIONES_MATCH_TYPE` (built from `MATCH_TYPES`) really can only be one
  // of the three literals by the time it's sent.
  const matchTypeInicial = patron?.matchType ?? MATCH_TYPES[0];

  const [valor, setValor] = useState(patron?.patron ?? '');
  const [matchType, setMatchType] = useState(matchTypeInicial);
  // Last value actually sent to the server (or the row's initial loaded
  // value) — the dirty-check baseline for `commit()` below. Judgment-day
  // round 2: only advances on a SUCCESSFUL `actualizar`, never
  // optimistically — a failed `PATCH` must stay retryable on the very next
  // identical-looking blur/Enter, not get silently swallowed by the dirty
  // check.
  const [ultimoComprometido, setUltimoComprometido] = useState({
    valor: patron?.patron ?? '',
    matchType: matchTypeInicial,
  });

  const idCreado = patron?.id;
  const filaId = useId();
  const botonEliminarRef = useRef<HTMLButtonElement>(null);
  const inputPatronRef = useRef<HTMLInputElement>(null);

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
  // row's OWN inputs on it (see the JSX below); the redesign (see this
  // component's docblock) fixes the `blur` trigger itself for good instead
  // of adding a sixth `disabled` condition on top.
  const filaOcupada =
    crear.isPending || actualizar.isPending || eliminar.isPending;
  const accionesBloqueadas = bloqueadoTotal || filaOcupada;

  // Resync from `patron` (redesign structural cause #1): local state seeds
  // once from props on mount, but a background `['categorias']` refetch
  // (this same screen's OWN pattern mutations invalidate that key) can move
  // the server truth without this row ever re-mounting (`key={patron.id}`
  // stays stable). Compared against the PREVIOUS `patron` prop
  // (`patronPrevio`), never against `ultimoComprometido` — a successful
  // mutation legitimately advances `ultimoComprometido` AHEAD of the still-
  // stale `patron` prop (the invalidated refetch hasn't landed yet), so
  // comparing against `ultimoComprometido` would misread that ordinary lag
  // as "the server changed" and immediately stomp the very edit that just
  // succeeded. Only resync when the user has NO unsaved local edit —
  // `valor`/`matchType` still equal the last-committed baseline — so an
  // active, in-progress edit is never clobbered by a refetch landing
  // mid-type either.
  //
  // This is React's own "adjusting state when a prop changes" recipe
  // (https://react.dev/learn/you-might-not-need-an-effect) — a conditional
  // `setState` call DURING RENDER, guarded by comparing against a snapshot
  // of the previous prop kept in state, NOT a `useEffect`. `setPatronPrevio`
  // always runs inside the same guard, so the condition is false again on
  // the very next render — self-limiting, no extra render pass, and (unlike
  // an effect) no `react-hooks/set-state-in-effect` lint violation either.
  const [patronPrevio, setPatronPrevio] = useState(patron);
  if (
    patron &&
    (patron.patron !== patronPrevio?.patron ||
      patron.matchType !== patronPrevio?.matchType)
  ) {
    setPatronPrevio(patron);
    const sinEdicionLocalPendiente =
      valor === ultimoComprometido.valor &&
      matchType === ultimoComprometido.matchType;
    if (sinEdicionLocalPendiente) {
      setValor(patron.patron);
      setMatchType(patron.matchType);
      setUltimoComprometido({
        valor: patron.patron,
        matchType: patron.matchType,
      });
    }
  }

  // Focus restoration (redesign structural cause #4): setting `disabled` on
  // a focused native control blurs it to `<body>` synchronously — the
  // Enter-commit path re-disables `Patrón` while its own mutation is in
  // flight, so without this the user loses their place on every single
  // Enter-commit. Same shape as `EditarCategoria`'s `restaurarFocoGuardarRef`
  // (a ref flag set at the moment of the user's OWN gesture + a `useEffect`
  // keyed on the fields being re-enabled — effects run after React commits
  // `disabled: false`, so `.focus()` is never a no-op here).
  //
  // Judgment-day PR #4 WARNING: this effect used to key on the COMBINED
  // `accionesBloqueadas` (own mutation OR external `bloqueado` dialog OR
  // demo). That let an external block (`bloqueado`, `EditarCategoria`'s
  // `dialogo !== null`) swallow the transition entirely: the row's OWN
  // mutation could resolve WHILE `bloqueado` was still true (so
  // `accionesBloqueadas` never dipped to `false`), and then, once the
  // EXTERNAL dialog closed on its own schedule, this effect would fire and
  // steal focus back to `Patrón` — even after the dialog's own close
  // handler (`cerrarDialogo`) had already synchronously restored focus to
  // `Guardar`/`Eliminar` (WCTG-07). The intent belongs ONLY to this row's
  // OWN mutation lifecycle, so the effect now keys on `filaOcupada` (never
  // on `bloqueado`): the moment this row's OWN mutation settles, either
  // restore focus (no external block active) or DROP the intent outright
  // (an external block is still up — that focus belongs to whatever
  // imposed the block, not to this row). Dropping it here, rather than
  // deferring it, keeps the ref's lifecycle total: it always ends up
  // `false` exactly once per commit, never replayed once the external
  // block eventually clears.
  const restaurarFocoPatronRef = useRef(false);
  useEffect(() => {
    if (!filaOcupada && restaurarFocoPatronRef.current) {
      if (!bloqueadoTotal) {
        inputPatronRef.current?.focus();
      }
      restaurarFocoPatronRef.current = false;
    }
  }, [filaOcupada, bloqueadoTotal]);

  // Pointer-intent flag for the delete button (redesign structural cause
  // #2, replaces round 2's `relatedTarget` check — see `alPerderFocoPatron`
  // below). Set in the button's OWN `onMouseDown`, which always precedes a
  // real click but never a Tab landing.
  const clicEliminarEnCursoRef = useRef(false);

  // Deferred-replay timer id (judgment-day PR #4 WARNING): `alPerderFocoPatron`
  // below defers its recovery `commit()` by one macrotask (`setTimeout(...,
  // 0)`) to let a genuine `click` win the race first — but a macrotask
  // outlives this component's own lifetime. Reachable sequence: mousedown
  // on the delete button, drag off before release (schedules the timer via
  // `blur`), then activate `Cancelar` — `EditarCategoria`'s
  // `cancelarIdentidad` navigates away and unmounts this whole row before
  // the timer fires. Without a held id + cleanup, the callback still runs
  // against a stale closure and fires a real, unawaited
  // `PATCH /api/patrones/:id` for a row the user already left. Holding the
  // id in a ref and clearing it on unmount keeps this identical in shape to
  // `restaurarFocoPatronRef`'s effect above — a ref set at the moment of
  // the gesture, consumed exactly once.
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

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
    // by clearing the text and then changing `matchType`. On an EXISTING
    // row, the display reverts to the last committed text instead of
    // staying blank forever, permanently diverged from the still-live
    // server value (redesign structural cause #3) — a not-yet-created row
    // has nothing to revert to, so it just stays blank.
    //
    // Judgment-day round 3 CRITICAL: reverting ONLY `valor` here left
    // `matchType` at whatever a same-tick `alCambiarMatchType` had already
    // moved it to (e.g. blank Patrón + immediately picking a new match
    // type) — the displayed pair was never jointly confirmed, and the next
    // blur's dirty check would then see `valor` unchanged but `matchType`
    // changed and fire a real PATCH for a pair the user never committed.
    // Revert BOTH fields together, so the dirty-check baseline itself is
    // restored, not just the visible text.
    if (valorFinal === '') {
      if (idCreado !== undefined) {
        setValor(ultimoComprometido.valor);
        setMatchType(ultimoComprometido.matchType);
      }
      // No mutation starts on this path — any Enter-driven focus-restore
      // intent set just before this call (see `restaurarFocoPatronRef`
      // above) would otherwise stay stuck `true` forever: `accionesBloqueadas`
      // never cycles, so the `useEffect` that normally clears it never runs.
      restaurarFocoPatronRef.current = false;
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
      // Same reasoning as the blank guard above — no mutation starts here
      // either (judgment-day round 3 CRITICAL).
      restaurarFocoPatronRef.current = false;
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
    // Reset any focus-restoration intent left over from an earlier Enter
    // press that turned out to be a no-op (e.g. the dirty check bailed) —
    // this commit isn't via Enter, so it must not later steal focus back to
    // `Patrón` once ITS mutation resolves.
    restaurarFocoPatronRef.current = false;
    setMatchType(nuevoMatchType);
    commit({ matchType: nuevoMatchType });
  }

  // Redesign (structural causes #1 and #2, see this component's docblock):
  // a not-yet-created row's FIRST commit must be an EXPLICIT confirm
  // (Enter, or picking `matchType` once `Patrón` already has text) — `blur`
  // never commits it, full stop, regardless of where focus goes next. An
  // EXISTING row keeps commit-on-blur, but must still distinguish a genuine
  // CLICK on the delete button (skip the commit — the row is about to be
  // discarded anyway) from a Tab landing on it (commit — Tab is not a
  // discard signal). `clicEliminarEnCursoRef` (set by the button's own
  // `onMouseDown`) carries that intent; a bare `relatedTarget` check cannot,
  // because it fires identically for both.
  //
  // Judgment-day round 3 WARNING: skipping the commit outright the moment
  // the flag is seen `true` assumed a real `click` was always about to
  // follow — false on a 24×24 target, where the pointer can drag off the
  // button before release. `mousedown`+`blur` always fire together (this
  // component relies on the browser focusing the button on `mousedown`),
  // but `click` only fires if `mouseup` also lands on the button — so this
  // handler can't yet tell the two cases apart. Defer the decision instead
  // of deciding it here: `eliminarFila`'s `onClick` runs SYNCHRONOUSLY,
  // before any `setTimeout(0)` macrotask, so it always wins the race and
  // clears the flag first when a click genuinely lands; if no click lands,
  // this replays the commit that was provisionally skipped, instead of
  // silently dropping the user's edit.
  function alPerderFocoPatron(_event: FocusEvent<HTMLInputElement>) {
    if (idCreado === undefined) {
      // A not-yet-created row's `blur` never commits (see this component's
      // docblock) — but the flag still needs clearing here, otherwise a
      // `mousedown` on the delete button before the row is ever created
      // would leave it permanently `true` with no later `blur` able to
      // reset it (no deferred replay either: `commit()` would auto-create
      // the row from a blur, which this row type must never do).
      clicEliminarEnCursoRef.current = false;
      return;
    }
    if (clicEliminarEnCursoRef.current) {
      timeoutIdRef.current = setTimeout(() => {
        timeoutIdRef.current = null;
        if (clicEliminarEnCursoRef.current) {
          clicEliminarEnCursoRef.current = false;
          commit();
        }
      }, 0);
      return;
    }
    commit();
  }

  function alPresionarTecla(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      restaurarFocoPatronRef.current = true;
      commit();
    }
  }

  function alMouseDownBotonEliminar() {
    clicEliminarEnCursoRef.current = true;
  }

  function eliminarFila() {
    // A real click landed on the delete button — cancel any deferred
    // recovery `alPerderFocoPatron` scheduled for the `blur` this click's
    // own `mousedown` just caused (see that function above); the row is
    // about to be discarded, so replaying the commit would be wasted.
    clicEliminarEnCursoRef.current = false;
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
          ref={inputPatronRef}
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
        onMouseDown={alMouseDownBotonEliminar}
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
