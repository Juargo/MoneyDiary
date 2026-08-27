import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from './ui/button';
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
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
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
const MENSAJE_POR_ESTADO: Record<EstadoSubida, string> = {
  idle: 'Selecciona un archivo .xlsx o .pdf para subir.',
  previsualizando: 'Generando vista previa…',
  'preview-listo': 'Vista previa lista. Revisá y confirmá.',
  'preview-error': 'No se pudo generar la vista previa.',
  committing: 'Subiendo transacciones…',
  exito: 'Importación completada.',
  error: 'No se pudo completar la importación.',
};

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
 * `esDemo` (CU-07): renders `<DemoUploadNudge>` here so this component's
 * own test suite covers CU-07 directly.
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
  const pickerGateado =
    estado === 'previsualizando' ||
    estado === 'preview-listo' ||
    estado === 'committing';

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

  // D-02: handleFileChange clears both mutations + edits before firing preview.
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const seleccionado = event.target.files?.[0];
    previewMutation.reset();
    commitMutation.reset();
    setEdits(new Map());
    isSubmittingRef.current = false;
    if (!seleccionado) {
      setArchivo(null);
      setErrorValidacion(null);
      return;
    }

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

  // D-03: edits update on every onEditChange call so FilaRevision receives the
  // updated categoriaId prop (un-assignment depends on this).
  function handleEditChange(rowIndex: number, categoriaId: string | null) {
    setEdits((prev) => new Map(prev).set(rowIndex, categoriaId));
  }

  // Peak-end landing: commit success no longer auto-navigates (supersedes
  // PR3's D-05/D-01) — the exito state IS the destination now. Only
  // `onSettled` survives here to release the double-submit guard.
  function handleConfirmar() {
    if (!archivo || commitMutation.isPending || isSubmittingRef.current) {
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
        onSettled: () => {
          isSubmittingRef.current = false;
        },
      },
    );
  }

  // D-02: handleDescartar resets both mutations + edits, then navigates /.
  function handleDescartar() {
    setArchivo(null);
    setErrorValidacion(null);
    setEdits(new Map());
    isSubmittingRef.current = false;
    previewMutation.reset();
    commitMutation.reset();
    void navigate({ to: '/' });
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

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-foreground">Subir cartola</h1>

      <DemoUploadNudge esDemo={esDemo} />

      <div className="flex flex-col gap-3">
        <label
          htmlFor="cartola-file"
          className="text-sm font-medium text-muted-foreground"
        >
          Selecciona un archivo (.xlsx o .pdf)
        </label>
        <input
          key={selectorArchivoKey}
          id="cartola-file"
          type="file"
          accept=".xlsx,.pdf"
          onChange={handleFileChange}
          disabled={pickerGateado}
          className="text-sm text-muted-foreground"
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-label="Estado de la subida"
        className="text-sm text-muted-foreground"
      >
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

      {mostrarPreview && previewMutation.data && (
        <section
          aria-labelledby="preview-listo-heading"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <h2
            id="preview-listo-heading"
            ref={previewHeadingRef}
            tabIndex={-1}
            className="text-base font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={handleConfirmar}
              disabled={estado === 'committing'}
            >
              Agregar transacciones
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDescartar}
              disabled={estado === 'committing'}
            >
              Descartar
            </Button>
          </div>
        </section>
      )}

      {/* Peak-end landing (supersedes PR3's D-01 transient render): the
          success moment lands on the verdict the import just produced,
          never skips past it. `motion-safe:` already gates the entrance on
          prefers-reduced-motion — no separate media query needed. */}
      {estado === 'exito' && commitMutation.data && (
        <section
          aria-labelledby="exito-heading"
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 motion-safe:animate-[exito-in_320ms_ease-out]"
        >
          <h2
            id="exito-heading"
            ref={exitoRef}
            tabIndex={-1}
            className="text-base font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
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
            <Button type="button" variant="outline" onClick={handleSubirOtra}>
              Subir otra cartola
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
