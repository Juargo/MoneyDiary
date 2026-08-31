import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  Upload,
} from 'lucide-react';
import { Button } from './ui/button';
import { InlineConfirm } from './ui/inline-confirm';
import { DemoUploadNudge } from './DemoUploadNudge';
import { PreviewMuestra } from './PreviewMuestra';
import { SemaforoBadge } from './SemaforoBadge';
import { Loading } from './states/Loading';
import { usePreviewIngesta } from '@/api/use-preview-ingesta';
import { useCommitIngesta } from '@/api/use-commit-ingesta';
import { useCategorias } from '@/api/use-categorias';
import { useResumen } from '@/api/use-resumen';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { validarArchivoWeb } from '@/domain/validar-archivo';
import { derivarMesDominante } from '@/domain/derivar-mes-dominante';
import { resolverCategoriaMerged } from '@/domain/resolver-categoria-merged';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
import { pluralizar } from '@/lib/pluralizar';
import {
  archivoCoincideConIdentidad,
  borrarBorrador,
  cargarBorrador,
  guardarBorrador,
  type BorradorRevision,
} from '@/lib/borrador-revision';
import type { CatalogoEstado } from '@/api/types';

// US-059 PR3: SubirCartola state-machine rewrite — two-phase preview→commit flow.
// - `subiendo` renamed to `committing` (D-01).
// - New states: `preview-listo`, `preview-error`, `committing`, `error`, `exito`.
// - `useCommitIngesta` replaces `useIngesta` for the commit step.
// - `useCategorias` co-fetched on mount; catalog state derived into `CatalogoEstado`.
// - `edits: Map<number, string|null>` tracks the classification overlay (D-03).
// - `pickerGateado`: `error` REMOVED (D-11); `subiendo` renamed to `committing`.
// - `useIngesta`/`postIngesta` remain exported from their own modules (WEB-PRV-11).
//
// Peak-end landing (supersedes PR3's D-01 "exito is transient, auto-navigate
// to /"): the product principle "the monthly verdict comes first" means the
// success moment must land ON the verdict, not skip past it. `exito` is now
// a real landing state — no auto-navigate. It shows the confirmation, the
// {N} movimientos/{banco} count already in memory (no new math), and the
// month's semáforo fetched from `useResumen` (`derivarMesDominante` picks
// WHICH month from the committed rows' fechas — presentation-only, the
// verdict itself is still backend data rendered verbatim, ADR-024). Two
// explicit CTAs replace the old single "Ir al dashboard" link: "Ver resumen
// del mes" (navigates with the derived month) and "Subir otra cartola"
// (resets the flow to idle in place, no navigation).

type EstadoSubida =
  | 'idle'
  | 'previsualizando'
  | 'preview-listo'
  | 'preview-error'
  | 'committing'
  | 'exito'
  | 'error';

// `Record<EstadoSubida, string>` keeps this type-exhaustive — a new
// `EstadoSubida` member fails to compile without a message here.
// `idle` is intentionally empty: the drop zone label already reads
// "Selecciona un archivo (.xlsx o .pdf)", so a status line would just
// repeat it. The live region stays mounted (empty) so later transitions
// are still announced.
const MENSAJE_POR_ESTADO: Record<EstadoSubida, string> = {
  idle: '',
  previsualizando: 'Generando vista previa…',
  // "Revisa y confirma" was dropped from this line (polish pass): the
  // preview's cartola block already carries that instruction ("Revisa las
  // filas y confirma para importar"), so the status stays a status.
  'preview-listo': 'Vista previa lista.',
  'preview-error': 'No se pudo generar la vista previa.',
  committing: 'Subiendo transacciones…',
  exito: 'Importación completada.',
  error: 'No se pudo completar la importación.',
};

// Adjacent honest copy for the disabled commit button in demo mode
// (RegistrarMovimientoForm's MENSAJE_DEMO_REGISTRAR idiom) — distinct from
// DemoUploadNudge's start-of-flow wording, this one explains the specific
// block the user just hit.
const MENSAJE_DEMO_COMMIT =
  'En modo demo, esta vista previa es solo para probar: la importación no se guarda.';

// Detail pass (Operate surface): named once here since no shared bank-list
// constant exists yet in the codebase (checked src/ for other consumers) —
// a single call site doesn't earn a `lib/` extraction (YAGNI).
const BANCOS_SOPORTADOS = 'Banco de Chile, BancoEstado, BCI y Santander';

const KB = 1024;
const MB = KB * 1024;

