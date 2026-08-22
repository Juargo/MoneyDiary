import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from './ui/button';
import { DemoUploadNudge } from './DemoUploadNudge';
import { PreviewMuestra } from './PreviewMuestra';
import { usePreviewIngesta } from '@/api/use-preview-ingesta';
import { useCommitIngesta } from '@/api/use-commit-ingesta';
import { useCategorias } from '@/api/use-categorias';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { validarArchivoWeb } from '@/domain/validar-archivo';
import type { CatalogoEstado } from '@/api/types';

// US-059 PR3: SubirCartola state-machine rewrite — two-phase preview→commit flow.
// - `subiendo` renamed to `committing` (D-01).
// - New states: `preview-listo`, `preview-error`, `committing`, `error`, `exito`.
// - `useCommitIngesta` replaces `useIngesta` for the commit step.
// - `useCategorias` co-fetched on mount; catalog state derived into `CatalogoEstado`.
// - `edits: Map<number, string|null>` tracks the classification overlay (D-03).
// - `pickerGateado`: `error` REMOVED (D-11); `subiendo` renamed to `committing`.
// - `exito`: minimal render — "Importación completada" + "Ir al dashboard" link (D-01).
// - `useIngesta`/`postIngesta` remain exported from their own modules (WEB-PRV-11).

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
 *        │         │                          ├─(ok)→ exito (transient → navigate /)
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

  // D-05: navigate wired at the call site (hook stays router-agnostic).
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
        onSuccess: () => {
          void navigate({ to: '/' });
        },
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

      {/* D-01: exito is a transient state — minimal render so a slow/failed
          navigate never strands the user on a blank screen. */}
      {estado === 'exito' && (
        <section
          aria-labelledby="exito-heading"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
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
            Las transacciones fueron importadas correctamente.
          </p>
          {/* Plain <a> is intentional here: this is a safety fallback shown only
              when navigate({to:'/'}) is slow or fails. A real <Link> would crash
              in test environments without a RouterProvider (see D-01 design note). */}
          <a
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ir al dashboard
          </a>
        </section>
      )}
    </div>
  );
}
