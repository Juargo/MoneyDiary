import { createFileRoute } from '@tanstack/react-router';
import { CategoriasPanel } from '@/components/configuracion/categorias/CategoriasPanel';

/**
 * `/configuracion/categorias` — CA-01 list leaf, sibling of the Perfil index
 * leaf, sharing `ConfiguracionLayout`'s tab chrome (US-043 design.md §1/Q1a).
 * `configuracion.categorias.tsx`, not `.index.tsx`: no virtual parent is
 * created here (Q1b) because the edit route lives on a different branch.
 *
 * PR #1a task 2's stub (`<p>Cargando…</p>`) is replaced here with the real
 * `CategoriasPanel` (PR #2 task 21, route-file TDD exception §5: the route
 * file itself stays thin and untested per `EditarCategoria.tsx:12-18`'s
 * precedent — `CategoriasPanel` owns the queries, the rendering and its own
 * tests).
 */
export const Route = createFileRoute(
  '/_authenticated/configuracion/categorias',
)({
  component: CategoriasRoute,
});

function CategoriasRoute() {
  return <CategoriasPanel />;
}
