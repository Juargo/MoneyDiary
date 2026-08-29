/**
 * RegistrarMovimientoForm — US-060 (D-01 through D-15).
 *
 * Type-first stateful form for manual movement registration.
 * Props: `{ esDemo: boolean }` — the thin route container reads `esDemo`
 * from route context and passes it here (D-12).
 *
 * State: per-field useState (D-01 — KISS, matches NuevaCategoriaForm/PerfilForm idiom).
 * Cascade: useCategorias co-fetched on mount; CatalogoEstado derived inline (D-08).
 * Builder: construirBody() — discriminated-union request, structural guarantee (D-07).
 * Guard: isSubmittingRef for double-submit money-safety (D-10/WEB-REG-06).
 * Demo: proactive disabled on every field + note (D-11, NuevaCategoriaForm idiom).
 * A11y: dual feedback regions (aria-live polite + role=alert); cascade focus (D-09).
 * Confirm: submit opens a shared InlineConfirm dialog (critique round-8 P2)
 * over a snapshotted body; `commitRegistro` is the only thing that mutates.
 * Quick-repeat (critique round-8 P3): the dialog's secondary action
 * ("Confirmar y agregar otro", via InlineConfirm's `secondaryConfirm`)
 * commits the same snapshot and, on success, resets only fecha/descripción/
 * monto — tipo/bucket/categoría stay put (sticky classification) so several
 * same-category entries in one sitting stay fast. The primary "Confirmar
 * registro" keeps today's full-reset behavior, unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRegistrarMovimiento } from '@/api/use-registrar-movimiento';
import { useCategorias } from '@/api/use-categorias';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { hoyLocal, esFechaValida } from '@/domain/fecha';
import {
  esMontoStringValido,
  formatearMontoCLP,
} from '@/domain/formatear-monto';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type { BucketAsignable } from '@/api/catalogo-constantes';
import type { RegistrarMovimientoManualInput } from '@/api/movimientos';
import type { ApiError } from '@/api/client';
import type { CatalogoEstado } from '@/api/types';
import { ETIQUETA_BUCKET, construirOpcionesBucket } from '@/lib/bucket-colors';
import { CampoTexto } from './configuracion/CampoTexto';
import { CampoSelect } from './configuracion/categorias/CampoSelect';
import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/inline-confirm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENSAJE_DEMO_REGISTRAR =
  'La cuenta demo es de solo lectura. No es posible registrar movimientos en modo demo.';

// Reused verbatim in the always-visible note below the form AND inside the
// confirmation dialog's body (critique round-8 P2, DRY) — the dialog
// reiterates the exact same permanence expectation the user already saw
// before opening it, rather than a differently-worded copy.
//
// Rewritten (SDD `correccion-movimientos-manuales` PR 3, design D-04,
// WEB-DEL-02): the original copy promised a manual movement "no se puede
// editar ni eliminar después" — false as of ADR-040/`EliminarMovimientoControl`
// (DELETE /api/movimientos/:id). Editing is still impossible; deletion now
// exists. EXPORTED (not just module-local) so `RegistrarMovimientoForm.test.tsx`
// pins the SAME constant both render sites consume, instead of duplicating
// the literal string in two places that could silently drift apart.
export const MENSAJE_PERMANENCIA =
  'Un movimiento registrado no se puede editar, pero puedes eliminarlo desde el detalle del mes y registrarlo de nuevo; su categoría también puede reclasificarse desde el dashboard.';

const OPCIONES_TIPO = [
  { value: 'Ingreso', label: 'Ingreso' },
  { value: 'Gasto', label: 'Gasto' },
] as const;

type TipoMovimiento = 'Ingreso' | 'Gasto';

// Feedback state: null = no message; tono drives which region renders.
type Feedback =
  | { tono: 'ok'; texto: string }
  | { tono: 'error'; texto: string }
  | null;

// Per-field validation errors.
type Errores = {
  descripcion?: string;
  monto?: string;
  fecha?: string;
  cascade?: string;
};

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Positive integer string: non-empty, integer, non-negative, non-zero. */
function esMontoManualValido(m: string): boolean {
  return esMontoStringValido(m) && !m.startsWith('-') && m !== '0';
}

