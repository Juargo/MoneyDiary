import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from './ui/button';
import { DemoUploadNudge } from './DemoUploadNudge';
// STUB (US-059 PR2): PreviewMuestra props rewritten to canonical shape in PR2;
// SubirCartola call site updated as a non-behavioral stub (tsc compliance).
// The full state-machine rewire (useCommitIngesta, edits Map, handleDescartar
// navigation) lands in PR3 as the single behavioral flip.
import { PreviewMuestra } from './PreviewMuestra';
import { useIngesta } from '@/api/use-ingesta';
import { usePreviewIngesta } from '@/api/use-preview-ingesta';
import { validarArchivoWeb } from '@/domain/validar-archivo';
import { formatearMontoCLP } from '@/domain/formatear-monto';

const CANTIDAD_PREVIEW_TRANSACCIONES = 5;

type EstadoSubida =
  | 'idle'
  | 'previsualizando'
  | 'preview-listo'
  | 'preview-error'
  | 'subiendo'
  | 'exito'
  | 'error';

// The aria-live region announces the STATE transition (generic wording per
// state) — it deliberately does NOT repeat `mensajeError` verbatim, so the
// specific backend/validation message (CU-04) lives in exactly one place
// (the `role="alert"` paragraph below). `Record<EstadoSubida, string>` keeps
// this type-exhaustive — a new `EstadoSubida` member fails to compile
// without a message here.
const MENSAJE_POR_ESTADO: Record<EstadoSubida, string> = {
  idle: 'Selecciona un archivo .xlsx o .pdf para subir.',
  previsualizando: 'Generando vista previa…',
  'preview-listo': 'Vista previa lista. Revisa y confirma.',
  'preview-error': 'No se pudo generar la vista previa.',
  subiendo: 'Subiendo archivo…',
  exito: 'Archivo subido correctamente.',
  error: 'No se pudo completar la subida.',
};

/**
 * SubirCartola (`upload-cartola-ui` US-031/US-032 + `us-003-vista-previa`
 * Slice 2, design.md §9) — two-phase preview-before-confirm state machine:
 *
 * ```
 * idle
 *   └─(pick + validarArchivoWeb ok)→ previsualizando  [usePreviewIngesta]
 *         ├─(ok)→ preview-listo
 *         │         ├─(Confirmar)→ subiendo  [useIngesta.mutate(archivo)]
 *         │         │                 ├─(ok)→ exito
 *         │         │                 └─(fail)→ error
 *         │         └─(Cancelar)→ idle  (release file, reset both mutations)
 *         └─(fail)→ preview-error
 * ```
 *
 * `validarArchivoWeb` (client-side gate, unchanged from US-031/US-032) still
 * runs FIRST, synchronously, the moment a file is selected — a rejected
 * extension/size never reaches `usePreviewIngesta.mutate`.
 *
 * **"Same file on confirm" soft guarantee (design §9.2):** once
 * `preview-listo`, the `<input type="file">` is gated (`disabled`) — the
 * user's only moves are Confirmar (re-upload the held `File`) or Cancelar
 * (release it, re-enable the picker). They cannot swap the file underneath a
 * shown preview. This is a UX-consistency guard, not a data-integrity one —
 * `POST /api/ingestas` still fully re-validates whatever bytes it receives.
 *
 * **CA-04 at the UI layer:** Cancelar NEVER calls `useIngesta.mutate` —
 * nothing is uploaded/persisted unless the user explicitly confirms.
 *
 * The row-count selector (10/25/50, CA-01/PREV-06) and sample rendering live
 * in `PreviewMuestra` (SRP) — this component only owns the state machine and
 * the confirm-phase result panel (reused verbatim from the pre-US-003
 * design, since confirm's DTO/UX is unchanged, PREV-05).
 *
 * A11y (CU-05, ADR-018): the file `<input>` has an associated `<label>`; an
 * `aria-live="polite"` region announces every state transition; on
 * `preview-listo` focus moves to the preview heading, on `exito` to the
 * result heading, on `preview-error`/`error` to the error text — all carry
 * `tabIndex={-1}` so they're programmatically focusable without being in the
 * natural tab order.
 *
 * `esDemo` (CU-07, design.md Decision 6): renders `<DemoUploadNudge>` HERE
 * (not in the route) so this component's own test suite covers CU-07
 * directly.
 */
