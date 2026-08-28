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
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRegistrarMovimiento } from '@/api/use-registrar-movimiento';
import { useCategorias } from '@/api/use-categorias';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { hoyLocal, esFechaValida } from '@/domain/fecha';
import { esMontoStringValido } from '@/domain/formatear-monto';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type { BucketAsignable } from '@/api/catalogo-constantes';
import type { RegistrarMovimientoManualInput } from '@/api/movimientos';
import type { ApiError } from '@/api/client';
import type { CatalogoEstado } from '@/api/types';
import { CampoTexto } from './configuracion/CampoTexto';
import { CampoSelect } from './configuracion/categorias/CampoSelect';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENSAJE_DEMO_REGISTRAR =
  'La cuenta demo es de solo lectura. No es posible registrar movimientos en modo demo.';

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
          { value: '', label: 'Seleccioná un bucket' },
          ...catalogo.grupos.map((g) => ({ value: g.bucket, label: g.bucket })),
        ]
      : [{ value: '', label: 'Seleccioná un bucket' }];

  const categoriaOptions =
    catalogo.tag === 'listo' && bucketUI
      ? [
          { value: '', label: 'Seleccioná una categoría' },
          ...(catalogo.grupos
            .find((g) => g.bucket === bucketUI)
            ?.categorias.map((c) => ({ value: c.id, label: c.nombre })) ?? []),
        ]
      : [{ value: '', label: 'Seleccioná una categoría' }];

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

    // Guard: esDemo, isPending, or isSubmittingRef (D-10/D-11).
    if (esDemo || mutation.isPending || isSubmittingRef.current) {
      return;
    }

    // Pre-validation (shape only, not business rules — ADR-024).
    const nextErrores: Errores = {};

    if (descripcion.trim() === '') {
      nextErrores.descripcion = 'La descripción es obligatoria.';
    }
    if (!esMontoManualValido(monto)) {
      nextErrores.monto = 'Ingresá un monto válido (número entero positivo).';
    }
    if (!esFechaValida(fecha) || fecha > hoyLocal()) {
      nextErrores.fecha = 'La fecha no puede ser futura.';
    }
    if (tipo === 'Gasto') {
      if (!esBucketAsignable(bucketUI)) {
        nextErrores.cascade = 'Seleccioná un bucket válido.';
      } else if (!categoriaId) {
        nextErrores.cascade = 'Seleccioná una categoría.';
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

    isSubmittingRef.current = true;
    const body = construirBody();

    mutation.mutate(body, {
      onSuccess: () => {
        // D-10: clear form on 201; reset to Ingreso.
        setTipo('Ingreso');
        setFecha(hoyLocal());
        setDescripcion('');
        setMonto('');
        setBucketUI('');
        setCategoriaId('');
        setErrores({});
        setFeedback({
          tono: 'ok',
          texto: 'Movimiento registrado exitosamente.',
        });
      },
      onError: (err: ApiError) => {
        // D-10: show error, do NOT clear any field (WEB-REG-08).
        setFeedback({ tono: 'error', texto: err.message });
      },
      onSettled: () => {
        isSubmittingRef.current = false;
      },
    });
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
          disabled={esDemo}
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
            disabled={esDemo}
            className="rounded-md border border-input px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          />
        </label>
        {errores.fecha && (
          <p className="text-sm text-destructive">{errores.fecha}</p>
        )}

        {/* Descripción — CampoTexto (type='text', D-15) */}
        <CampoTexto
          label="Descripción"
          value={descripcion}
          onChange={setDescripcion}
          type="text"
          disabled={esDemo}
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
            disabled={esDemo}
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
              No se pudo cargar el catálogo de categorías. Podés intentar con
              los valores que ya tenés seleccionados o reintentar más tarde.
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
            disabled={esDemo || catalogo.tag !== 'listo'}
          />

          {/* Categoría select — disabled until bucket chosen (WEB-REG-04, FilaRevision precedent) */}
          <CampoSelect
            label="Categoría"
            value={categoriaId}
            onChange={setCategoriaId}
            options={categoriaOptions}
            disabled={esDemo || catalogo.tag !== 'listo' || !bucketUI}
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

      {/* Error feedback region (role="alert", D-10, PerfilForm idiom) */}
      <div role="alert" className="text-sm text-destructive">
        {feedback?.tono === 'error' && <p>{feedback.texto}</p>}
      </div>

      {/* Submit button (D-11: disabled={esDemo || mutation.isPending}) —
          label swaps to "Registrando…" while pending (impeccable critique
          P2: in-button async feedback, matching the "registrar" vocabulary
          the rest of this flow already uses — useRegistrarMovimiento, the
          success copy below, MENSAJE_DEMO_REGISTRAR). */}
      <Button type="submit" disabled={esDemo || mutation.isPending}>
        {mutation.isPending ? 'Registrando…' : 'Registrar movimiento'}
      </Button>

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
