import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useCrearCategoria } from '@/api/use-crear-categoria';
import { MATCH_TYPES } from '@/api/catalogo-constantes';
import type { BucketAsignable, MatchType } from '@/api/catalogo-constantes';
import type { CategoriaDto } from '@/api/types';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { CampoTexto } from '@/components/configuracion/CampoTexto';
import { CampoSelect } from '@/components/configuracion/categorias/CampoSelect';
import { CLASE_BOTON_ICONO } from '@/components/configuracion/estilos';
import {
  ETIQUETA_MATCH_TYPE,
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from '@/components/configuracion/categorias/mensajes-catalogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const OPCIONES_MATCH_TYPE = MATCH_TYPES.map((matchType) => ({
  value: matchType,
  label: ETIQUETA_MATCH_TYPE[matchType],
}));

/**
 * NuevaCategoriaDesdeFilaForm (crear-categoria-desde-preview PR3, design.md
 * D-08/D-09, WEB-PRV-13/14). Inline `<form>` mounted INSIDE the originating
 * preview row's `<li>` (D-08) — deliberately NOT a Radix `Popover` (portal +
 * float, can't hold matchType+patron+delete per row at the widths this
 * table already fights for) and NOT a modal (D-08's rejected alternatives).
 * `NuevaCategoriaForm` (configuracion/categorias) is the shell precedent:
 * same `flex flex-col gap-4 rounded-md border border-border p-4` wrapper,
 * same `mensajeDeErrorCatalogo`/`MENSAJE_DEMO_CATALOGO` discipline.
 *
 * `bucket` is FIXED (the row's already-chosen bucket, D-08 locked decision
 * 2) — shown as static `ETIQUETA_BUCKET` text, never editable here.
 *
 * `filas` (patrones editor): keyed by `clave` (`crypto.randomUUID()` — task
 * 3.0.1: the app's `es2023` build target and same-origin fetch/cookie usage
 * already assume evergreen, secure-context browsers, where
 * `crypto.randomUUID()` is universally available; no `useId()`/counter
 * fallback needed), NEVER by array index — removing row 0 must not make row
 * 1 inherit row 0's state or error (D-09). The first row prefills from the
 * originating row's own description as `CONTAINS` (locked decision 3);
 * editable and removable. The list MAY be emptied — zero patrones is a
 * valid submission (CAT038-10).
 *
 * `PatronFila` (configuracion/categorias) is deliberately NOT reused here —
 * it is an auto-committing controller wired to three mutations against an
 * already-persisted `categoriaId` (create/update/delete each fire
 * immediately); this form's rows are a DRAFT that commits once, as a batch,
 * on `Crear` (D-09).
 *
 * Validation: the server is the sole authority (ADR-024) — no client-side
 * block. A REGEX hint (`role="status"`) renders when `matchType === 'REGEX'`
 * and the current text fails `new RegExp(...)`, mirroring `PatronFila`'s
 * same non-blocking hint. Blank-only rows are dropped before submit.
 *
 * Error placement (D-09/WEB-PRV-14): `error.indice` (CAT038-11) — captured
 * from the array actually SENT (`ultimoEnviado` state, since blank rows are
 * dropped before the request, the server's index refers to the filtered
 * list, not `filas` as typed) — places a `role="alert"` INSIDE that specific
 * row; any other error (no `indice`, e.g. `NOMBRE_DUPLICADO`) renders ONE
 * form-level `role="alert"`, never both at once.
 *
 * Focus: opening moves focus to `Nombre` (mount effect — this component is
 * only ever mounted while open, per `FilaRevision`'s conditional render).
 * `Escape` on the form cancels without saving (`onCancelar`, no request).
 * Returning focus to the "+" trigger that opened this form is the CALLER's
 * job (`FilaRevision` owns that ref, D-10/D-11) — this component only calls
 * `onCancelar`/`onCreada`, it never touches focus outside itself.
 */

type PatronBorrador = {
  readonly clave: string;
  readonly patron: string;
  readonly matchType: MatchType;
};

function unaClave(): string {
  return crypto.randomUUID();
}

