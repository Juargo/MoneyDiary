import { createFileRoute } from '@tanstack/react-router';
import { EditarCategoria } from '@/components/configuracion/categorias/EditarCategoria';

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
 * Stays thin (§1/Q1f, `buckets.$bucket.tsx:12-18` precedent): only extracts
 * `categoriaId` from the URL params and hands off. `EditarCategoria` owns
 * the query, the four resolution states, the identity form, the
 * bucket-change confirmation, delete, and demo — all unit-tested in
 * `EditarCategoria.test.tsx`, none of which is cheaply testable through a
 * `createFileRoute` component.
 */
export const Route = createFileRoute(
  '/_authenticated/configuracion_/categorias/$categoriaId',
)({
  component: EditarCategoriaRoute,
});

function EditarCategoriaRoute() {
  const { categoriaId } = Route.useParams();
  return <EditarCategoria categoriaId={categoriaId} />;
}
