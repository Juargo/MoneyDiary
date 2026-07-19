import { createFileRoute } from '@tanstack/react-router'
import { SubirCartola } from '@/components/SubirCartola'

export const Route = createFileRoute('/_authenticated/subir')({
  component: SubirCartolaRoute,
})

/**
 * Thin container (same reasoning as `routes/index.tsx` /
 * `routes/_authenticated/buckets.$bucket.tsx`): a `createFileRoute`
 * component needs a live router context to call `Route.useRouteContext()`,
 * which a unit test can't provide cheaply — so this file stays untested,
 * and `SubirCartola` (which owns the actual state machine + rendering)
 * carries the component tests, including CU-07's demo-nudge case.
 *
 * Deep-linkable route (design.md Decision 5, explore Approach B1) — no
 * modal, no focus-trap complexity. Reads `esDemo` from the SAME route
 * context `_authenticated.tsx` already populates (design.md Decision 6) —
 * no extra `fetchMe()` call here.
 */
function SubirCartolaRoute() {
  const { esDemo } = Route.useRouteContext()

  return <SubirCartola esDemo={esDemo} />
}
