import { createFileRoute } from '@tanstack/react-router';

/**
 * `/configuracion/categorias/:categoriaId` — CA-02 edit screen. The
 * TRAILING underscore on `configuracion_` is deliberate and load-bearing
 * (US-043 design.md §1/Q1b, verified against the installed
 * `@tanstack/router-generator@1.167.17` source):
 * `RoutePrefixMap.findParent` (`utils.js:24-35`) walks up the path trimming
 * at the last `/` and does an EXACT-segment `Map.get`, so `/configuracion_`
 * never matches the sibling `/configuracion` layout route and this route
 * parents directly off `_authenticated` instead — it renders its OWN
 * breadcrumb (Q1d), not the shared tab shell. `removeUnderscoresFromSegment`
 * (`utils.js:290-295`) strips the `_` back out of the matched/public URL, so
 * the browser-visible path is the clean `/configuracion/categorias/:id` —
 * do not "simplify" this filename by removing the underscore, that would
 * re-nest this route inside the tab layout it must escape.
 *
 * Placeholder for task 2 (route-file TDD exception, §5). PR #3b task 36
 * replaces this stub with the real `EditarCategoria`.
 */
export const Route = createFileRoute(
  '/_authenticated/configuracion_/categorias/$categoriaId',
)({
  component: EditarCategoriaRoute,
});

function EditarCategoriaRoute() {
  return <p>Cargando…</p>;
}