// Detail pass: file-size readout for the selected-file row. No existing
// helper found under `lib/` (checked for formatearTamano/bytes/KB) — kept
// local and tiny rather than a new shared module for one caller (YAGNI).
function formatearTamano(bytes: number): string {
  const formateador = new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: 1,
  });
  if (bytes >= MB) {
    return `${formateador.format(bytes / MB)} MB`;
  }
  return `${formateador.format(bytes / KB)} KB`;
}

// Detail pass: flow stepper labels, in state order. Pure UI derivation from
// `EstadoSubida` below — no new state, no change to the state machine.
const PASOS_SUBIDA = ['Elegir archivo', 'Revisar', 'Importar'] as const;

/**
 * SubirCartola (US-059 PR3) — preview→review→commit state machine.
 *
 * ```
 * idle
 *  └─(pick + validarArchivoWeb ok)→ previsualizando  [usePreviewIngesta]
 *        ├─(ok)→ preview-listo
 *        │         ├─(Agregar transacciones)→ committing  [useCommitIngesta]
 *        │         │                          ├─(ok)→ exito (landing, verdict fetched [useResumen])
 *        │         │                          └─(fail)→ error (preview+edits PRESERVED, D-11)
 *        │         └─(Descartar)→ navigate /  [both mutations reset, edits cleared]
 *        └─(fail)→ preview-error
 * ```
 *
 * `handleFileChange` and `handleDescartar` are the TWO paths that clear
 * `edits` and reset both mutations (D-02). A commit error does NOT reset
 * the overlay — the user's work is preserved for retry (D-11).
 *
 * `pickerGateado` excludes `error` so the file input re-enables after a
 * commit error, enabling the "pick new file" retry path (D-11, two changes).
 *
 * `esDemo` (CU-07, later revised): renders `<DemoUploadNudge>` here so this
 * component's own test suite covers CU-07 directly. Demo evaluators run the
 * full picker→preview→classify loop like any other user — only the commit
 * step ("Agregar transacciones") stays disabled, paired with inline honest
 * copy explaining why and pointing at the same "Crear cuenta" path.
 *
 * Round-10 critique P1 (discard confirmation): `handleDescartar` used to
 * fire directly off the "Descartar" click — a destructive action that
 * silently wipes a classified review AND the `sessionStorage` draft with
 * zero recourse. Fixed by gating it behind the shared `InlineConfirm`
 * (destructive variant, `confirmandoDescarte` below), matching the
 * trigger/confirm-label split every other destructive control in the app
 * already uses (trigger keeps the specific verb "Descartar"; the dialog's
 * own confirm button reads the generic "Confirmar" —
 * `EliminarIngestaControl`/`ReclasificarCategoriaControl` precedent — so
 * tests and screen readers never see two identically-named "Descartar"
 * buttons at once). The confirm body discloses HONEST numbers — total
 * non-duplicate rows and how many are actually classified right now, via
 * the shared `resolverCategoriaMerged` (D-05 merge rule, same function
 * `PreviewMuestra` uses) — not the raw `filas.length` an earlier pass of
 * this fix mislabeled "clasificados" (fresh-review CRITICAL catch: that
 * count included duplicate AND unclassified rows).
 *
 * Round-10 critique P2 (CRITICAL follow-up): a fresh review caught that
 * `handleDescartarBorrador` — a SECOND destructive action in this same
 * file, wiping the saved `sessionStorage` draft from the recovery notice —
 * still fired unconditionally, contradicting the very "every destructive
 * control confirms" precedent this docblock claimed. Fixed the same way:
 * gated behind `InlineConfirm` (`confirmandoDescarteBorrador` below),
 * disclosing the draft's own edits count (the same number the recovery
 * notice next to it already shows). Both discard paths in this component
 * now share the family, so the precedent claim below is actually true.
 *
 * Gates UNCONDITIONALLY (not only when `edits.size > 0`): every other
 * destructive control in this app confirms regardless of blast radius —
 * `EliminarMovimientoControl` confirms deleting a single row,
 * `ListaIngestas`'s bulk delete confirms even with one ingesta selected,
 * and (per the P2 fix above) BOTH discard paths in this very file now do
 * too. An `edits.size === 0` preview still discards a real uploaded file
 * and a review the user chose to look at, and conditional gating would make
 * "Descartar" sometimes silent and sometimes confirmed — unpredictable for
 * the exact same click. Consistency (one rule, no branching) wins over the
 * marginal savings of skipping a confirm on a technically-untouched preview.
 */
