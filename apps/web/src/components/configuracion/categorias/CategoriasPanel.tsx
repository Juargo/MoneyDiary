import { useCategorias } from '@/api/use-categorias';
import { useMe } from '@/api/use-me';
import { agruparPorBucket } from '@/domain/agrupar-categorias-por-bucket';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { Loading } from '../../states/Loading';
import { ErrorState } from '../../states/Error';
import { Empty } from '../../states/Empty';
import { CategoriaFila } from './CategoriaFila';
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
 * El botón `Nueva categoría` NO vive acá — PR #3a (task 26) lo agrega junto
 * con `NuevaCategoriaForm` para que nunca exista un botón muerto
 * (design.md's tasks.md task 20 nota explícita).
 *
 * El banner demo (`role="note"`, `MENSAJE_DEMO_CATALOGO`) es la única
 * diferencia visible para una sesión demo en esta pantalla — el catálogo
 * sigue renderizando normalmente, de solo lectura (segundo escenario de
 * WCTG-11); el control que SÍ se deshabilita (el icono eliminar) vive dentro
 * de `CategoriaFila`.
 *
 * La frase del footer (§1/Q8c) reutiliza el `lg` breakpoint que
 * `ConfiguracionLayout`/`ConfiguracionPage` ya usaban — sin tier nuevo
 * (CA-06, D-08) — con el mecanismo de dos `<span>` (uno `lg:hidden`, otro
 * `hidden lg:inline`) que también carga el botón `Nueva`/`Nueva categoría`
 * de PR #3a.
 */
export function CategoriasPanel() {
  const query = useCategorias();
  const { data: me } = useMe();
  const esDemo = me?.esDemo ?? false;

  if (query.isPending) {
    return <Loading message="Cargando categorías…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const grupos = agruparPorBucket(query.data.categorias);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Categorías y patrones
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu catálogo propio: toda categoría pertenece a un bucket. Los patrones
          permiten la auto-categorización.
        </p>
      </div>

      {esDemo && (
        <p role="note" className="text-sm text-slate-500">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}

      {grupos.length === 0 ? (
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
      )}

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
