import { createFileRoute } from '@tanstack/react-router';
import { RegistrarMovimientoForm } from '@/components/RegistrarMovimientoForm';

export const Route = createFileRoute('/_authenticated/registrar')({
  component: RegistrarRoute,
});

/**
 * Thin container (D-12) — identical idiom to `routes/_authenticated/subir.tsx`:
 * a `createFileRoute` component needs a live router context to call
 * `Route.useRouteContext()`, which a unit test can't provide cheaply — so this
 * file stays untested, and `RegistrarMovimientoForm` carries all component tests.
 *
 * Reads `esDemo` from the authenticated route context (same `_authenticated.tsx:85`
 * population that `SubirCartola` uses) — no extra `fetchMe()` call here.
 */
function RegistrarRoute() {
  const { esDemo } = Route.useRouteContext();

  return <RegistrarMovimientoForm esDemo={esDemo} />;
}