export function NuevaCategoriaDesdeFilaForm({
  bucket,
  descripcionFila,
  esDemo,
  onCancelar,
  onCreada,
}: {
  readonly bucket: string;
  readonly descripcionFila: string;
  readonly esDemo: boolean;
  readonly onCancelar: () => void;
  readonly onCreada: (categoria: CategoriaDto) => void;
}) {
  const mutation = useCrearCategoria();
  const [nombre, setNombre] = useState('');
  const [filas, setFilas] = useState<readonly PatronBorrador[]>(() => [
    { clave: unaClave(), patron: descripcionFila, matchType: 'CONTAINS' },
  ]);
  // The array actually sent to the server (blank rows already dropped) —
  // `error.indice` (CAT038-11) is a position within THIS array, not `filas`.
  // State, not a ref: `error.indice` is only meaningful once a re-render has
  // already happened for the mutation's error state, and `react-hooks/refs`
  // forbids reading `.current` during render (refs aren't a render input).
  const [ultimoEnviado, setUltimoEnviado] = useState<readonly PatronBorrador[]>(
    [],
  );

  const nombreRef = useRef<HTMLInputElement>(null);
  const idTitulo = useId();

  // Opening the form MUST move focus into it (WEB-PRV-13) — this component
  // only ever mounts while open (FilaRevision's conditional render), so a
  // mount-only effect is the open transition.
  useEffect(() => {
    nombreRef.current?.focus();
  }, []);

  function agregarFila() {
    setFilas((actual) => [
      ...actual,
      { clave: unaClave(), patron: '', matchType: 'CONTAINS' },
    ]);
  }

  function quitarFila(clave: string) {
    setFilas((actual) => actual.filter((f) => f.clave !== clave));
  }

  function actualizarPatron(clave: string, patron: string) {
    setFilas((actual) =>
      actual.map((f) => (f.clave === clave ? { ...f, patron } : f)),
    );
  }

  function actualizarMatchType(clave: string, matchType: string) {
    setFilas((actual) =>
      actual.map((f) =>
        f.clave === clave ? { ...f, matchType: matchType as MatchType } : f,
      ),
    );
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enviados = filas
      .map((f) => ({ ...f, patron: f.patron.trim() }))
      .filter((f) => f.patron !== '');
    setUltimoEnviado(enviados);

    mutation.mutate(
      {
        nombre,
        bucket: bucket as BucketAsignable,
        patrones: enviados.map((f) => ({
          patron: f.patron,
          matchType: f.matchType,
        })),
      },
      { onSuccess: (categoria) => onCreada(categoria) },
    );
  }

  function alPresionarTecla(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelar();
    }
  }

  // `errorActual` — `mutation.error` narrowed to non-null exactly when
  // `mutation.isError` (react-query's `isError`/`error` pair is a
  // discriminated union at the HOOK level, but that narrowing doesn't
  // survive being read again later inside `filas.map(...)` below — `tsc`
  // sees `ApiError | null` there without this local capture).
  const errorActual = mutation.isError ? mutation.error : null;

  // D-09: `error.indice` refers to a position in `ultimoEnviado` (the
  // FILTERED array actually sent), not `filas` — map back to the matching
  // row's `clave` so the alert lands on the right visible row even after
  // blank rows were dropped pre-submit.
  const errorIndice =
    errorActual !== null &&
    errorActual.tag === 'server' &&
    errorActual.indice !== undefined
      ? errorActual.indice
      : undefined;
  const claveConError =
    errorIndice !== undefined ? ultimoEnviado[errorIndice]?.clave : undefined;
  const errorFormLevel =
    errorActual !== null && claveConError === undefined ? errorActual : null;

  return (
    // Escape is bound at the form container, not at a specific control —
    // same WAI-ARIA pattern (and same eslint-disable) as `InlineConfirm`'s
    // own container: `jsx-a11y/no-noninteractive-element-interactions`
    // cannot tell a "close-on-Escape-anywhere-inside" container apart from
    // a bare non-interactive element being misused as a widget.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      aria-labelledby={idTitulo}
      onSubmit={enviar}
      onKeyDown={alPresionarTecla}
      className="flex flex-col gap-4 rounded-md border border-border p-4"
    >
      <h4 id={idTitulo} className="text-sm font-semibold text-foreground">
        Nueva categoría
      </h4>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <CampoTexto
          ref={nombreRef}
          label="Nombre"
          value={nombre}
          onChange={setNombre}
          required
          disabled={esDemo}
        />
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          Bucket
          <span className="py-2 font-medium text-foreground">
            {ETIQUETA_BUCKET[bucket] ?? bucket}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {filas.map((fila) => {
          const regexInvalida = (() => {
            if (fila.matchType !== 'REGEX' || fila.patron === '') {
              return false;
            }
            try {
              new RegExp(fila.patron);
              return false;
            } catch {
              return true;
            }
          })();
          const tieneErrorIndexado = fila.clave === claveConError;

          return (
            <li
              key={fila.clave}
              className="flex flex-wrap items-start gap-2 border-b border-border py-2 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                <CampoSelect
                  label="Tipo de coincidencia"
                  value={fila.matchType}
                  onChange={(value) => actualizarMatchType(fila.clave, value)}
                  options={OPCIONES_MATCH_TYPE}
                  disabled={esDemo || mutation.isPending}
                />
                <CampoTexto
                  label="Patrón"
                  value={fila.patron}
                  onChange={(value) => actualizarPatron(fila.clave, value)}
                  disabled={esDemo || mutation.isPending}
                />
              </div>
              <button
                type="button"
                disabled={esDemo || mutation.isPending}
                onClick={() => quitarFila(fila.clave)}
                aria-label={
                  fila.patron
                    ? `Eliminar patrón ${fila.patron}`
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
                <p
                  role="status"
                  className="w-full text-xs text-warning-foreground"
                >
                  Esa expresión regular podría no ser válida.
                </p>
              )}
              {tieneErrorIndexado && errorActual !== null && (
                <p role="alert" className="w-full text-xs text-destructive">
                  {mensajeDeErrorCatalogo(errorActual)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={esDemo || mutation.isPending}
          onClick={agregarFila}
        >
          Agregar patrón
        </Button>
      </div>

      {esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}
      {errorFormLevel && (
        <p role="alert" className="text-sm text-destructive">
          {mensajeDeErrorCatalogo(errorFormLevel)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="text-muted-foreground"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={esDemo || mutation.isPending}>
          Crear
        </Button>
      </div>
    </form>
  );
}
