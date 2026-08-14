import { createFileRoute } from '@tanstack/react-router';

/**
 * `/configuracion/categorias` — CA-01 list leaf, sibling of the Perfil index
 * leaf, sharing `ConfiguracionLayout`'s tab chrome (US-043 design.md §1/Q1a).
 * `configuracion.categorias.tsx`, not `.index.tsx`: no virtual parent is
 * created here (Q1b) because the edit route lives on a different branch.
 *
 * Placeholder for task 2 (route-file TDD exception, §5). PR #2 task 21
 * replaces this stub with the real `CategoriasPanel`.
 */
export const Route = createFileRoute(
  '/_authenticated/configuracion/categorias',
)({
  component: CategoriasRoute,
});

function CategoriasRoute() {
  return <p>Cargando…</p>;
}