export function SubirCartola({ esDemo }: { readonly esDemo?: boolean }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const previewMutation = usePreviewIngesta();
  const confirmMutation = useIngesta();

  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Synchronous double-submit guard (money-duplication risk, SEC-01): now
  // gates Confirmar (was the single submit button pre-US-003). Same
  // reasoning as the original: `confirmMutation.isPending`/`disabled` are
  // stale until React re-renders, which doesn't happen between two
  // synchronous clicks fired before paint.
  const isSubmittingRef = useRef(false);

  const estado: EstadoSubida = confirmMutation.isSuccess
    ? 'exito'
    : confirmMutation.isPending
      ? 'subiendo'
      : confirmMutation.isError
        ? 'error'
        : previewMutation.isSuccess
          ? 'preview-listo'
          : previewMutation.isPending
            ? 'previsualizando'
            : previewMutation.isError || errorValidacion
              ? 'preview-error'
              : 'idle';

  // FIX 1 (review, BLOCKER): 'exito' is deliberately NOT gated — otherwise a
  // successful confirm is a dead end (no control resets to 'idle'). Picking
  // a new file from 'exito' is a valid transition: `handleFileChange` already
  // resets both mutations before firing a fresh preview.
  const pickerGateado =
    estado === 'previsualizando' ||
    estado === 'preview-listo' ||
    estado === 'subiendo' ||
    estado === 'error';

  useEffect(() => {
    if (estado === 'exito') {
      headingRef.current?.focus();
    } else if (estado === 'preview-error' || estado === 'error') {
      errorRef.current?.focus();
    } else if (estado === 'preview-listo') {
      previewHeadingRef.current?.focus();
    }
  }, [estado]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const seleccionado = event.target.files?.[0];
    previewMutation.reset();
    confirmMutation.reset();
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
    // FIX 5 (review, cheap): no `isSubmittingRef` guard here (unlike
    // `handleConfirmar`) — safe because the preview endpoint (PREV-02) is
    // read-only/non-persistent, so a duplicate preview call has no side
    // effect worth guarding against.
    previewMutation.mutate(seleccionado);
  }

  function handleConfirmar() {
    if (!archivo || confirmMutation.isPending || isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    confirmMutation.mutate(archivo, {
      onSettled: () => {
        isSubmittingRef.current = false;
      },
    });
  }

  function handleCancelar() {
    setArchivo(null);
    setErrorValidacion(null);
    isSubmittingRef.current = false;
    previewMutation.reset();
    confirmMutation.reset();
  }

  const mensajeError =
    errorValidacion ??
    previewMutation.error?.message ??
    confirmMutation.error?.message ??
    null;
  const mensajeEstado: string = MENSAJE_POR_ESTADO[estado];
  // FIX 2 (review, BLOCKER a11y): `previewMutation.data` stays populated
  // after a successful confirm (never cleared on 'exito') — exclude 'exito'
  // explicitly so the "Vista previa" section doesn't stay mounted under the
  // "Cartola subida" success panel (duplicate headings/table for AT).
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
          {/* STUB (US-059 PR2): passes new canonical props — edits/catalog
              wiring (D-02/D-07) and handleDescartar navigation (D-02) land in
              PR3 as the single behavioral flip (state machine rewrite). The
              legacy confirm flow (useIngesta, Confirmar/Cancelar) is unchanged
              in this PR. */}
          <PreviewMuestra
            banco={previewMutation.data.banco}
            filas={previewMutation.data.filas}
            resumen={previewMutation.data.resumen}
            edits={new Map()}
            onEditChange={() => undefined}
            catalogo={{ tag: 'cargando' }}
          />
          <div className="flex gap-3">
            {/* FIX 2 follow-up: this panel is only mounted when `mostrarPreview`
                is true, which already excludes 'exito' — so `estado === 'exito'`
                here would be unreachable/redundant (and TS's aliased-condition
                narrowing flags it as a type error). Only 'subiendo' needs the
                disabled guard now. */}
            <Button
              type="button"
              onClick={handleConfirmar}
              disabled={estado === 'subiendo'}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelar}
              disabled={estado === 'subiendo'}
            >
              Cancelar
            </Button>
          </div>
        </section>
      )}

      {estado === 'exito' && confirmMutation.data && (
        <section
          aria-labelledby="resultado-subida-heading"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <h2
            id="resultado-subida-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Cartola subida
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <dt className="font-medium">Banco</dt>
            <dd>{confirmMutation.data.banco}</dd>
            <dt className="font-medium">Tipo de cuenta</dt>
            <dd>{confirmMutation.data.tipoCuenta}</dd>
            <dt className="font-medium">Número de cuenta</dt>
            <dd>{confirmMutation.data.numeroCuenta}</dd>
            <dt className="font-medium">Transacciones</dt>
            <dd>{confirmMutation.data.totalTransacciones}</dd>
          </dl>
          {confirmMutation.data.duplicadosOmitidos > 0 && (
            <p
              role="status"
              aria-label="Aviso de duplicados omitidos"
              className="rounded-lg bg-ingreso px-3 py-2 text-sm font-medium text-ingreso-foreground"
            >
              {`Se importaron ${confirmMutation.data.totalTransacciones}, se omitieron ${confirmMutation.data.duplicadosOmitidos} duplicados`}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {confirmMutation.data.transacciones
              .slice(0, CANTIDAD_PREVIEW_TRANSACCIONES)
              .map((transaccion, indice) => (
                // El DTO no trae `id` (a diferencia de `DetalleBucketTransaccionDto`) — la key
                // combina los campos disponibles + el índice para distinguir filas con datos
                // idénticos sin depender solo de la posición.
                <li
                  key={`${transaccion.fecha}-${transaccion.descripcion}-${transaccion.cargo}-${transaccion.abono}-${indice}`}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-sm"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{transaccion.fecha.slice(0, 10)}</span>
                    <span className="font-medium">
                      {transaccion.descripcion}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-foreground">
                    <span>
                      Cargo:{' '}
                      <span className="font-medium">
                        {formatearMontoCLP(transaccion.cargo)}
                      </span>
                    </span>
                    <span>
                      Abono:{' '}
                      <span className="font-medium">
                        {formatearMontoCLP(transaccion.abono)}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
