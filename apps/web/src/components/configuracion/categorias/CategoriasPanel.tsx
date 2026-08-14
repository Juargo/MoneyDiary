import { useState } from 'react';
import { useCategorias } from '@/api/use-categorias';
import { useMe } from '@/api/use-me';
import {
  agruparPorBucket,
  type GrupoCategoriaPorBucket,
} from '@/domain/agrupar-categorias-por-bucket';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { Loading } from '../../states/Loading';
import { ErrorState } from '../../states/Error';
import { Empty } from '../../states/Empty';
import { CategoriaFila } from './CategoriaFila';
import { NuevaCategoriaForm } from './NuevaCategoriaForm';
import { MENSAJE_DEMO_CATALOGO } from './mensajes-catalogo';

/**
 * CategoriasPanel (US-043, design.md §1/Q4a/Q8c, WCTG-02, WCTG-03,
 * WCTG-11, WCTG-13): CA-01, la lista de sólo lectura — primer valor
 * visible del cambio.
 *
 * `useCategorias()` → `agruparPorBucket` (§1/Q4c) → un heading por grupo vía
 * `ETIQUETA_BUCKET` (A1: se envía/recibe `Deseos`, se muestra `Gustos`, una
 * sola fuente compartida con `CategoriaFila`/el futuro dropdown de
 * reclasificar) → filas vía `CategoriaFila`.
 *
 * El botón `Nueva categoría` (task 26, este PR) vive junto al título:
 * `aria-label` estable en todo ancho (jsdom no tiene viewport, así que
 * `getByRole('button', {name: 'Nueva categoría'})` funciona siempre — §8c),
 * texto visible que se acorta a `Nueva` bajo `lg` vía dos `<span>` (mismo
 * mecanismo de la frase del footer de abajo). Click abre `NuevaCategoriaForm`
 * en el tope de la lista (Q9a) y oculta el propio botón mientras el form
 * está abierto — `Cancelar` o un `201` exitoso lo vuelven a mostrar.
 *
 * El banner demo (`role="note"`, `MENSAJE_DEMO_CATALOGO`) se muestra solo
 * mientras el form de creación está cerrado (`!creando`) — el catálogo
 * sigue renderizando normalmente, de solo lectura (segundo escenario de
 * WCTG-11); el control que SÍ se deshabilita (el icono eliminar) vive dentro
 * de `CategoriaFila`. Cuando el form está abierto, `NuevaCategoriaForm` es
 * dueño exclusivo del banner (explica por qué SUS campos están
 * deshabilitados) — WCTG-11 pide un único `role="note"` en pantalla, así que
 * este banner y el del form son mutuamente excluyentes, nunca los dos a la
 * vez (judgment-day PR #336/#337, fix 3).
 *
 * La frase del footer (§1/Q8c) reutiliza el `lg` breakpoint que
 * `ConfiguracionLayout`/`ConfiguracionPage` ya usaban — sin tier nuevo
 * (CA-06, D-08) — con el mecanismo de dos `<span>` (uno `lg:hidden`, otro
 * `hidden lg:inline`) que también carga el botón `Nueva`/`Nueva categoría`
 * de PR #3a.
 *
 * **Draft survival on refetch failure (judgment-day PR #336/#337, fix 1):**
 * `['categorias']` refetches in the background (e.g. window refocus) even
 * while the form is open. An unconditional `if (query.isError) return
 * <ErrorState/>` here would unmount `NuevaCategoriaForm` on any such
 * failure and silently discard the user's in-progress `Nombre`/`Bucket`
 * draft — unrecoverable, since the form has no external persistence. The
 * guard below only takes the full-page early return while the form is
 * closed (`!creando`); while `creando` is true the form stays mounted and
 * the same `ErrorState` (still `role="alert"`, still perceivable) renders
 * inline above it instead.
 */
export function CategoriasPanel() {
  const query = useCategorias();
  const { data: me } = useMe();
  const esDemo = me?.esDemo ?? false;
  const [creando, setCreando] = useState(false);

  if (query.isPending) {
    return <Loading message="Cargando categorías…" />;
  }
  if (query.isError && !creando) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  let grupos: ReadonlyArray<GrupoCategoriaPorBucket> = [];
  if (!query.isError) {
    grupos = agruparPorBucket(query.data.categorias);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Categorías y patrones
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu catálogo propio: toda categoría pertenece a un bucket. Los
            patrones permiten la auto-categorización.
          </p>
        </div>
        {!creando && (
          <button
            type="button"
            aria-label="Nueva categoría"
            onClick={() => setCreando(true)}
            className="shrink-0 rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
          >
            <span className="lg:hidden">Nueva</span>
            <span className="hidden lg:inline">Nueva categoría</span>
          </button>
        )}
      </div>

      {esDemo && !creando && (
        <p role="note" className="text-sm text-slate-500">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}

      {query.isError && creando && (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      )}

      {creando && (
        <NuevaCategoriaForm
          esDemo={esDemo}
          onCerrar={() => setCreando(false)}
        />
      )}

      {!query.isError &&
        (grupos.length === 0 ? (
          <Empty
            title="Todavía no tienes categorías"
            description="Crea tu primera categoría para empezar a clasificar tus movimientos."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {grupos.map((grupo) => (
              <section key={grupo.bucket}>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  {ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket}
                </h3>
                <ul>
                  {grupo.categorias.map((categoria) => (
                    <CategoriaFila
                      key={categoria.id}
                      categoria={categoria}
                      esDemo={esDemo}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      <p className="text-xs text-muted-foreground">
        <span className="lg:hidden">
          Eliminar en uso: advertencia, transacciones a Sin categoría.
        </span>
        <span className="hidden lg:inline">
          Eliminar una categoría en uso muestra advertencia: sus transacciones
          pasan a Sin categoría.
        </span>
      </p>
    </div>
  );
}