/** Type predicate: narrows a string to BucketAsignable (D-07, no `as` assertions). */
function esBucketAsignable(v: string): v is BucketAsignable {
  return (BUCKETS_ASIGNABLES as readonly string[]).includes(v);
}

/** Type predicate: narrows a string to TipoMovimiento (D-07, no `as` assertions). */
function esTipoMovimiento(v: string): v is TipoMovimiento {
  return (OPCIONES_TIPO as readonly { value: string }[]).some(
    (o) => o.value === v,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegistrarMovimientoForm({
  esDemo,
}: {
  readonly esDemo: boolean;
}) {
  // Per-field state (D-01)
  const [tipo, setTipo] = useState<TipoMovimiento>('Ingreso');
  const [fecha, setFecha] = useState<string>(() => hoyLocal());
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [bucketUI, setBucketUI] = useState('');
  const [categoriaId, setCategoriaId] = useState('');

  // Feedback state
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errores, setErrores] = useState<Errores>({});

  // Confirmation step (critique round-8 P2): hand-typed money commits
  // permanently on one click, unlike the cartola preview→commit review
  // table — so submit no longer mutates directly. `confirmacion` is a
  // SNAPSHOT of the exact body that will POST (plus the display-only
  // categoría name), captured once client pre-validation passes. Confirming
  // later posts THIS captured body, not a fresh read of live field state —
  // so the dialog can never drift from what it showed, even though it is
  // non-modal and the fields behind it stay technically editable.
  const [confirmacion, setConfirmacion] = useState<{
    body: RegistrarMovimientoManualInput;
    categoriaNombre: string | null;
  } | null>(null);
  // Mutation error while the confirmation dialog is open: rendered ONLY via
  // InlineConfirm's own `error` slot, deliberately NOT mirrored into
  // `feedback`'s role="alert" region below — the two would otherwise
  // announce the identical failure twice on screen at once. `feedback`'s
  // error tone stays reserved for outcomes reached with no dialog mounted
  // (client pre-validation, which never opens the dialog).
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Focus-restore target for the dialog's Cancelar/Escape (InlineConfirm
  // owns neither) — same responsibility EliminarIngestaControl/
  // ReclasificarCategoriaControl already carry for their own triggers.
  const submitRef = useRef<HTMLButtonElement>(null);
  // Set by cancelarConfirmacion, consumed by the effect below. The submit
  // button is DISABLED (formularioBloqueado) at the instant cancel/Escape
  // fires — a synchronous `.focus()` call right there would silently no-op
  // on a still-disabled button (state updates don't repaint until after the
  // handler returns). This flag defers the actual `.focus()` to the effect,
  // which runs after React re-renders the button enabled again.
  const restaurarFocoRef = useRef(false);

  // Quick-repeat (critique round-8 P3): tracks WHICH dialog action is
  // in-flight, since `mutation.isPending` alone is shared by both buttons —
  // this is what lets only the clicked one show the progressive
  // "Registrando…" label while the other stays disabled with its idle text
  // (requirement: both disabled while pending, whichever was clicked shows
  // its own progressive label). Defaults to `'completo'` — the PRIMARY
  // action — so that `mutation.isPending` alone (e.g. driven externally,
  // with no click routed through `commitRegistro` first) still surfaces the
  // in-flight label on the primary button, matching its pre-quick-repeat
  // behavior exactly (this default is also what keeps externally-driven
  // isPending test setups honest — absent a tracked click, assume the
  // primary is in flight).
  const [accionEnCurso, setAccionEnCurso] = useState<
    'completo' | 'agregarOtro'
  >('completo');
  // Ref to the descripción <input> (CampoTexto forwards its ref, same
  // mechanism ConfirmarPasswordDialog already uses) — the quick-repeat
  // focus target after a successful "Confirmar y agregar otro".
  const descripcionRef = useRef<HTMLInputElement>(null);
  // Same deferred-focus pattern as `restaurarFocoRef` above: descripción is
  // still disabled (formularioBloqueado) at the instant onSuccess fires, so
  // a synchronous `.focus()` here would no-op — this flag defers the actual
  // call to the effect below, which runs after the field re-renders enabled.
  const enfocarDescripcionRef = useRef(false);

  // formularioBloqueado — the ONE flag every field + the submit button is
  // disabled with while the dialog is open (fresh review CRITICAL, mirrors
  // `useSeleccionMasivaIngestas`'s `interaccionBloqueada`). `InlineConfirm`
  // is non-modal: without this, the user can tab back into the still-visible
  // fields, edit them, and an implicit Enter re-invokes `handleEnviar`,
  // silently REPLACING the already-open snapshot — defeating the whole
  // review step. `confirmacion !== null` alone covers "mutating" too:
  // `commitRegistro` never mutates without `confirmacion` set, and it only
  // clears on success (dialog closes) — never while pending.
  const formularioBloqueado = confirmacion !== null;

  // Compute local date once per render for the max attribute.
  // Submit-time comparisons call hoyLocal() fresh (must reflect the moment of submit).
  const hoy = hoyLocal();

  // Double-submit guard (D-10/WEB-REG-06): ref, not state — no re-render needed.
  const isSubmittingRef = useRef(false);

  // Cascade container ref for focus management (D-09). Element type follows
  // the fieldset sectioning below (impeccable critique P2).
  const cascadaRef = useRef<HTMLFieldSetElement>(null);

  // ---------------------------------------------------------------------------
  // API hooks
  // ---------------------------------------------------------------------------
  const mutation = useRegistrarMovimiento();

  const catalogoQuery = useCategorias();
  const catalogo: CatalogoEstado = catalogoQuery.isPending
    ? { tag: 'cargando' }
    : catalogoQuery.isError
      ? { tag: 'error' }
      : {
          tag: 'listo',
          grupos: agruparPorBucket(catalogoQuery.data?.categorias ?? []),
        };

  // ---------------------------------------------------------------------------
  // Cascade options
  // ---------------------------------------------------------------------------
  const bucketOptions =
    catalogo.tag === 'listo'
      ? [
          { value: '', label: 'Selecciona un bucket' },
          ...construirOpcionesBucket(catalogo.grupos.map((g) => g.bucket)),
        ]
      : [{ value: '', label: 'Selecciona un bucket' }];

  const categoriaOptions =
    catalogo.tag === 'listo' && bucketUI
      ? [
          { value: '', label: 'Selecciona una categoría' },
          ...(catalogo.grupos
            .find((g) => g.bucket === bucketUI)
            ?.categorias.map((c) => ({ value: c.id, label: c.nombre })) ?? []),
        ]
      : [{ value: '', label: 'Selecciona una categoría' }];

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * handleTipoChange — D-02: zeroes cascade state SYNCHRONOUSLY (not useEffect).
   * Every tipo switch resets bucketUI and categoriaId so stale Gasto state
   * cannot appear in an Ingreso body (two independent defences: this zeroing +
   * construirBody's structural guarantee).
   */
  function handleTipoChange(nuevo: string) {
    // Silently ignore values not in OPCIONES_TIPO (unreachable via bound select).
    if (!esTipoMovimiento(nuevo)) return;
    setTipo(nuevo);
    setBucketUI('');
    setCategoriaId('');
    // Clear any cascade errors when switching tipo.
    setErrores((prev) => ({ ...prev, cascade: undefined }));
  }

  /**
   * construirBody — D-07: returns the discriminated-union request.
   * Ingreso arm structurally has NO bucket/categoriaId keys.
   * Gasto arm has both, narrowed via esBucketAsignable.
   * Pre-validation runs before this is called, guaranteeing bucket is valid.
   */
  function construirBody(): RegistrarMovimientoManualInput {
    if (tipo === 'Ingreso') {
      return { tipo: 'Ingreso', fecha, descripcion, monto };
    }
    if (!esBucketAsignable(bucketUI)) {
      // Unreachable: handleEnviar's pre-validation gates this. The predicate here is the structural safety net (D-07).
      throw new Error('Bucket inválido');
    }
    // bucketUI is now narrowed to BucketAsignable — no cast needed
    return {
      tipo: 'Gasto',
      fecha,
      descripcion,
      monto,
      bucket: bucketUI,
      categoriaId,
    };
  }

  /**
   * handleEnviar — D-10: belt-and-suspenders guard + pre-validation + mutate.
   */
  function handleEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Guard: esDemo, isPending, isSubmittingRef, or the dialog already open
    // (D-10/D-11; the `confirmacion` arm is the belt-and-suspenders half of
    // the freeze — fields are also disabled via `formularioBloqueado`, but
    // this holds even if a submit event ever reaches here some other way,
    // e.g. a forced/synthetic submit bypassing the disabled UI, so a
    // re-submit can never silently replace the already-open snapshot).
    if (
      esDemo ||
      mutation.isPending ||
      isSubmittingRef.current ||
      confirmacion
    ) {
      return;
    }

    // Pre-validation (shape only, not business rules — ADR-024).
    const nextErrores: Errores = {};

    if (descripcion.trim() === '') {
      nextErrores.descripcion = 'La descripción es obligatoria.';
    }
    if (!esMontoManualValido(monto)) {
      nextErrores.monto = 'Ingresa un monto válido (número entero positivo).';
    }
    if (!esFechaValida(fecha) || fecha > hoyLocal()) {
      nextErrores.fecha = 'La fecha no puede ser futura.';
    }
    if (tipo === 'Gasto') {
      if (!esBucketAsignable(bucketUI)) {
        nextErrores.cascade = 'Selecciona un bucket válido.';
      } else if (!categoriaId) {
        nextErrores.cascade = 'Selecciona una categoría.';
      }
    }

    if (Object.keys(nextErrores).length > 0) {
      setErrores(nextErrores);
      // Consolidate into a single alert for the role="alert" region.
      setFeedback({
        tono: 'error',
        texto: Object.values(nextErrores).join(' '),
      });
      return;
    }

    // Clear previous validation errors on a clean submission.
    setErrores({});
    setFeedback(null);

    // Pre-validation passed: open the confirmation dialog instead of
    // mutating directly (critique round-8 P2). Snapshot the exact body AND
    // the human-readable categoría name NOW, from the values that just
    // passed validation — `commitRegistro` posts this snapshot verbatim.
    const body = construirBody();
    const categoriaNombre =
      body.tipo === 'Gasto'
        ? (categoriaOptions.find((o) => o.value === body.categoriaId)?.label ??
          null)
        : null;
    setConfirmError(null);
    setConfirmacion({ body, categoriaNombre });
  }

  /**
   * commitRegistro — both dialog actions' onClick/onConfirm. Fires the
   * actual POST for `confirmacion.body` (captured at handleEnviar time),
   * reusing the same double-submit guard and error handling handleEnviar
   * used to run directly (D-10/WEB-REG-06/WEB-REG-08, unchanged) regardless
   * of which action invoked it.
   *
   * `agregarOtro` (critique round-8 P3, quick-repeat) selects which success
   * reset runs: `false` is today's unchanged full reset (primary "Confirmar
   * registro"); `true` keeps tipo/bucket/categoría (sticky classification)
   * and clears only fecha/descripción/monto, then flags the deferred focus
   * effect below to land on descripción.
   */
  function commitRegistro(agregarOtro: boolean) {
    if (!confirmacion || mutation.isPending || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setAccionEnCurso(agregarOtro ? 'agregarOtro' : 'completo');
    mutation.mutate(confirmacion.body, {
      onSuccess: () => {
        if (agregarOtro) {
          // Quick-repeat: keep tipo/bucketUI/categoriaId untouched — only
          // the per-movement facts reset, ready for the next entry in the
          // same category.
          setFecha(hoyLocal());
          setDescripcion('');
          setMonto('');
          enfocarDescripcionRef.current = true;
        } else {
          // D-10: clear form on 201; reset to Ingreso. Same flow as before —
          // just also closes the dialog now.
          setTipo('Ingreso');
          setFecha(hoyLocal());
          setDescripcion('');
          setMonto('');
          setBucketUI('');
          setCategoriaId('');
        }
        setErrores({});
        setConfirmacion(null);
        setConfirmError(null);
        setAccionEnCurso('completo');
        setFeedback({
          tono: 'ok',
          texto: 'Movimiento registrado exitosamente.',
        });
      },
      onError: (err: ApiError) => {
        // Reconciliation with the outer role="alert" region (see
        // `confirmError`'s doc comment above): the error lives ONLY inside
        // the still-open dialog. Do NOT clear any field (WEB-REG-08) and do
        // NOT close the dialog — the user can retry without re-reading the
        // summary. Same handling regardless of which action was clicked.
        setConfirmError(err.message);
        setAccionEnCurso('completo');
      },
      onSettled: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  /** cancelarConfirmacion — Cancelar click or Escape. Preserves every typed
   * field (no state above is touched), fires nothing, restores focus to the
   * submit button (InlineConfirm owns neither focus-restore nor closing).
   *
   * Fresh review BLOCKER: no-ops while `mutation.isPending` — mirrors
   * `useSeleccionMasivaIngestas.cancelarConfirmacion`'s guard on
   * `eliminando`. `InlineConfirm` calls `onCancel` UNCONDITIONALLY on
   * Escape (its documented caller-owns-the-guard contract), so this guard
   * has to live here, not only in the `cancelDisabled` prop below (which
   * only disables the Cancelar button, never Escape). Without it: a
   * "cancel" while a POST is in flight either lets that POST land after
   * `onSuccess` already wiped the fields (a false-consent write), or its
   * `onError` writes `confirmError` into a dialog the user believes is
   * already closed (silently swallowed). */
  function cancelarConfirmacion() {
    if (mutation.isPending) {
      return;
    }
    // See `restaurarFocoRef`'s doc comment: the actual `.focus()` call is
    // deferred to the effect below, once the submit button is re-enabled.
    restaurarFocoRef.current = true;
    setConfirmacion(null);
    setConfirmError(null);
  }

  // ---------------------------------------------------------------------------
  // Focus management (D-09): quando tipo === 'Gasto', move focus to the first
  // <select> inside cascadaRef (which is the bucket select by ordering).
  // The CA-10 test asserts document.activeElement === bucket select,
  // enforcing the ordering invariant.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (tipo === 'Gasto') {
      cascadaRef.current?.querySelector('select')?.focus();
    }
  }, [tipo]);

  // Deferred focus-restore for cancelarConfirmacion (see `restaurarFocoRef`'s
  // doc comment): runs after the dialog closes and the submit button is
  // re-enabled, never after a successful commit (commitRegistro's onSuccess
  // never sets the flag).
  useEffect(() => {
    if (confirmacion === null && restaurarFocoRef.current) {
      restaurarFocoRef.current = false;
      submitRef.current?.focus();
    }
  }, [confirmacion]);

  // Deferred focus for "Confirmar y agregar otro" (critique round-8 P3): see
  // `enfocarDescripcionRef`'s doc comment — runs after the dialog closes and
  // descripción is re-enabled, landing focus there so the next movement can
  // be typed immediately. Never fires after the primary "Confirmar
  // registro" (commitRegistro only sets the flag on the agregarOtro path).
  useEffect(() => {
    if (confirmacion === null && enfocarDescripcionRef.current) {
      enfocarDescripcionRef.current = false;
      descripcionRef.current?.focus();
    }
  }, [confirmacion]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <form
      onSubmit={handleEnviar}
      className="flex flex-col gap-4 rounded-lg border border-border p-6"
      noValidate
    >
      {/*
        Sectioning (impeccable critique P2): the movement facts (tipo, fecha,
        descripción, monto) and the classification cascade below are two
        distinct decisions for the user — this fieldset/legend gives that
        break a name instead of reading as one flat list. `fieldset`/`legend`
        over a heading+divider because it's already the app's own idiom for
        grouping related fields (PerfilForm's "Cambiar password" section) and
        gets the `role="group"` + accessible name for free. Same `mb-4`
        legend spacing note as PerfilForm applies here (see that file).
      */}
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-4 p-0 text-sm font-semibold text-foreground">
          Movimiento
        </legend>
        {/* Tipo selector — type-first (D-01/D-02) */}
        <CampoSelect
          label="Tipo"
          value={tipo}
          onChange={handleTipoChange}
          options={OPCIONES_TIPO}
          disabled={esDemo || formularioBloqueado}
        />

        {/* Fecha — raw <label><input type="date"> (CampoTexto cannot host date, D-04/§0) */}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Fecha
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => setFecha(e.target.value)}
            required
            disabled={esDemo || formularioBloqueado}
            className="rounded-md border border-input px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          />
        </label>
        {errores.fecha && (
          <p className="text-sm text-destructive">{errores.fecha}</p>
        )}

        {/* Descripción — CampoTexto (type='text', D-15) */}
        <CampoTexto
          ref={descripcionRef}
          label="Descripción"
          value={descripcion}
          onChange={setDescripcion}
          type="text"
          disabled={esDemo || formularioBloqueado}
        />
        {errores.descripcion && (
          <p className="text-sm text-destructive">{errores.descripcion}</p>
        )}

        {/* Monto — raw <label><input type="text" inputMode="numeric"> (D-03/§0) */}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Monto
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            disabled={esDemo || formularioBloqueado}
            className="rounded-md border border-input px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          />
        </label>
        {errores.monto && (
          <p className="text-sm text-destructive">{errores.monto}</p>
        )}
      </fieldset>

      {/* Gasto cascade (D-08/D-09): bucket → categoría — second fieldset,
          same sectioning idiom as "Movimiento" above (D-09's ordering
          invariant on cascadaRef's first <select> is unaffected by the
          fieldset wrapper). */}
      {tipo === 'Gasto' && (
        <fieldset
          ref={cascadaRef}
          className="m-0 flex flex-col gap-4 border-0 p-0"
        >
          <legend className="mb-4 p-0 text-sm font-semibold text-foreground">
            Clasificación
          </legend>
          {/* Catalog error degrade (D-08, CA-08) */}
          {catalogo.tag === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              No se pudo cargar el catálogo de categorías. Puedes intentar con
              los valores que ya tienes seleccionados o reintentar más tarde.
            </p>
          )}
          {catalogo.tag === 'cargando' && (
            <p className="text-sm text-muted-foreground">
              Cargando categorías…
            </p>
          )}

          {/* Bucket select — first <select> inside cascadaRef (D-09 ordering invariant) */}
          <CampoSelect
            label="Bucket"
            value={bucketUI}
            onChange={(v) => {
              setBucketUI(v);
              setCategoriaId('');
            }}
            options={bucketOptions}
            disabled={esDemo || formularioBloqueado || catalogo.tag !== 'listo'}
          />

          {/* Categoría select — disabled until bucket chosen (WEB-REG-04, FilaRevision precedent) */}
          <CampoSelect
            label="Categoría"
            value={categoriaId}
            onChange={setCategoriaId}
            options={categoriaOptions}
            disabled={
              esDemo ||
              formularioBloqueado ||
              catalogo.tag !== 'listo' ||
              !bucketUI
            }
          />

          {errores.cascade && (
            <p className="text-sm text-destructive">{errores.cascade}</p>
          )}
        </fieldset>
      )}

      {/* Demo notice (D-11, NuevaCategoriaForm idiom) */}
      {esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_REGISTRAR}
        </p>
      )}

      {/* Permanence expectation (impeccable critique r7 P2, harden): a
          committed movement has no edit/delete path in the app — only
          whole-ingesta deletion exists, which never covers manual
          movements (ingestaId NULL, ADR-039) — while its categoría CAN
          be reclassified inline later. Said here, at the decision point,
          instead of after commit (error prevention over error recovery);
          same role="note" idiom as MENSAJE_DEMO_REGISTRAR above. */}
      <p role="note" className="text-sm text-muted-foreground">
        {MENSAJE_PERMANENCIA}
      </p>

      {/* Error feedback region (role="alert", D-10, PerfilForm idiom) */}
      <div role="alert" className="text-sm text-destructive">
        {feedback?.tono === 'error' && <p>{feedback.texto}</p>}
      </div>

      {/* Submit button (D-11: disabled={esDemo || mutation.isPending ||
          formularioBloqueado}) — only opens the confirmation dialog below
          (critique round-8 P2); it no longer mutates directly, so it no
          longer carries the "Registrando…" in-flight label itself — that
          moved to the dialog's own confirm button, the control that now
          actually fires the mutation. `formularioBloqueado` freezes it
          alongside every other field once the dialog is open (fresh review
          CRITICAL). */}
      <Button
        ref={submitRef}
        type="submit"
        disabled={esDemo || mutation.isPending || formularioBloqueado}
      >
        Registrar movimiento
      </Button>

      {/* Confirmation dialog (critique round-8 P2): the shared InlineConfirm
          recipe (DESIGN.md "Inline Confirmation Dialog"), non-destructive
          variant — this commits data, it doesn't delete it. Shows exactly
          what `commitRegistro` will POST (D-07's discriminated union,
          narrowed here the same way `construirBody` is). "Registrando…"
          takes over the confirm label while pending — the same in-flight
          vocabulary the submit button used to carry directly (impeccable
          critique P2, now relocated to the control that actually fires the
          mutation).

          Quick-repeat (critique round-8 P3): `secondaryConfirm` adds
          "Confirmar y agregar otro" next to the primary action — opt-in,
          same snapshot, different success reset (see `commitRegistro`'s doc
          comment). Both share `mutation.isPending` for disabling; only the
          one `accionEnCurso` names shows the progressive label, so a click
          on either never leaves the other looking falsely idle-and-usable. */}
      {confirmacion && (
        <InlineConfirm
          title="Confirmar registro"
          confirmLabel={
            mutation.isPending && accionEnCurso === 'completo'
              ? 'Registrando…'
              : 'Confirmar registro'
          }
          onConfirm={() => commitRegistro(false)}
          onCancel={cancelarConfirmacion}
          pending={mutation.isPending}
          cancelDisabled={mutation.isPending}
          error={confirmError}
          secondaryConfirm={{
            label:
              mutation.isPending && accionEnCurso === 'agregarOtro'
                ? 'Registrando…'
                : 'Confirmar y agregar otro',
            onClick: () => commitRegistro(true),
            disabled: mutation.isPending,
          }}
          className="gap-2 p-4 text-sm"
        >
          <p>
            <span className="font-semibold">{confirmacion.body.tipo}</span>
            {' · '}
            {confirmacion.body.fecha}
          </p>
          <p>{confirmacion.body.descripcion}</p>
          <p className="font-semibold">
            {formatearMontoCLP(confirmacion.body.monto)}
          </p>
          {confirmacion.body.tipo === 'Gasto' && (
            <p>
              {ETIQUETA_BUCKET[confirmacion.body.bucket] ??
                confirmacion.body.bucket}
              {confirmacion.categoriaNombre
                ? ` · ${confirmacion.categoriaNombre}`
                : ''}
            </p>
          )}
          <p className="text-muted-foreground">{MENSAJE_PERMANENCIA}</p>
        </InlineConfirm>
      )}

      {/* "Ir al dashboard" — static plain anchor, always present (D-10: not conditional on success) */}
      <a
        href="/"
        className="text-center text-sm text-muted-foreground underline hover:text-foreground"
      >
        Ir al dashboard
      </a>

      {/* Success feedback region (aria-live="polite" + role="status", D-10, SubirCartola/ListaIngestas/CategoriasPanel pattern) */}
      <div
        role="status"
        aria-live="polite"
        className="text-sm text-exito-foreground"
      >
        {feedback?.tono === 'ok' && <p>{feedback.texto}</p>}
      </div>
    </form>
  );
}