export function SubirCartola({ esDemo }: { readonly esDemo?: boolean }) {
  const navigate = useNavigate();

  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  // D-03: edits overlay — Map keyed by rowIndex; value is categoriaId|null.
  // Presence = "user touched this row"; absence = auto-classify server-side.
  const [edits, setEdits] = useState<Map<number, string | null>>(new Map());
  // Peak-end landing polish: `<input type="file">` is uncontrolled by
  // design (browsers refuse a scripted non-empty `value`) — clearing
  // `archivo`/React state does NOT clear the native "no file chosen" text.
  // `handleDescartar` never needed this: it navigates to `/`, a different
  // route, so the component unmounts and remounts fresh. But
  // `handleSubirOtra` resets IN PLACE (no navigation, by design) — without
  // remounting the input, the browser would keep showing the just-imported
  // filename underneath a "Selecciona un archivo" label that claims nothing
  // is selected. Bumping this key forces React to recreate the DOM node.
  const [selectorArchivoKey, setSelectorArchivoKey] = useState(0);

  // P1 fix (interruption resilience): the review state above lived ONLY in
  // React state — a reload, app-switch kill, or OS tab reclaim silently lost
  // a potentially 100+-row classification pass. `borrador` is the draft
  // loaded from `sessionStorage` on mount, offered back to the user via an
  // inline notice (never a modal — this isn't an interruption-worthy
  // decision). API AUDIT: `useCommitIngesta` re-sends the `File` itself
  // (there is no server-side preview/ingesta id to commit against), so a
  // `File` can never be restored — only `preview` + `edits` are. Recovering
  // is therefore two steps: show the notice (`borrador` set, `archivo` still
  // null) → user clicks "Continuar revisión" (`borradorRecuperando` true) →
  // user re-picks the SAME file (matched by name+size+lastModified in
  // `handleFileChange`) before the review becomes editable again. Picking a
  // DIFFERENT file, or clicking "Descartar borrador", abandons the draft.
  //
  // Lazy `useState` initializer (not an effect): reading sessionStorage is a
  // one-time mount concern, not a subscription to an external system that
  // changes over the component's lifetime — `esDemo` is stable per route, so
  // there is nothing to re-synchronize later. This also avoids the extra
  // render an effect-driven `setState` would cost on every mount.
  const [borrador, setBorrador] = useState<BorradorRevision | null>(() =>
    cargarBorrador(Date.now()),
  );
  const [borradorRecuperando, setBorradorRecuperando] = useState(false);
  // Round-10 P1: gates handleDescartar behind a destructive InlineConfirm.
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  // Round-10 P2 (CRITICAL follow-up): gates handleDescartarBorrador too —
  // see that handler's doc comment for why.
  const [confirmandoDescarteBorrador, setConfirmandoDescarteBorrador] =
    useState(false);
  // Detail pass: drag-over visual state for the drop zone. Ephemeral UI only
  // — never touches the file-processing path, which drop and the input's
  // onChange both funnel through `procesarArchivoSeleccionado` below.
  const [arrastrando, setArrastrando] = useState(false);

  const previewMutation = usePreviewIngesta();
  const commitMutation = useCommitIngesta();

  // D-07: co-fetch catalog on mount; compute CatalogoEstado from query state.
  const catalogoQuery = useCategorias();
  const catalogoEstado: CatalogoEstado = catalogoQuery.isPending
    ? { tag: 'cargando' }
    : catalogoQuery.isError
      ? { tag: 'error' }
      : {
          tag: 'listo',
          grupos: agruparPorBucket(catalogoQuery.data?.categorias ?? []),
        };

  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const exitoRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Round-10 P1: focus-restore target for the discard confirm's Cancelar/Escape.
  const descartarTriggerRef = useRef<HTMLButtonElement>(null);
  // Round-10 P2: same, for the borrador-discard confirm.
  const descartarBorradorTriggerRef = useRef<HTMLButtonElement>(null);
  // Synchronous double-submit guard (money-duplication risk, SEC-01): gates
  // "Agregar transacciones". `commitMutation.isPending`/`disabled` are stale
  // until React re-renders, which doesn't happen between two synchronous clicks.
  const isSubmittingRef = useRef(false);

  // Derived estado — mirrors the original pattern; `committing` replaces `subiendo`.
  const estado: EstadoSubida = commitMutation.isSuccess
    ? 'exito'
    : commitMutation.isPending
      ? 'committing'
      : commitMutation.isError
        ? 'error'
        : previewMutation.isSuccess
          ? 'preview-listo'
          : previewMutation.isPending
            ? 'previsualizando'
            : previewMutation.isError || errorValidacion
              ? 'preview-error'
              : 'idle';

  // D-11: `error` REMOVED from pickerGateado so the picker re-enables after a
  // commit error; `subiendo` renamed to `committing` (two simultaneous changes).
  //
  // Demo (US-060 harden pass, issue #500 UI-honesty follow-up, later revised):
  // `POST /api/ingestas/preview` is UNGATED for demo sessions — it is a
  // read-only dry run that persists nothing — so demo evaluators get the
  // real core loop: upload a cartola, see the auto-detected bank, classify
  // rows. `esDemo` does NOT gate the picker; only `CommitIngestaUseCase`
  // rejects a demo session (`IngestaDemoSoloLecturaError`, 403
  // DEMO_SOLO_LECTURA), and the "Agregar transacciones" button below stays
  // proactively disabled so that 403 is never actually hit.
  const pickerGateado =
    estado === 'previsualizando' ||
    estado === 'preview-listo' ||
    estado === 'committing';

  // Detail pass: pure derivation for the flow stepper — no new state, mirrors
  // `estado` exactly like `pickerGateado` above. `committing` already sits on
  // step 2 (Importar): the import is running, so the stepper must not keep
  // "Revisar" lit while the button says "Subiendo…". `error` maps back to
  // step 1 (Revisar) since the preview+edits are PRESERVED on a commit error
  // (D-11) — the user is still reviewing, not back at file-picking.
  const pasoActivo =
    estado === 'idle' ||
    estado === 'previsualizando' ||
    estado === 'preview-error'
      ? 0
      : estado === 'committing' || estado === 'exito'
        ? 2
        : 1;

  // Peak-end landing: WHICH month's verdict to show is a presentation
  // decision (never money/classification math, ADR-024) — derived from the
  // just-persisted rows' fechas already in memory. `undefined` when there's
  // nothing to derive from (e.g. every committed row turned out to be a
  // commit-time duplicate, D-13) — the landing then simply skips the
  // verdict block (mesDominante-gated below) and shows count + CTAs only.
  const mesDominante = commitMutation.data
    ? derivarMesDominante(commitMutation.data.transacciones.map((t) => t.fecha))
    : undefined;

  // Only fetches once commit succeeded AND a month could be derived — never
  // on idle/preview/committing renders, and never speculatively before
  // there's a month to ask about.
  const resumenQuery = useResumen(mesDominante, {
    enabled: estado === 'exito' && mesDominante !== undefined,
  });

  useEffect(() => {
    if (estado === 'preview-error' || estado === 'error') {
      errorRef.current?.focus();
    } else if (estado === 'preview-listo') {
      previewHeadingRef.current?.focus();
    } else if (estado === 'exito') {
      exitoRef.current?.focus();
    }
  }, [estado]);

  // Draft resilience: "Continuar revisión" unmounts its own button (the
  // notice swaps to the re-pick prompt below) — without an explicit target,
  // the browser drops focus to <body> and a keyboard/screen-reader user
  // loses their place. The very next required action is re-picking the
  // file, so focus goes straight to that input (same reflex as the
  // preview/error/exito transitions above).
  useEffect(() => {
    if (borradorRecuperando) {
      fileInputRef.current?.focus();
    }
  }, [borradorRecuperando]);

  // Write-through persistence (no debounce needed at this scale, per spec):
  // every edit and every fresh preview response re-saves the draft. Runs
  // through `committing`/`error` too (D-11 already preserves the overlay
  // in-memory for retry; this is the same guarantee surviving a reload).
  // Stops mattering once `exito` clears the draft explicitly (below) — this
  // effect's own deps don't change across that transition, so it doesn't
  // re-save afterwards.
  useEffect(() => {
    if (!archivo || !previewMutation.data) return;
    guardarBorrador({
      archivo,
      preview: previewMutation.data,
      edits,
      ahora: Date.now(),
    });
  }, [archivo, previewMutation.data, edits]);

  // D-02: clears both mutations + edits before firing preview. Draft
  // resilience: a matching re-pick during `borradorRecuperando` restores
  // `edits` from the draft instead of the usual blank Map; any other
  // selection (including cancelling the picker) abandons the draft — the
  // notice never survives a new file selection.
  //
  // Detail pass: extracted from the input's own `onChange` handler,
  // unchanged, so the drop zone's `onDrop` can funnel through the EXACT same
  // path instead of a second, drifting copy of this logic.
  function procesarArchivoSeleccionado(seleccionado: File | undefined) {
    previewMutation.reset();
    commitMutation.reset();
    isSubmittingRef.current = false;

    if (!seleccionado) {
      setArchivo(null);
      setErrorValidacion(null);
      setEdits(new Map());
      return;
    }

    let edicionesRestauradas = new Map<number, string | null>();
    if (
      borradorRecuperando &&
      borrador !== null &&
      archivoCoincideConIdentidad(seleccionado, borrador.archivo)
    ) {
      edicionesRestauradas = new Map(borrador.edits);
    }
    setEdits(edicionesRestauradas);
    setBorrador(null);
    setBorradorRecuperando(false);

    const resultado = validarArchivoWeb(seleccionado);
    if (resultado.tag === 'rechazado') {
      setArchivo(null);
      setErrorValidacion(resultado.message);
      return;
    }

    setArchivo(seleccionado);
    setErrorValidacion(null);
    previewMutation.mutate(seleccionado);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    procesarArchivoSeleccionado(event.target.files?.[0]);
  }

  // Detail pass: drag & drop over the same zone the label/input already
  // live in. No new gating rule — `pickerGateado` (unchanged above) is the
  // single source of truth; drag/drop just reads it instead of relying on
  // the native `disabled` attribute, which the browser doesn't consult for
  // drop events.
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (pickerGateado) return;
    setArrastrando(true);
  }

  function handleDragLeave() {
    setArrastrando(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setArrastrando(false);
    if (pickerGateado) return;
    procesarArchivoSeleccionado(event.dataTransfer.files?.[0]);
  }

  // D-03: edits update on every onEditChange call so FilaRevision receives the
  // updated categoriaId prop (un-assignment depends on this).
  function handleEditChange(rowIndex: number, categoriaId: string | null) {
    setEdits((prev) => new Map(prev).set(rowIndex, categoriaId));
  }

  // Peak-end landing: commit success no longer auto-navigates (supersedes
  // PR3's D-05/D-01) — the exito state IS the destination now. Only
  // `onSettled` survives here to release the double-submit guard.
  function handleConfirmar() {
    // Demo guard inside the handler (RegistrarMovimientoForm's handleSubmit
    // idiom): the disabled Button is the visible gate, but a forced/synthetic
    // invocation bypassing it must still never reach the 403 commit.
    if (
      esDemo ||
      !archivo ||
      commitMutation.isPending ||
      isSubmittingRef.current
    ) {
      return;
    }
    isSubmittingRef.current = true;
    commitMutation.mutate(
      {
        file: archivo,
        // D-03: sparse serialization — only touched rows, edit-insertion order.
        edits: Array.from(edits, ([rowIndex, categoriaId]) => ({
          rowIndex,
          categoriaId,
        })),
      },
      {
        onSuccess: () => {
          borrarBorrador();
        },
        onSettled: () => {
          isSubmittingRef.current = false;
        },
      },
    );
  }

  // Draft resilience: explicit opt-out from the recovery notice. Round-10 P2
  // (CRITICAL follow-up): the fresh review caught this handler contradicting
  // the "every other destructive control confirms unconditionally" claim
  // guarding `handleDescartar` above — it fired straight off the click, no
  // gate, despite wiping a saved draft. Now shares the same InlineConfirm
  // family (`confirmandoDescarteBorrador` below), so the claim is actually
  // true across the whole file.
  function handleDescartarBorrador() {
    setConfirmandoDescarteBorrador(false);
    borrarBorrador();
    setBorrador(null);
    setBorradorRecuperando(false);
  }

  // Round-10 P2: "Descartar borrador" click opens the confirm instead of
  // discarding immediately.
  function handleAbrirConfirmacionDescarteBorrador() {
    setConfirmandoDescarteBorrador(true);
  }

  // Round-10 P2: Cancelar/Escape — leaves the draft untouched, restores
  // focus to the "Descartar borrador" trigger.
  function handleCancelarConfirmacionDescarteBorrador() {
    setConfirmandoDescarteBorrador(false);
    descartarBorradorTriggerRef.current?.focus();
  }

  // D-02: handleDescartar resets both mutations + edits, then navigates /.
  // Round-10 P1: only ever invoked from the InlineConfirm's onConfirm now —
  // the "Descartar" click itself just opens that dialog (see
  // `handleAbrirConfirmacionDescarte` below).
  function handleDescartar() {
    setConfirmandoDescarte(false);
    setArchivo(null);
    setErrorValidacion(null);
    setEdits(new Map());
    isSubmittingRef.current = false;
    previewMutation.reset();
    commitMutation.reset();
    borrarBorrador();
    void navigate({ to: '/' });
  }

  // Round-10 P1: "Descartar" click opens the confirm instead of discarding.
  function handleAbrirConfirmacionDescarte() {
    setConfirmandoDescarte(true);
  }

  // Round-10 P1: Cancelar/Escape — leaves the review untouched, restores
  // focus to the "Descartar" trigger (same idiom as `EliminarMovimientoControl`).
  function handleCancelarConfirmacionDescarte() {
    setConfirmandoDescarte(false);
    descartarTriggerRef.current?.focus();
  }

  // Peak-end landing primary CTA: navigate to the dashboard with the
  // derived month selected (same `periodo` search param `routes/index.tsx`
  // already owns) so the user lands on the month they just imported, not
  // whatever month the dashboard would otherwise default to. No
  // `mesDominante` (nothing to derive from) → navigate without a `periodo`
  // override; the dashboard falls back to its own current-month default.
  function handleVerResumen() {
    void navigate({
      to: '/',
      search: mesDominante ? { periodo: mesDominante } : {},
    });
  }

  // Peak-end landing secondary CTA: reset the flow to idle IN PLACE — no
  // navigation, unlike handleDescartar. Same reset shape (both mutations +
  // edits + the double-submit guard) so a second upload starts clean.
  function handleSubirOtra() {
    setArchivo(null);
    setErrorValidacion(null);
    setEdits(new Map());
    isSubmittingRef.current = false;
    previewMutation.reset();
    commitMutation.reset();
    borrarBorrador();
    setSelectorArchivoKey((k) => k + 1);
  }

  const mensajeError =
    errorValidacion ??
    previewMutation.error?.message ??
    commitMutation.error?.message ??
    null;
  const mensajeEstado: string = MENSAJE_POR_ESTADO[estado];

  // Show the review section when preview succeeded and we're not in exito.
  const mostrarPreview =
    previewMutation.data !== undefined &&
    estado !== 'preview-error' &&
    estado !== 'exito';

  // Draft resilience: only relevant before a file is picked in THIS session
  // — once `archivo` is set, the notice's job is done (`handleFileChange`
  // already cleared `borrador`).
  const mostrarNoticiaBorrador = borrador !== null && archivo === null;

  // Fresh-review CRITICAL follow-up (round-10 P1): the discard confirm used
  // to disclose `previewMutation.data.filas.length` — the RAW row count,
  // wrongly including duplicate AND unclassified rows under the label
  // "clasificados". Honest version: `total` counts only non-duplicate rows;
  // `clasificadas` counts only rows with an EFFECTIVE categoría right now
  // (D-05 merge rule via `resolverCategoriaMerged`, the SAME function
  // `PreviewMuestra` uses for its own progress readout — one rule, not two
  // that can drift). Degrades to a plain total when nothing is classified
  // (`clasificadas === 0`) instead of a misleading "(0 ya clasificados)".
  const filasNoDuplicadasDescarte =
    previewMutation.data?.filas.filter((f) => !f.esDuplicado) ?? [];
  const filasClasificadasDescarte = filasNoDuplicadasDescarte.filter(
    (f) => resolverCategoriaMerged(f, edits) !== null,
  ).length;
  const textoConfirmacionDescarte = `Se descartará la revisión de ${pluralizar(
    filasNoDuplicadasDescarte.length,
    'movimiento',
    'movimientos',
  )}${
    filasClasificadasDescarte > 0
      ? ` (${pluralizar(filasClasificadasDescarte, 'ya clasificado', 'ya clasificados')})`
      : ''
  }. Se perderá el archivo seleccionado; esta acción no se puede deshacer.`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Subir cartola
      </h1>

      {/* Detail pass: flow stepper — pure derivation from `estado` via
          `pasoActivo`, no new state. */}
      <ol
        aria-label="Progreso de la subida"
        className="flex flex-wrap gap-x-6 gap-y-1 text-sm"
      >
        {PASOS_SUBIDA.map((paso, indice) => {
          const activo = indice === pasoActivo;
          const completado = indice < pasoActivo;
          return (
            <li
              key={paso}
              aria-current={activo ? 'step' : undefined}
              className={`flex items-center gap-2 ${
                activo
                  ? 'font-semibold text-foreground'
                  : completado
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-5 place-items-center rounded-full border text-xs ${
                  activo || completado
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border'
                }`}
              >
                {indice + 1}
              </span>
              {paso}
            </li>
          );
        })}
      </ol>

      <DemoUploadNudge esDemo={esDemo} />

      {mostrarNoticiaBorrador && borrador && !borradorRecuperando && (
        <>
          <div
            role="status"
            aria-label="Borrador de revisión sin terminar"
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground"
          >
            <p>
              Encontramos una revisión sin terminar de{' '}
              <strong>{borrador.archivo.nombre}</strong> (
              {borrador.edits.length} filas clasificadas). ¿Continuar donde
              quedaste?
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                size="sm"
                onClick={() => setBorradorRecuperando(true)}
              >
                Continuar revisión
              </Button>
              <Button
                ref={descartarBorradorTriggerRef}
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAbrirConfirmacionDescarteBorrador}
              >
                Descartar borrador
              </Button>
            </div>
          </div>
          {/* Round-10 critique P2 (CRITICAL follow-up): destructive
              InlineConfirm gate for the borrador discard too — rendered as
              a SIBLING of the role="status" notice above, not nested inside
              it, so a mounted `alertdialog` never lives inside a polite
              live region. */}
          {confirmandoDescarteBorrador && (
            <InlineConfirm
              title="Confirmar descarte del borrador"
              confirmLabel="Confirmar"
              destructive
              onConfirm={handleDescartarBorrador}
              onCancel={handleCancelarConfirmacionDescarteBorrador}
              className="gap-2 p-3 text-sm"
            >
              <p>
                Se descartará el borrador de {borrador.archivo.nombre} con{' '}
                {pluralizar(
                  borrador.edits.length,
                  'fila clasificada',
                  'filas clasificadas',
                )}
                . Esta acción no se puede deshacer.
              </p>
            </InlineConfirm>
          )}
        </>
      )}

      {mostrarNoticiaBorrador && borrador && borradorRecuperando && (
        <div
          role="status"
          aria-label="Retomando borrador de revisión"
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm text-foreground"
        >
          <p>
            Para continuar, selecciona nuevamente{' '}
            <strong>{borrador.archivo.nombre}</strong> en el campo de abajo. No
            guardamos el archivo — solo tus clasificaciones.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Detail pass: real drop zone — the label/input pair is unchanged
            (same htmlFor/id association, same accessible name), just visually
            reframed. The input becomes `sr-only`: still focusable, still
            labelled, `userEvent.upload` still targets it directly. */}
        <div
          data-arrastrando={arrastrando}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30 data-[arrastrando=true]:border-primary data-[arrastrando=true]:bg-accent ${
            pickerGateado ? 'opacity-50' : ''
          }`}
        >
          <Upload
            aria-hidden="true"
            className="mx-auto size-6 text-muted-foreground"
          />
          <label
            htmlFor="cartola-file"
            className="mt-2 block cursor-pointer text-sm font-medium text-foreground"
          >
            Selecciona un archivo (.xlsx o .pdf)
          </label>
          <input
            key={selectorArchivoKey}
            ref={fileInputRef}
            id="cartola-file"
            type="file"
            accept=".xlsx,.pdf"
            onChange={handleFileChange}
            disabled={pickerGateado}
            className="sr-only"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Arrastra el archivo aquí o haz clic para elegirlo.
          </p>
          <p className="text-xs text-muted-foreground">
            Bancos soportados: {BANCOS_SOPORTADOS}.
          </p>
        </div>

        {/* Detail pass: compact selected-file readout — only while there's a
            file to show and the flow hasn't landed on the success state
            (which has its own "N movimientos importados de {banco}" line). */}
        {archivo && estado !== 'exito' && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <FileText
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {archivo.name}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {formatearTamano(archivo.size)}
            </span>
          </div>
        )}
      </div>

      {/* Polish pass: the status line used to be bare muted text, visually
          indistinguishable from the helper copy around it. It now leads with
          a state glyph (spinner while working, check on a completed step,
          alert on failure — all `aria-hidden`, the text is the announcement)
          and reads at medium weight in `text-foreground` once a step lands.
          The region itself is unchanged: same `role`/`aria-live`/`aria-label`,
          always mounted (empty in `idle`) so the first transition announces. */}
      <div
        role="status"
        aria-live="polite"
        aria-label="Estado de la subida"
        className={`flex min-h-5 items-center gap-2 text-sm ${
          estado === 'preview-listo' || estado === 'exito'
            ? 'font-medium text-foreground'
            : 'text-muted-foreground'
        }`}
      >
        {(estado === 'previsualizando' || estado === 'committing') && (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 shrink-0 motion-safe:animate-spin"
          />
        )}
        {(estado === 'preview-listo' || estado === 'exito') && (
          <CircleCheck
            aria-hidden="true"
            className="size-4 shrink-0 text-semaforo-verde-foreground"
          />
        )}
        {(estado === 'preview-error' || estado === 'error') && (
          <CircleAlert
            aria-hidden="true"
            className="size-4 shrink-0 text-destructive"
          />
        )}
        {mensajeEstado}
      </div>

      {(estado === 'preview-error' || estado === 'error') && mensajeError && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {mensajeError}
        </p>
      )}

      {/* Detail pass: preview skeleton — purely visual, aria-hidden; the
          `role="status"` line above already announces "Generando vista
          previa…" for screen readers. No `Skeleton` component exists yet
          under `components/ui/` (checked), so this is inline — a single
          caller doesn't earn a new shared component (YAGNI). */}
      {estado === 'previsualizando' && (
        <div
          aria-hidden="true"
          data-skeleton-preview
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 motion-safe:animate-pulse"
        >
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-3 w-64 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
        </div>
      )}

      {mostrarPreview && previewMutation.data && (
        <section
          aria-labelledby="preview-listo-heading"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <h2
            id="preview-listo-heading"
            ref={previewHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Vista previa
          </h2>
          <PreviewMuestra
            banco={previewMutation.data.banco}
            filas={previewMutation.data.filas}
            resumen={previewMutation.data.resumen}
            edits={edits}
            onEditChange={handleEditChange}
            catalogo={catalogoEstado}
          />
          {/* Demo (RegistrarMovimientoForm's MENSAJE_DEMO_REGISTRAR idiom):
              a demo session reaches preview-listo for real now — this note
              explains why "Agregar transacciones" stays disabled right where
              the user hits it, instead of only at the top-of-flow nudge,
              which can have scrolled out of view after classifying rows. */}
          {esDemo && (
            <p
              id="demo-commit-nota"
              role="note"
              className="text-sm text-muted-foreground"
            >
              {MENSAJE_DEMO_COMMIT}{' '}
              <a
                href="https://moneydiary.cl"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Crea una cuenta real
              </a>{' '}
              para guardar tus movimientos.
            </p>
          )}

          <div className="flex gap-3">
            {/* Label swaps to "Subiendo…" while committing (impeccable
                critique P2: in-button async feedback) — matches
                MENSAJE_POR_ESTADO.committing's own "Subiendo transacciones…"
                wording already shown in the status region above. */}
            {/* `esDemo` stays as a belt-and-suspenders client-side gate: the
                server rejects a demo commit with `IngestaDemoSoloLecturaError`
                (403 DEMO_SOLO_LECTURA) — this disables the control so that
                rejection is never actually hit. */}
            <Button
              type="button"
              onClick={handleConfirmar}
              disabled={esDemo || estado === 'committing'}
              aria-describedby={esDemo ? 'demo-commit-nota' : undefined}
            >
              {estado === 'committing' ? 'Subiendo…' : 'Agregar transacciones'}
            </Button>
            <Button
              ref={descartarTriggerRef}
              type="button"
              variant="ghost"
              onClick={handleAbrirConfirmacionDescarte}
              disabled={estado === 'committing'}
            >
              Descartar
            </Button>
          </div>
          {/* Round-10 critique P1: destructive InlineConfirm gate — see the
              component docblock for why this gates unconditionally. */}
          {confirmandoDescarte && (
            <InlineConfirm
              title="Confirmar descarte"
              confirmLabel="Confirmar"
              destructive
              onConfirm={handleDescartar}
              onCancel={handleCancelarConfirmacionDescarte}
              className="gap-2 p-3 text-sm"
            >
              <p>{textoConfirmacionDescarte}</p>
            </InlineConfirm>
          )}
        </section>
      )}

      {/* Peak-end landing (supersedes PR3's D-01 transient render): the
          success moment lands on the verdict the import just produced,
          never skips past it. `motion-safe:` already gates the entrance on
          prefers-reduced-motion — no separate media query needed. */}
      {estado === 'exito' && commitMutation.data && (
        <section
          aria-labelledby="exito-heading"
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 motion-safe:animate-[exito-in_320ms_ease-out]"
        >
          <h2
            id="exito-heading"
            ref={exitoRef}
            tabIndex={-1}
            className="text-lg font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <CircleCheck
              aria-hidden="true"
              className="mr-2 inline-block size-5 align-[-3px] text-semaforo-verde-foreground"
            />
            Importación completada
          </h2>
          <p className="text-sm text-muted-foreground">
            {commitMutation.data.totalTransacciones} movimientos importados de{' '}
            {previewMutation.data?.banco}.
          </p>

          {/* The verdict never computes client-side (ADR-024) — it's the
              backend's GET /api/resumen, rendered verbatim. A load failure
              here must never make the SUCCESSFUL import look broken, so on
              error this block simply disappears — count + CTAs still stand. */}
          {mesDominante &&
            (resumenQuery.isPending || resumenQuery.isSuccess) && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">
                  Así queda tu mes:
                </p>
                {resumenQuery.isPending && (
                  <Loading compact message="Cargando tu resumen…" />
                )}
                {resumenQuery.isSuccess && resumenQuery.data && (
                  <div className="flex items-center gap-2">
                    <SemaforoBadge
                      estadoSemaforo={resumenQuery.data.estadoGlobal}
                      size={28}
                    />
                    <span className="text-sm text-muted-foreground">
                      Semáforo:{' '}
                      {
                        resolverEstiloSemaforo(resumenQuery.data.estadoGlobal)
                          .label
                      }
                    </span>
                  </div>
                )}
              </div>
            )}

          <div className="flex gap-3">
            <Button type="button" onClick={handleVerResumen}>
              Ver resumen del mes
            </Button>
            <Button type="button" variant="ghost" onClick={handleSubirOtra}>
              Subir otra cartola
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
