import { useId, useRef, useState } from 'react';
import { useCategorias } from '@/api/use-categorias';
import { useReclasificarCategoria } from '@/api/use-reclasificar-categoria';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { InlineConfirm } from '@/components/ui/inline-confirm';

function etiqueta(bucket: string): string {
  return ETIQUETA_BUCKET[bucket] ?? bucket;
}

/**
 * ReclasificarCategoriaControl — el `<select>` por fila que reemplaza los
 * placeholders deshabilitados "Editar categoría"/"Clasificar" (US-013 S6b,
 * WCAT-04/05, T6.0 decision). Un único control cubre AMBOS casos (reclasificar
 * una fila ya categorizada, o asignar categoría a una fila SinCategoria) —
 * mismo mecanismo, `categoriaActual` simplemente llega `null` en el segundo
 * caso (design.md §7.3, DRY: no dos controles distintos).
 *
 * Ofrece TODAS las categorías propias del caller, agrupadas por bucket vía
 * `<optgroup>` (T6.0: cross-bucket permitido, decisión confirmada
 * explícitamente por el usuario antes de esta implementación — la
 * alternativa "solo mismo bucket" fue descartada porque el caso de uso
 * principal de reclasificar ES corregir un bucket equivocado), sourced de
 * `useCategorias()` — el mismo query `['categorias']` que alimenta
 * `/configuracion/categorias` (US-043 design.md §7) — en vez de la lista
 * estática que este control usaba antes (`domain/categoria.ts`, retirado):
 * una categoría creada, renombrada o eliminada en Configuración se refleja
 * acá sin cambio de código. Si la categoría elegida deriva a un bucket
 * DISTINTO del bucket actual de la fila, se pide confirmación mostrando el
 * monto que se mueve (money-move visible) ANTES de comprometer el cambio;
 * mismo-bucket commitea directo. El bucket destino se deriva del propio
 * campo `bucket` del DTO elegido — nunca de un mapa estático — así que un
 * re-bucket hecho en Configuración dispara la confirmación correcta de
 * inmediato (WCAT-04 delta, US-043 §7).
 *
 * **Mientras el catálogo carga** (`data === undefined`), el `<select>` se
 * DESHABILITA y ofrece solo la categoría actual — nunca un `<select>` vacío
 * en una superficie de dashboard ya en producción.
 *
 * **Este control NO renderiza banner de error ni botón "Reintentar" propios
 * para el catálogo.** `useCategorias()` comparte una única query
 * `['categorias']` entre TODAS las filas montadas (`use-categorias.ts`), y
 * `BucketDetalleMesPage` es su único punto de montaje (una instancia por
 * página, verificado — ver su propio JSDoc). Por eso todo el fetch-lifecycle
 * surface
 * del catálogo — el `role="status"` de carga inicial y el `role="alert"` +
 * "Reintentar" cuando falla sin datos — vive UNA sola vez ahí arriba, no acá
 * N veces por fila. Este control solo lee `data`/`isFetching` de
 * `useCategorias()` para su propio estado (`disabled`, `aria-busy`).
 *
 * a11y (ADR-018, WCAT-05): `<label htmlFor>` visualmente oculto pero con
 * nombre accesible real ("Cambiar categoría de {descripcion}", no un genérico
 * "Editar categoría" sin contexto); la confirmación es un `role="alertdialog"`
 * con foco movido a "Confirmar" al abrirse y devuelto al `<select>` al
 * cancelar — operable enteramente por teclado (botones nativos, sin ARIA de
 * dropdown custom); Escape dentro del diálogo cancela igual que el botón
 * "Cancelar" (sin foco-trap completo — innecesario para este widget inline
 * por fila). El control se DESHABILITA (no se oculta) mientras la mutación
 * está en curso. `aria-busy` en el `<select>` está acotado a la CARGA
 * INICIAL del catálogo (`data === undefined && isFetching`) — NUNCA a
 * `isFetching` a secas: un refetch de fondo (p. ej. `refetchOnReconnect`,
 * default `true` en `main.tsx`, sin pisar en producción) sobre datos ya
 * cargados deja el `<select>` totalmente habilitado y usable; marcarlo
 * `aria-busy` en ese momento sería semánticamente engañoso para un lector de
 * pantalla — se dispararía en cualquier reconexión normal, no solo en un
 * estado que realmente bloquea la interacción.
 */
