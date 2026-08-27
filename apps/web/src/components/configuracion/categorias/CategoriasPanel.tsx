import { useRef, useState } from 'react';
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
import { EtiquetaResponsiva } from '../EtiquetaResponsiva';
import { CategoriaFila } from './CategoriaFila';
import { NuevaCategoriaForm } from './NuevaCategoriaForm';
import {
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';
import { Button } from '@/components/ui/button';

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
 *
 * **Focus on successful row delete (judgment-day ROUND 1, WARNING, WCAG
 * 2.4.3):** `CategoriaFila`'s delete confirms via `ConfirmarImpactoDialog`,
 * which moves focus to its own confirm button on mount and hands focus
 * restoration to the caller. The row itself disappears on success (the
 * mutation's own profile-B `['categorias']` refetch), so its trigger cannot
 * be the restore target — this panel's `Categorías y patrones` heading is,
 * `tabIndex={-1}` so it is programmatically focusable without joining the
 * Tab order (the conventional pattern for "the item you acted on is gone").
 * The same handler also announces the deletion via a `role="status"` live
 * region OUTSIDE the row list, reusing `PatronesSection`'s exact idiom
 * (survives the announced row's own unmount) rather than inventing a
 * second notification mechanism.
 *
 * **Visible focus ring (judgment-day ROUND 2, issue 1, WARNING, both
 * judges, WCAG 2.4.7):** round 1's fix moved focus here but the heading
 * carried `focus:outline-none` with NO replacement — on every successful
 * delete (the normal path, not an edge case) a sighted keyboard user got
 * zero visual indication focus moved at all. The heading now reuses the
 * exact `focus-visible:outline focus-visible:outline-2
 * focus-visible:outline-ring` class this repo already uses for every other
 * `tabIndex={-1}` focus-restore target (`ListaIngestas.tsx`,
 * `SubirCartola.tsx`) instead of inventing a fourth visible-focus
 * treatment. Deliberately NOT extracted into a shared helper on this touch
 * (`dry` skill's three-strikes rule — `ListaIngestas.tsx` is the only other
 * occurrence of the full "focus-restore heading + sr-only live region"
 * idiom; a second occurrence is a note, not yet a extraction trigger).
 *
 * **Heading survives a post-delete refetch failure (judgment-day ROUND 2,
 * issue 2, WARNING, both judges):** the SAME successful delete that focuses
 * `tituloRef` above also triggers profile B's background refetch of
 * `['categorias']`. An ordinary network flake on that refetch (realistic on
 * this stack — Render cold starts, ADR-023) would hit the unconditional
 * `if (query.isError && !creando) return <ErrorState/>` below and unmount
 * the entire panel, including the just-focused heading — focus drops
 * silently to `<body>` and the user is never told the delete itself
 * succeeded. This is the SAME mechanism as the draft-survival guard
 * documented above (an unconditional full-page early return destroying
 * state that must survive), so it reuses the SAME shape: `eliminadoRecientemente`
 * joins `creando` in both the early return's negative guard and the inline
 * `ErrorState` condition below, so a post-delete refetch failure renders the
 * SAME inline, still-perceivable `ErrorState` the draft-survival case
 * already uses — the heading (and its focus) stays mounted instead of being
 * torn down.
 *
 * **`eliminadoRecientemente` is derived, not a latch (judgment-day PR #5,
 * WARNING, both judges):** the guard protects THIS delete's OWN refetch
 * settling, not "any query failure for the rest of the panel's lifetime". A
 * boolean flipped `true` in `manejarEliminado` and never reset would widen
 * that scope silently — after the FIRST delete, every later, unrelated
 * `['categorias']` failure (e.g. a window-refocus refetch hours later —
 * `QUERY_CLIENT_DEFAULTS` doesn't set `refetchOnWindowFocus`, so TanStack's
 * default `true` applies) would keep taking the softened inline path
 * instead of the full-page one. Resetting on `query.isSuccess` via a
 * `useEffect` doesn't work either: at the moment `manejarEliminado` runs,
 * `query` is still holding the PREVIOUS successful data (this delete's own
 * refetch hasn't started), so `isSuccess` is already `true` and an effect
 * keyed on it would clear the guard immediately — re-arming the full-page
 * early return inside the exact window it exists to protect. Instead the
 * state is self-clearing by construction: `manejarEliminado` snapshots
 * `query.dataUpdatedAt` (the timestamp of the query's last SUCCESSFUL
 * fetch), and `eliminadoRecientemente` is simply "that snapshot hasn't
 * advanced yet". `dataUpdatedAt` only moves forward on a fetch that
 * SUCCEEDS, so: a failed refetch leaves it unchanged (guard still active,
 * ROUND 2 behaviour preserved); the delete's own refetch succeeding moves it
 * forward (guard clears itself, no effect needed); and any LATER, unrelated
 * failure after that point sees an already-advanced snapshot and correctly
 * falls through to the full-page `ErrorState` — the ratchet is gone.
 *
 * **`Nueva categoría` button hidden during the inline error path (judgment-
 * day PR #5, SUGGESTION, Judge B):** the button's visibility only checked
 * `!creando`, so while `eliminadoRecientemente` alone keeps the inline
 * `ErrorState` up (catalog genuinely failing, form closed) the button stayed
 * clickable — `NuevaCategoriaForm` doesn't depend on `query.data` so nothing
 * breaks, but offering "create" while the catalog fetch is failing is
 * confusing. The button's guard now also excludes that state.
 *
 * **US-063 PR #3 (D-03/D-04, WCTM-02/WCTM-03/WCTM-06):** the header goes
 * `flex-col md:flex-row` — below `md` the title block stacks above a
 * full-width (`w-full md:w-auto`) `Nueva categoría` button, which is already
 * positioned below `ConfiguracionTabs` by the shared grid's DOM order
 * (`ConfiguracionLayout.tsx`), completing `WCTM-02`. The button's own label
 * and the subtitle's omission below `md` both go through `EtiquetaResponsiva`
 * (D-03) — the button keeps `aria-label="Nueva categoría"` (D-04, unchanged
 * from US-043 Q8c: a stable name across a THREE-way, non-monotonic swap now,
 * not just two). The subtitle is `hidden md:block` — an absence, not a copy
 * variant (D-03's note on why the subtitle does not use the helper). The
 * footer note now carries all THREE genuinely distinct `WCTM-06` strings via
 * `EtiquetaResponsiva`, still a non-interactive `<p>` — D-04's `aria-label`
 * rule does not apply to it; its test queries each variant string directly,
 * never the paragraph's `textContent` (which in jsdom is all three variants
 * concatenated).
 */
export function CategoriasPanel() {
  const query = useCategorias();
  const { data: me } = useMe();
  const esDemo = me?.esDemo ?? false;
  const [creando, setCreando] = useState(false);
  const [anuncio, setAnuncio] = useState({ mensaje: '', id: 0 });
  // Ver docstring "`eliminadoRecientemente` is derived, not a latch" arriba:
  // snapshot de `query.dataUpdatedAt` en el momento del delete — NO un
  // booleano que haya que recordar resetear.
  const [dataUpdatedAtAlEliminar, setDataUpdatedAtAlEliminar] = useState<
    number | null
  >(null);
  const eliminadoRecientemente =
    dataUpdatedAtAlEliminar !== null &&
    query.dataUpdatedAt === dataUpdatedAtAlEliminar;
  const tituloRef = useRef<HTMLHeadingElement>(null);

  function manejarEliminado(nombre: string) {
    setAnuncio((actual) => ({
      mensaje: `Categoría «${nombre}» eliminada.`,
      id: actual.id + 1,
    }));
    setDataUpdatedAtAlEliminar(query.dataUpdatedAt);
    tituloRef.current?.focus();
  }

  const formularioOEliminadoReciente = creando || eliminadoRecientemente;

  if (query.isPending) {
    return <Loading message="Cargando categorías…" />;
  }
  if (query.isError && !formularioOEliminadoReciente) {
    return (
      <ErrorState
        error={query.error}
        mensaje={mensajeDeErrorCatalogo(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  }

  let grupos: ReadonlyArray<GrupoCategoriaPorBucket> = [];
  if (!query.isError) {
    grupos = agruparPorBucket(query.data.categorias);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:flex-wrap">
        <div>
          <h2
            ref={tituloRef}
            tabIndex={-1}
            className="text-xl font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Categorías y patrones
          </h2>
          <p className="mt-1 hidden text-sm text-muted-foreground md:block">
            Tu catálogo propio: toda categoría pertenece a un bucket. Los
            patrones permiten la auto-categorización.
          </p>
        </div>
        {!creando && !(query.isError && eliminadoRecientemente) && (
          <Button
            type="button"
            aria-label="Nueva categoría"
            onClick={() => setCreando(true)}
            className="w-full shrink-0 md:w-auto"
          >
            <EtiquetaResponsiva
              movil="Nueva categoría"
              tablet="Nueva"
              escritorio="Nueva categoría"
            />
          </Button>
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        <span key={anuncio.id}>{anuncio.mensaje}</span>
      </span>

      {esDemo && !creando && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}

      {query.isError && formularioOEliminadoReciente && (
        <ErrorState
          error={query.error}
          mensaje={mensajeDeErrorCatalogo(query.error)}
          onRetry={() => query.refetch()}
        />
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
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket}
                </h3>
                <ul>
                  {grupo.categorias.map((categoria) => (
                    <CategoriaFila
                      key={categoria.id}
                      categoria={categoria}
                      esDemo={esDemo}
                      onEliminado={manejarEliminado}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      <p className="text-xs text-muted-foreground">
        <EtiquetaResponsiva
          movil="Toca una categoría para editarla o eliminarla."
          tablet="Eliminar en uso: advertencia, transacciones a Sin categoría."
          escritorio="Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría."
        />
      </p>
    </div>
  );
}
