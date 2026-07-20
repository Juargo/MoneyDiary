# Proposal: period-selector-header

## Why (problem / why now)

On the web dashboard the MES/AÑO being viewed is not clearly visible, and the control to change it is under-styled and easy to miss. The existing `PeriodoSelector` is a bare native `<input type="month">` styled with raw Tailwind slate classes (not Serene Finance tokens), tucked into a low-prominence `flex justify-end` slot above the loading/error/data switch (`ResumenPage.tsx:32-38`, `PeriodoSelector.tsx:9-30`). Users cannot tell at a glance which month's finances they are looking at, and the period control does not match the Sprint 9 Serene Finance identity. This affects BOTH demo and authenticated users, since they share one route tree and one component set.

Now is the right time: the architecture is already ~80% correct (URL search-param state + one shared `onPeriodoChange` callback), so this is a focused UX/visual rework, not a re-architecture.

## What Changes

- Replace the native `<input type="month">` inside `PeriodoSelector.tsx` with a header block: prev/next arrow buttons ( ‹ › ) flanking a large, prominently formatted period label ("julio 2026"), plus a small "Hoy" affordance to jump to the current month.
- Reuse existing building blocks — no new shadcn primitives: `Button` (`variant="ghost" size="icon-sm"` for arrows) and the Spanish period-formatting helpers in `apps/web/src/domain/periodo-anual.ts` (`mesCompletoLabel` for the label, `periodoActualUTC` for "Hoy"). Prev/next need month-arithmetic on a `YYYY-MM` string — either a tiny new helper (`periodoAnterior`/`periodoSiguiente`) alongside the existing ones, or inline.
- Reposition the control to a visually prominent slot at the TOP of `ResumenPage`, upgraded from a right-aligned box to a prominent header row — satisfying "en la parte superior debe verse claramente" for demo and auth automatically via the shared route.
- Migrate the control to Serene Finance design tokens (`--color-primary`, `--color-muted`, `--color-border`, etc.), removing this control's raw-Tailwind debt.
- Keep the prop contract `{ periodo, onChange }` unchanged so no route/container wiring changes are needed; state stays as the URL search param on `/_authenticated/` (shareable, identical for demo/auth, back-button friendly). No new store.
- Accessibility: prev/next/Hoy are real `<button>`s with Spanish accessible labels (e.g. "Mes anterior", "Mes siguiente", "Ir al mes actual"); WCAG 2.2 AA per ADR-018.

## Scope

### In
- Restyle + reposition the period selector; migrate it to Serene Finance tokens.
- Prev/next month arrows + prominent formatted label + "Hoy" shortcut.
- Accessible labels for the new interactive controls.
- Optional tiny period-arithmetic helper in `periodo-anual.ts` if needed for prev/next.

### Out (explicit non-goals)
- DemoBanner raw-Tailwind → token cleanup (stays as separate pre-existing debt, tracked like `SubirCartola.tsx`).
- New shadcn primitives (Select / Popover / DropdownMenu / Calendar).
- Year-level navigation as a dedicated control (the `ResumenAnual` grid already lets users click any month in the year for direct jumps).
- Any backend change — `GET /api/resumen?periodo=YYYY-MM` already supports this.
- Moving period state to Zustand / local state.

## Impact

- Files likely touched: `apps/web/src/components/PeriodoSelector.tsx` (rewrite the control), `apps/web/src/components/ResumenPage.tsx` (reposition/promote the slot). Possibly a small formatting/arithmetic helper added to `apps/web/src/domain/periodo-anual.ts`.
- No route, container, or DTO changes (`_authenticated/index.tsx`, `useResumen`, `ResumenScreen`, `ResumenAnual` untouched in contract). `onPeriodoChange` threading is preserved.
- Demo and authenticated flows both benefit with zero duplication (one shared component/route).

## Risks & Mitigations

- **Bucket-selection-reset invariant**: `ResumenScreen` resets a manually-selected bucket when `viewModel.periodo` changes (`ResumenScreen.tsx:87-89`). Mitigation: keep changing period exclusively through the same `onPeriodoChange` → URL param path; do not introduce a parallel state source. The effect keeps firing unchanged.
- **Token consistency**: risk of reintroducing raw Tailwind. Mitigation: use only Serene Finance tokens from `index.css`; treat token usage as an acceptance criterion.
- **Accessibility regression**: replacing a native month input (which has built-in a11y) with custom buttons. Mitigation: real `<button>` elements with explicit Spanish `aria-label`s, keyboard-focusable, visible focus ring; WCAG 2.2 AA (ADR-018).
- **Frontend/domain boundary**: do not import from `apps/api/src/domain`; period is a hand-written string DTO handled by `apps/web/src/domain/periodo*` helpers only.

## Open question (do not over-engineer)

- **Future-period bound**: should prev/next be allowed to advance past the current month into arbitrary future periods? Backend resolves absent/invalid periods to the current month, so a distant future period would show empty/degraded data. KISS/YAGNI: either leave unbounded (simplest) or clamp "next" at `periodoActualUTC()` if trivial. Flagged for spec/design to decide; not a blocker.

## First slice (single tight PR, well under 400-line budget)

Rewrite `PeriodoSelector.tsx` in place as a Serene-token prev/next-arrows + formatted-label + "Hoy" header control, and promote its slot to a prominent top-of-page header row in `ResumenPage.tsx`. Same `{ periodo, onChange }` contract, no backend, no new primitives. This alone delivers the visible-period + change-period requirement for both demo and auth.