export function ReclasificarCategoriaControl({
  transaccionId,
  descripcion,
  montoLabel,
  bucketActual,
  categoriaActual,
  periodo,
  onMovida,
}: {
  readonly transaccionId: string;
  readonly descripcion: string;
  readonly montoLabel: string;
  readonly bucketActual: string;
  readonly categoriaActual: { id: string; nombre: string } | null;
  readonly periodo: string | undefined;
  readonly onMovida: (bucketLabel: string) => void;
}) {
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [valor, setValor] = useState(categoriaActual?.id ?? '');
  const [pendiente, setPendiente] = useState<{
    categoriaId: string;
    bucketNuevo: string;
  } | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const mutacion = useReclasificarCategoria(periodo, bucketActual);
  const { data, isFetching: catalogoEnVuelo } = useCategorias();
  // Initial load only (WCAT-04 delta): `data === undefined` while
  // `isFetching` is true — never true again once the catalog has data, even
  // during a background refetch. See the JSDoc above for why bare
  // `isFetching` would be wrong here.
  const catalogoCargandoInicial = data === undefined && catalogoEnVuelo;
  // Local filter to BUCKETS_ASIGNABLES (D-06): agruparPorBucket may also
  // emit an "Otros" catch-all for buckets outside the three spend buckets
  // (e.g. Ingresos). Filter that out here — agruparPorBucket itself stays
  // intact for Configuración, which legitimately shows every group.
  const grupos = agruparPorBucket(data?.categorias ?? []).filter((g) =>
    (BUCKETS_ASIGNABLES as ReadonlyArray<string>).includes(g.bucket),
  );
  const categoriaPorId = (id: string): string | undefined =>
    data?.categorias.find((c) => c.id === id)?.bucket;

  // Cross-bucket commits need to fire onMovida only after the mutation
  // settles successfully. We capture the pending bucket label at confirm
  // time and thread it into the mutation's onSuccess callback so a
  // failed PATCH never triggers the announcement.
  function commit(categoriaId: string, onSuccess?: () => void) {
    setErrorMensaje(null);
    mutacion.mutate(
      { transaccionId, categoriaId },
      {
        onSuccess: () => {
          onSuccess?.();
        },
        onError: (error) => {
          setErrorMensaje(error.message);
          setValor(categoriaActual?.id ?? '');
        },
      },
    );
  }

  function alCambiar(event: React.ChangeEvent<HTMLSelectElement>) {
    const categoriaId = event.target.value;
    // Clear any stale pending confirmation FIRST: a new selection always
    // supersedes a previous, unconfirmed cross-bucket dialog — otherwise the
    // old dialog stays on screen referencing a categoría the user no longer
    // has selected, and confirming it fires a PATCH for the wrong value
    // (network race between "pick B" and "confirm A").
    setPendiente(null);
    setValor(categoriaId);
    setErrorMensaje(null);
    const bucketNuevo = categoriaPorId(categoriaId);
    if (bucketNuevo === undefined) {
      // Defensive, not reachable via the rendered `<option>`s today (they
      // and this lookup read the same `data` snapshot) — but "unresolved"
      // must fail loud, never fall through to "same bucket, commit
      // directly". Silently auto-committing here would skip WCAT-04's
      // cross-bucket confirmation for a categoría the live catalog can't
      // even attribute a bucket to (ADR-015: risk concentrates in money).
      setErrorMensaje(
        'La categoría elegida ya no está disponible. Elige otra.',
      );
      setValor(categoriaActual?.id ?? '');
      return;
    }
    if (bucketNuevo === bucketActual) {
      commit(categoriaId);
      return;
    }
    setPendiente({ categoriaId, bucketNuevo });
  }

  function confirmar() {
    if (!pendiente) return;
    // Capture the destination label at confirm time before clearing
    // `pendiente`. The label is derived here, not inside the callback,
    // so the closure captures the value from this render, not a stale ref.
    // onMovida fires only when the PATCH succeeds — a failed mutation
    // must not announce a move that never happened (D-07).
    const bucketLabel = etiqueta(pendiente.bucketNuevo);
    commit(pendiente.categoriaId, () => {
      onMovida(bucketLabel);
    });
    setPendiente(null);
  }

  function cancelar() {
    setPendiente(null);
    setValor(categoriaActual?.id ?? '');
    selectRef.current?.focus();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label htmlFor={selectId} className="sr-only">
        Cambiar categoría de {descripcion}
      </label>
      <select
        id={selectId}
        ref={selectRef}
        value={valor}
        disabled={mutacion.isPending || data === undefined}
        aria-busy={catalogoCargandoInicial}
        onChange={alCambiar}
        className="rounded-none border border-border px-3 py-1 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {data === undefined ? (
          // Mid-flight: the catalog hasn't loaded yet. Offer only the
          // current value — never an empty <select> on a shipped dashboard
          // surface (design.md §7).
          categoriaActual === null ? (
            <option value="" disabled>
              Sin categoría
            </option>
          ) : (
            <option value={categoriaActual.id}>{categoriaActual.nombre}</option>
          )
        ) : (
          <>
            {categoriaActual === null && (
              <option value="" disabled>
                Sin categoría
              </option>
            )}
            {grupos.map((grupo) => (
              <optgroup key={grupo.bucket} label={etiqueta(grupo.bucket)}>
                {grupo.categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        )}
      </select>
      {errorMensaje && (
        <p role="alert" className="text-xs text-destructive">
          {errorMensaje}
        </p>
      )}
      {pendiente && (
        <InlineConfirm
          title="Confirmar cambio de categoría"
          confirmLabel="Confirmar"
          onConfirm={confirmar}
          onCancel={cancelar}
          pending={mutacion.isPending}
          className="gap-2 p-3 text-xs"
        >
          <p>
            Esto mueve {montoLabel} de {etiqueta(bucketActual)} a{' '}
            {etiqueta(pendiente.bucketNuevo)}.
          </p>
        </InlineConfirm>
      )}
    </div>
  );
}
