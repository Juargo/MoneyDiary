import { useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useCategorias } from '@/api/use-categorias';
import { useReclasificarCategoria } from '@/api/use-reclasificar-categoria';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type { CategoriaDto } from '@/api/types';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { construirOpcionesBucket, ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { InlineConfirm } from '@/components/ui/inline-confirm';
import { CampoSelect } from '@/components/configuracion/categorias/CampoSelect';
import { NuevaCategoriaDesdeFilaForm } from '@/components/preview/NuevaCategoriaDesdeFilaForm';
import { OfrecerPatronControl } from '@/components/OfrecerPatronControl';
import { CLASE_BOTON_ICONO } from '@/components/configuracion/estilos';
import { cn } from '@/lib/utils';

function etiqueta(bucket: string): string {
  return ETIQUETA_BUCKET[bucket] ?? bucket;
}

/**
 * ReclasificarCategoriaControl — el `<select>` por fila que reemplaza los
 * placeholders deshabilitados "Editar categoría"/"Clasificar" (US-013 S6b,
 * WCAT-04/05, T6.0 decision). Un único control cubre AMBOS casos (reclasificar
 * una fila ya categorizada, o asignar categoría a una fila sin categoría) —
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
 * **`onMovida` (confirmacion-reclasificar, issue #749):** ya no es exclusivo
 * del caso cross-bucket. Un mismo-bucket también llama a `onMovida` — el
 * caller (`BucketDetalleMesPage`) arma el mismo mensaje "Movida a {label}."
 * sin importar cuál de los dos casos lo disparó.
 *
 * El `{label}` del caso cross-bucket nombra el destino COMPLETO, "{bucket} ·
 * {categoría}" (issue #782). Antes nombraba solo el bucket, y eso perdía
 * justo la mitad de la decisión que el usuario acababa de tomar: elegía
 * "Necesidades · Salud" en el `<option>` y el diálogo le respondía "a
 * Necesidades", sin confirmarle nunca que Salud hubiera entrado. El mismo-
 * bucket sigue mandando solo el nombre de la categoría, porque ahí el bucket
 * no cambia y repetirlo sería ruido.
 *
 * Cada `<option>` muestra "{bucket} · {categoría}" (p. ej. "Gustos ·
 * Restaurantes"), no solo el nombre de la categoría (UX-clarity fix,
 * reclasificar-bucket-y-categoria, 2026-09-14): el `<select>` CERRADO solo
 * mostraba el nombre de la categoría, y el bucket era visible únicamente
 * como encabezado de `<optgroup>` una vez abierto — el usuario no entendía
 * que estaba eligiendo bucket Y categoría a la vez. El `<optgroup>` se
 * mantiene para el escaneo visual al abrir el `<select>`; el prefijo de
 * bucket en el texto de cada opción es ahora el mecanismo que hace el
 * bucket visible en el `<select>` CERRADO. Esto amiende WDM-10 (openspec):
 * esa regla decía "ningún sufijo de bucket en la opción, el `<optgroup>`
 * es el único disambiguador visual" para categorías homónimas en distinto
 * bucket — decisión de producto revisada explícitamente por el usuario;
 * el `<optgroup>` sigue existiendo pero deja de ser el ÚNICO mecanismo.
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
 * a11y (ADR-018, WCAT-05, bucket-detalle-lista-rediseño Cambio 4): el
 * `<select>` ya NO lleva ningún `<span>` de etiqueta propio — el encabezado
 * de columna "Categoría" de `GrupoMovimientos` lo dice UNA vez para toda la
 * lista, no fila por fila. El nombre accesible completo sigue viviendo en
 * `aria-label` (nunca `aria-labelledby`: se probó esa variante y
 * Playwright's `getByLabel` — a diferencia de jsdom y del árbol de
 * accesibilidad nativo de Chromium — NO incluye el texto de un nodo
 * `sr-only` referenciado por `aria-labelledby` en su cómputo de nombre
 * accesible, así que el e2e real nunca encontraba el control), pero su
 * fórmula cambió a `` `Categoría de {descripcion}: {etiquetaOpcionActual}` ``
 * — WCAG 2.5.3 Label in Name exige que el nombre accesible CONTENGA el texto
 * visible, y el único texto visible que le queda a este control es el de la
 * `<option>` seleccionada que el navegador pinta sobre el `<select>` cerrado
 * (`etiquetaOpcionActual()`, helper local: replica exactamente el texto que
 * cada `<option>` ya renderiza — `"{bucket} · {categoría}"` o
 * `"Sin categoría"` — tanto en el estado de carga del catálogo como una vez
 * resuelto, para que el nombre accesible NUNCA quede desincronizado de lo
 * que la persona realmente ve). La confirmación es un `role="alertdialog"`
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
 *
 * **"+" crear categoría desde el selector (issue #744):** un botón fijo
 * junto al `<select>` — deliberadamente NO una `<option>` (una opción que
 * actúa como comando se vuelve el VALOR seleccionado en varios navegadores/
 * lectores de pantalla al activarse por teclado, obligando a revertir la
 * selección en cada render; un botón separado no tiene ese problema y sigue
 * el mismo precedente que `FilaRevision`'s "+" y `AgregarCategoriaControl`,
 * issue #743). Abre `CrearCategoriaDesdeSelector` (declarado más abajo en
 * este archivo): a diferencia de `AgregarCategoriaControl` (bucket FIJO al
 * de la página, issue #743), acá el bucket es un `<select>` editable — el
 * hallazgo de usabilidad que originó este issue fue justo querer crear una
 * categoría en un bucket DISTINTO al de la fila que se está reclasificando
 * (p. ej. "Libros" bajo Gustos mientras se mira una fila de Necesidades).
 * Precarga con `bucketActual` (el destino más probable) pero el usuario
 * puede cambiarlo antes de crear. Reutiliza `NuevaCategoriaDesdeFilaForm`
 * tal cual (mismo `useCrearCategoria`, mismo copy de error) — el ÚNICO
 * componente nuevo es el `<select>` de bucket que la envuelve.
 *
 * Al crear, la categoría queda SELECCIONADA para esta fila (no solo
 * agregada al catálogo): `alCategoriaCreada` reusa exactamente el mismo
 * camino same-bucket/cross-bucket que `alCambiar` — mismo-bucket commitea
 * directo, bucket distinto abre la MISMA confirmación `alertdialog` que
 * cualquier otra reclasificación cross-bucket (ADR-015: crear la categoría
 * no exime la confirmación de mover dinero de bucket). El bucket de la
 * categoría recién creada viene directo del DTO que devuelve el POST — no
 * hace falta esperar el refetch del catálogo para decidir el camino.
 *
 * Estilo "fantasma" (bucket-detalle-lista-rediseño, Cambio 4): en reposo el
 * `<select>` no tiene borde ni relleno — se funde con la fila del ledger
 * (`GrupoMovimientos`'s `<li>`, 44px fijo) y solo la flechita nativa del
 * navegador delata que es un control (decisión deliberada del mockup: NO se
 * usa `appearance-none`, que borraría esa única señal). Borde y relleno
 * aparecen recién al hover/foco. El contenedor exterior es `relative`
 * porque la confirmación cross-bucket y el mensaje de error se posicionan
 * `absolute` (`top-full right-0`, fuera del flujo normal) — la fila que los
 * contiene tiene una altura FIJA de 44px y no puede crecer para acomodarlos.
 */
export function ReclasificarCategoriaControl({
  transaccionId,
  descripcion,
  montoLabel,
  bucketActual,
  categoriaActual,
  periodo,
  onMovida,
  onPatronCreado,
}: {
  readonly transaccionId: string;
  readonly descripcion: string;
  readonly montoLabel: string;
  readonly bucketActual: string;
  readonly categoriaActual: { id: string; nombre: string } | null;
  readonly periodo: string | undefined;
  /**
   * Fires on a successful reclassify — cross-bucket with the full
   * destination label "{bucket} · {categoría}" (issue #782), same-bucket
   * with the destination CATEGORÍA's name alone (confirmacion-reclasificar,
   * issue #749). The caller formats "Movida a {label}." verbatim either way.
   */
  readonly onMovida: (label: string) => void;
  /**
   * Fires once the "patrón desde movimiento" offer (issue #745) actually
   * saves a pattern, with the exact literal pattern text that was sent —
   * the caller announces it via the page's shared status region, same
   * pattern as `onMovida`. Optional: omitting it just skips that
   * announcement, the offer/creation flow itself works either way.
   */
  readonly onPatronCreado?: (patron: string) => void;
}) {
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const crearTriggerRef = useRef<HTMLButtonElement>(null);
  const [valor, setValor] = useState(categoriaActual?.id ?? '');
  // `categoriaNombre` viaja junto al id (issue #782): la confirmación y el
  // anuncio nombran el destino COMPLETO ("{bucket} · {categoría}"), no solo
  // el bucket. Se congela acá, en el momento de la elección, en vez de
  // buscarse en el catálogo al renderizar: un refetch en vuelo entre la
  // elección y el confirm no puede cambiar el texto que el usuario leyó.
  const [pendiente, setPendiente] = useState<{
    categoriaId: string;
    bucketNuevo: string;
    categoriaNombre: string;
  } | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  // "Patrón desde movimiento" offer (issue #745): set right after a
  // reclassify commits successfully, targeting the categoría it just
  // committed TO — never the row's previous one. `null` means no offer is
  // showing (initial state, or dismissed/completed).
  const [ofrecerPatron, setOfrecerPatron] = useState<{
    categoriaId: string;
  } | null>(null);
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

  // WCAG 2.5.3 Label in Name (Cambio 4): replicates EXACTLY the text each
  // rendered `<option>` shows, for whichever one is currently selected —
  // the mid-flight branch mirrors the single loading-state `<option>` below
  // (`{etiqueta(bucketActual)} · {categoriaActual.nombre}` or "Sin
  // categoría"), the loaded branch looks the selected `categoriaId` up in
  // the live catalog. `valor === ''` covers both the sin-categoría
  // placeholder AND the loaded branch consistently, since a real categoría
  // id is never an empty string.
  function etiquetaOpcionActual(): string {
    if (data === undefined) {
      return categoriaActual === null
        ? 'Sin categoría'
        : `${etiqueta(bucketActual)} · ${categoriaActual.nombre}`;
    }
    if (valor === '') {
      return 'Sin categoría';
    }
    const categoria = data.categorias.find((c) => c.id === valor);
    return categoria
      ? `${etiqueta(categoria.bucket)} · ${categoria.nombre}`
      : 'Sin categoría';
  }

  // Both cross-bucket and same-bucket commits fire onMovida only after the
  // mutation settles successfully. We capture the destination label (bucket
  // or categoría name) at commit time and thread it into the mutation's
  // onSuccess callback so a failed PATCH never triggers the announcement.
  //
  // "Patrón desde movimiento" offer (issue #745): every successful commit
  // ALSO opens the offer, targeting the categoría it just committed to —
  // one seam for every caller (same-bucket, cross-bucket confirm, and
  // create-category-then-assign) instead of duplicating this at each call
  // site. A failed PATCH never reaches `onSuccess`, so a failed
  // reclassification never offers a pattern for a change that didn't
  // happen.
  function commit(categoriaId: string, onSuccess?: () => void) {
    setErrorMensaje(null);
    mutacion.mutate(
      { transaccionId, categoriaId },
      {
        onSuccess: () => {
          onSuccess?.();
          setOfrecerPatron({ categoriaId });
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
    // A new pick always supersedes a previous pattern offer too — the same
    // reasoning as clearing `pendiente` above (WCAT-04 D-15... this
    // component's own "latest pick wins" discipline extended, issue #745):
    // an offer that still names the ROW's PREVIOUS categoría after a second
    // reclassify would create a pattern for the wrong target.
    setOfrecerPatron(null);
    const categoriaSeleccionada = data?.categorias.find(
      (c) => c.id === categoriaId,
    );
    if (categoriaSeleccionada === undefined) {
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
    const bucketNuevo = categoriaSeleccionada.bucket;
    if (bucketNuevo === bucketActual) {
      // Same-bucket reclassify (confirmacion-reclasificar, issue #749):
      // reuses the SAME `onMovida` seam the cross-bucket case uses below in
      // `confirmar()`, but with the destination CATEGORÍA's name instead of
      // a bucket label. The page-owned `alMovida` handler
      // (`BucketDetalleMesPage.tsx`) just interpolates whatever string it
      // receives into "Movida a {label}." — it does not care whether the
      // label is a bucket or a categoría, so no page-level change was
      // needed to support this second caller.
      commit(categoriaId, () => onMovida(categoriaSeleccionada.nombre));
      return;
    }
    setPendiente({
      categoriaId,
      bucketNuevo,
      categoriaNombre: categoriaSeleccionada.nombre,
    });
  }

  function confirmar() {
    if (!pendiente) return;
    // Capture the destination label at confirm time before clearing
    // `pendiente`. The label is derived here, not inside the callback,
    // so the closure captures the value from this render, not a stale ref.
    // onMovida fires only when the PATCH succeeds — a failed mutation
    // must not announce a move that never happened (D-07).
    const destinoLabel = `${etiqueta(pendiente.bucketNuevo)} · ${pendiente.categoriaNombre}`;
    commit(pendiente.categoriaId, () => {
      onMovida(destinoLabel);
    });
    setPendiente(null);
  }

  function cancelar() {
    setPendiente(null);
    setValor(categoriaActual?.id ?? '');
    selectRef.current?.focus();
  }

  function abrirCreacion() {
    // Opening "+" mid-offer (rare, but possible) supersedes it — same
    // "latest action wins" discipline as `alCambiar` above.
    setOfrecerPatron(null);
    setCreandoCategoria(true);
  }

  function cerrarCreacion() {
    setCreandoCategoria(false);
    crearTriggerRef.current?.focus();
  }

  // The categoría just created (issue #744): select it for this row via the
  // SAME same-bucket/cross-bucket branch `alCambiar` uses, but the bucket
  // comparison reads straight off the POST response (`categoria.bucket`) —
  // no need to wait for `data` (the `['categorias']` cache) to reflect the
  // seed `useCrearCategoria`'s own `onSuccess` already wrote, since this
  // callback has the full DTO in hand already.
  function alCategoriaCreada(categoria: CategoriaDto) {
    cerrarCreacion();
    setErrorMensaje(null);
    setValor(categoria.id);
    if (categoria.bucket === bucketActual) {
      commit(categoria.id, () => onMovida(categoria.nombre));
      return;
    }
    setPendiente({
      categoriaId: categoria.id,
      bucketNuevo: categoria.bucket,
      categoriaNombre: categoria.nombre,
    });
  }

  return (
    <div className="relative flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <select
          id={selectId}
          ref={selectRef}
          value={valor}
          disabled={mutacion.isPending || data === undefined}
          aria-busy={catalogoCargandoInicial}
          aria-label={`Categoría de ${descripcion}: ${etiquetaOpcionActual()}`}
          onChange={alCambiar}
          className="w-full min-w-0 max-w-full rounded-none border border-transparent bg-transparent px-1.5 py-1 text-xs text-muted-foreground hover:border-input hover:bg-card hover:text-foreground focus:border-input focus:bg-card focus:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {data === undefined ? (
            // Mid-flight: the catalog hasn't loaded yet. Offer only the
            // current value — never an empty <select> on a shipped dashboard
            // surface (design.md §7). The single option still shows the
            // bucket prefix (via `bucketActual`, the only bucket info this
            // component has before the catalog resolves) so the loading
            // state never regresses to a bucket-less label.
            categoriaActual === null ? (
              <option value="" disabled>
                Sin categoría
              </option>
            ) : (
              <option value={categoriaActual.id}>
                {etiqueta(bucketActual)} · {categoriaActual.nombre}
              </option>
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
                      {etiqueta(grupo.bucket)} · {categoria.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </>
          )}
        </select>
        <button
          ref={crearTriggerRef}
          type="button"
          disabled={mutacion.isPending}
          aria-label={`Nueva categoría para ${descripcion}`}
          onClick={abrirCreacion}
          className={cn(CLASE_BOTON_ICONO, 'shrink-0 text-muted-foreground')}
        >
          <Plus aria-hidden="true" className="size-[16px]" />
        </button>
      </div>
      {/* Absolute, not stacked in flow: the ledger row (`GrupoMovimientos`'s
          `<li>`) has a FIXED 44px height, so an error/confirm popup must
          never push it taller. */}
      {errorMensaje && (
        <p
          role="alert"
          className="absolute top-full right-0 z-10 mt-1 w-max max-w-xs text-xs text-error-foreground"
        >
          {errorMensaje}
        </p>
      )}
      {pendiente && (
        <InlineConfirm
          title="Confirmar cambio de grupo"
          confirmLabel="Confirmar"
          onConfirm={confirmar}
          onCancel={cancelar}
          pending={mutacion.isPending}
          className="absolute top-full right-0 z-10 mt-1 w-max max-w-xs gap-2 p-3 text-xs"
        >
          <p>
            Esto mueve {montoLabel} de {etiqueta(bucketActual)} a{' '}
            {etiqueta(pendiente.bucketNuevo)} · {pendiente.categoriaNombre}.
          </p>
        </InlineConfirm>
      )}
      {creandoCategoria && (
        <div className="absolute top-full right-0 z-20 mt-1 w-80 max-w-[90vw]">
          <CrearCategoriaDesdeSelector
            bucketInicial={bucketActual}
            onCancelar={cerrarCreacion}
            onCreada={alCategoriaCreada}
          />
        </div>
      )}
      {/* "Patrón desde movimiento" offer (issue #745). Mounts ONLY after a
          reclassify already committed successfully — the reclassification
          itself never depends on anything this panel does, and dismissing
          it (or a failed pattern creation, see `OfrecerPatronControl`'s own
          docblock) leaves that commit completely untouched. Not an
          `InlineConfirm`/alertdialog: this is a low-stakes, non-blocking
          offer, not a destructive/money-moving confirmation, so it must NOT
          steal focus on mount (a11y) — it just becomes reachable in the
          natural tab order right after this row's own controls. */}
      {ofrecerPatron && (
        <div className="absolute top-full right-0 z-20 mt-1 w-72 max-w-[90vw]">
          <OfrecerPatronControl
            descripcion={descripcion}
            categoriaId={ofrecerPatron.categoriaId}
            onCreado={(patron) => {
              setOfrecerPatron(null);
              onPatronCreado?.(patron);
            }}
            onCerrar={() => setOfrecerPatron(null)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * CrearCategoriaDesdeSelector — the bucket-picker shell `ReclasificarCategoriaControl`
 * opens from its own "+" (issue #744, see that component's JSDoc). Unlike
 * `NuevaCategoriaDesdeFilaForm`'s other two callers (`FilaRevision`,
 * `AgregarCategoriaControl`), the bucket here is NOT fixed — the exact
 * usability finding this issue fixes was wanting a category in a bucket
 * OTHER than the row's own. `bucket` starts at `bucketInicial` (the row's
 * current bucket, the single most likely pick) and is a plain editable
 * `CampoSelect`; `NuevaCategoriaDesdeFilaForm` itself is reused byte-for-byte
 * underneath, unaware that its `bucket` prop can now change out from under
 * it between renders (it only reads `bucket` at submit time).
 */
function CrearCategoriaDesdeSelector({
  bucketInicial,
  onCancelar,
  onCreada,
}: {
  readonly bucketInicial: string;
  readonly onCancelar: () => void;
  readonly onCreada: (categoria: CategoriaDto) => void;
}) {
  const [bucket, setBucket] = useState(bucketInicial);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 shadow-md">
      {/* `srOnly`: `NuevaCategoriaDesdeFilaForm` below already shows a
          visible "Bucket" caption that mirrors this select's live value
          (it re-renders with whatever `bucket` this shell passes it) — a
          second visible "Bucket" caption right above it would be
          redundant. The accessible name stays "Bucket" either way
          (`getByLabelText('Bucket')`, `CampoSelect`'s `srOnly` still nests
          the text inside the wrapping `<label>`). */}
      <CampoSelect
        label="Grupo"
        srOnly
        value={bucket}
        onChange={setBucket}
        options={construirOpcionesBucket(BUCKETS_ASIGNABLES)}
      />
      <NuevaCategoriaDesdeFilaForm
        bucket={bucket}
        descripcionFila=""
        esDemo={false}
        onCancelar={onCancelar}
        onCreada={onCreada}
      />
    </div>
  );
}
