import { describe, expect, it } from 'vitest'
import { DASHBOARD_CARD_CLASS } from './dashboard-card'

// PR3 review follow-up (DRY): the Serene Finance card-wrapper string
// (`rounded-lg border border-border bg-card p-5 shadow-sm`) was repeated
// verbatim across ResumenScreen.tsx (x2) and ResumenAnual.tsx (x1). This
// single exported constant is now the ONE source of truth those three call
// sites compose with `cn()` — a future card-style change (radius, padding,
// shadow) touches ONE file instead of three (dry.md: "si esta regla cambia
// mañana, ¿cuántos archivos hay que editar? — respuesta correcta: 1").
//
// Deliberately NOT the shadcn `Card` primitive (`components/ui/card.tsx`):
// that component hardcodes `rounded-xl` + `py-6`/`px-6`, which would change
// the already-reviewed PR3 visual output — not a drop-in (kiss.md: prefer
// the smallest change that doesn't fight the existing design).
describe('DASHBOARD_CARD_CLASS', () => {
  it('is the exact Serene Finance card wrapper string used by the dashboard cards', () => {
    expect(DASHBOARD_CARD_CLASS).toBe('rounded-lg border border-border bg-card p-5 shadow-sm')
  })
})
