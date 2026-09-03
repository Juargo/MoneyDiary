import { describe, expect, it } from 'vitest';
import { DASHBOARD_CARD_CLASS } from './dashboard-card';

// PR3 review follow-up (DRY): the card-wrapper string was repeated verbatim
// across ResumenScreen.tsx (x2) and ResumenAnual.tsx (x1). This single
// exported constant is now the ONE source of truth those call sites compose
// with `cn()` — a future card-style change (radius, padding, shadow) touches
// ONE file instead of three (dry.md: "si esta regla cambia mañana, ¿cuántos
// archivos hay que editar? — respuesta correcta: 1"). The Tecno-Analítico
// restyle (2026-09-02) is exactly that: p-5 → p-4 and shadow-sm →
// shadow-none landed here, and every consumer followed for free.
//
// Deliberately NOT the shadcn `Card` primitive (`components/ui/card.tsx`):
// that component hardcodes `rounded-xl` + `py-6`/`px-6`, which would change
// the reviewed visual output — not a drop-in (kiss.md: prefer the smallest
// change that doesn't fight the existing design).
describe('DASHBOARD_CARD_CLASS', () => {
  it('is the exact Tecno-Analítico card wrapper string used by the dashboard cards', () => {
    expect(DASHBOARD_CARD_CLASS).toBe(
      'rounded-lg border border-border bg-card p-4 shadow-none',
    );
  });

  // "Sin sombras (shadow-none)" is a named characteristic of the north star,
  // not an incidental value — pin it so a future edit can't quietly
  // reintroduce elevation by dropping the utility rather than changing it.
  it('carries no elevation', () => {
    expect(DASHBOARD_CARD_CLASS).toContain('shadow-none');
    expect(DASHBOARD_CARD_CLASS).not.toMatch(/shadow-(sm|md|lg|xl)\b/);
  });
});
