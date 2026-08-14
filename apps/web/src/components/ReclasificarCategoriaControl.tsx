import { useEffect, useId, useRef, useState } from 'react';
import { useCategorias } from '@/api/use-categorias';
import { useReclasificarCategoria } from '@/api/use-reclasificar-categoria';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';

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
 * **Si `GET /api/categorias` falla** (red, 5xx, cold-start de Render — un
 * modo de falla real y documentado en este deploy), `useCategorias()` deja
 * `data === undefined` para siempre; sin manejo explícito el `<select>` se
 * queda deshabilitado en silencio, sin explicación ni forma de recuperarse.
 * Este control lee `error` de `useCategorias()` y lo muestra con el mismo
 * patrón `role="alert"` que usa para errores de mutación, más un botón
 * "Reintentar" que llama `refetch()` — nunca un candado mudo. El banner SOLO
 * se muestra cuando `data === undefined && catalogoError`: `refetchOnReconnect`
 * queda en su default `true` en producción (`main.tsx` solo pisa
 * `refetchOnWindowFocus`), así que un refetch de fondo que falla sobre datos
 * ya cargados y válidos deja `catalogoError` truthy con `data` intacta — el
 * `<select>` sigue andando con la última data buena y no debe aparentar estar
 * roto. Mientras ese refetch (inicial o el disparado por "Reintentar",
 * incluyendo los backoffs internos de `shouldRetryQuery` en `main.tsx`, hasta
 * 3 intentos) está en vuelo, `useCategorias().isFetching` también deshabilita
 * el botón "Reintentar" — sin eso, un click durante un cold-start de Render
 * no da ninguna señal hasta que resuelve.
 *
 * a11y (ADR-018, WCAT-05): `<label htmlFor>` visualmente oculto pero con
 * nombre accesible real ("Cambiar categoría de {descripcion}", no un genérico
 * "Editar categoría" sin contexto); la confirmación es un `role="alertdialog"`
 * con foco movido a "Confirmar" al abrirse y devuelto al `<select>` al
 * cancelar — operable enteramente por teclado (botones nativos, sin ARIA de
 * dropdown custom); Escape dentro del diálogo cancela igual que el botón
 * "Cancelar" (sin foco-trap completo — innecesario para este widget inline
 * por fila). El control se DESHABILITA (no se oculta) mientras la mutación
 * está en curso. El estado "catálogo en vuelo" (carga inicial o refetch,
 * incluyendo reintentos) se expone SOLO como `aria-busy` en el `<select>` —
 * NUNCA como `role="status"` por fila: `useCategorias()` comparte una única
 * query `['categorias']` entre todas las filas montadas (`use-categorias.ts`),
 * así que un `role="status"` por control anunciaría la MISMA frase N veces
 * para un solo fetch en cada carga normal de un panel de bucket. `aria-busy`
 * es correcto por fila porque es ESTADO, no anuncio; una announcement
 * compartida (una sola vez por fetch) requeriría vivir en un ancestro con
 * una única instancia — deuda registrada, ver nota más abajo.
 *
 * **Deuda aceptada (alcance de este control, no de `BucketDetailList`):** si
 * el catálogo falla SIN datos en caché (nunca cargó), cada fila sigue
 * renderizando su propio `role="alert"` + botón "Reintentar" — N duplicados
 * en el estado genuinamente roto. Elevar el error/retry del catálogo a
 * `BucketDetailList` (una sola instancia por panel) es el follow-up limpio;
 * se difiere a propósito para mantener el blast radius de esta ronda en un
 * único componente ya en producción.
 */
export function ReclasificarCategoriaControl({
  transaccionId,
  descripcion,
  montoLabel,
  bucketActual,
  categoriaActual,
  periodo,
}: {
  readonly transaccionId: string;
  readonly descripcion: string;
  readonly montoLabel: string;
  readonly bucketActual: string;
  readonly categoriaActual: string | null;
  readonly periodo: string | undefined;
}) {
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const [valor, setValor] = useState(categoriaActual ?? '');
  const [pendiente, setPendiente] = useState<{
    nombre: string;
    bucketNuevo: string;
  } | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const mutacion = useReclasificarCategoria(periodo, bucketActual);
  const {
    data,
    error: catalogoError,
    refetch: refetchCategorias,
    isFetching: catalogoEnVuelo,
  } = useCategorias();
  const grupos = agruparPorBucket(data?.categorias ?? []);
  const bucketDe = (nombre: string): string | undefined =>
    data?.categorias.find((c) => c.nombre === nombre)?.bucket;

  // Foco al abrir la confirmación (WCAT-05): mueve el foco a "Confirmar" en
  // vez de dejarlo huérfano en el <select> que acaba de disparar `onChange`
  // — un usuario de teclado necesita saber que apareció un diálogo antes de
  // seguir tabulando.
  useEffect(() => {
    if (pendiente) {
      confirmarRef.current?.focus();
    }
  }, [pendiente]);

  function commit(nombre: string) {
    setErrorMensaje(null);
    mutacion.mutate(
      { transaccionId, categoria: nombre },
      {
        onError: (error) => {
          setErrorMensaje(error.message);
          setValor(categoriaActual ?? '');
        },
      },
    );
  }

  function alCambiar(event: React.ChangeEvent<HTMLSelectElement>) {
    const nombre = event.target.value;
    // Clear any stale pending confirmation FIRST: a new selection always
    // supersedes a previous, unconfirmed cross-bucket dialog — otherwise the
    // old dialog stays on screen referencing a categoría the user no longer
    // has selected, and confirming it fires a PATCH for the wrong value
    // (network race between "pick B" and "confirm A").
    setPendiente(null);
    setValor(nombre);
    setErrorMensaje(null);
    const bucketNuevo = bucketDe(nombre);
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
      setValor(categoriaActual ?? '');
      return;
    }
    if (bucketNuevo === bucketActual) {
      commit(nombre);
      return;
    }
    setPendiente({ nombre, bucketNuevo });
  }

  function confirmar() {
    if (!pendiente) return;
    commit(pendiente.nombre);
    setPendiente(null);
  }

  function cancelar() {
    setPendiente(null);
    setValor(categoriaActual ?? '');
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
        aria-busy={catalogoEnVuelo}
        onChange={alCambiar}
        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            <option value={categoriaActual}>{categoriaActual}</option>
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
                  <option key={categoria.nombre} value={categoria.nombre}>
                    {categoria.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        )}
      </select>
      <span aria-live="polite" className="sr-only">
        {mutacion.isSuccess && !pendiente
          ? `Categoría actualizada a ${mutacion.data?.categoria.nombre}.`
          : ''}
      </span>
      {data === undefined && catalogoError && (
        <p role="alert" className="text-xs text-red-600">
          {catalogoError.message}{' '}
          <button
            type="button"
            onClick={() => void refetchCategorias()}
            disabled={catalogoEnVuelo}
            className="underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reintentar
          </button>
        </p>
      )}
      {errorMensaje && (
        <p role="alert" className="text-xs text-red-600">
          {errorMensaje}
        </p>
      )}
      {pendiente && (
        <div
          role="alertdialog"
          aria-label="Confirmar cambio de categoría"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              cancelar();
            }
          }}
          className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700 shadow-sm"
        >
          <p>
            Esto mueve {montoLabel} de {etiqueta(bucketActual)} a{' '}
            {etiqueta(pendiente.bucketNuevo)}.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelar}
              className="rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-600"
            >
              Cancelar
            </button>
            <button
              ref={confirmarRef}
              type="button"
              onClick={confirmar}
              disabled={mutacion.isPending}
              className="rounded-full bg-slate-800 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
