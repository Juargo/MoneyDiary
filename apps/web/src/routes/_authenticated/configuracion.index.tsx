import { createFileRoute } from '@tanstack/react-router';

/**
 * `/configuracion` (index leaf) — Perfil's landing (US-043 design.md §1/Q1a).
 * Placeholder for task 2 (route-file TDD exception, §5): task 7 moves the
 * `?google=` capture/cleanup effect here from `configuracion.tsx` and
 * renders `PerfilPanel`.
 */
export const Route = createFileRoute('/_authenticated/configuracion/')({
  component: PerfilRoute,
});

function PerfilRoute() {
  return <p>Cargando…</p>;
}
