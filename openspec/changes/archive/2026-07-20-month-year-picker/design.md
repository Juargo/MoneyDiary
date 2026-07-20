# Design: month-year-picker

Frontend-only (`apps/web`). Builds on the just-merged `period-selector-header`
(PR #97). Extends the dashboard period control so the month label opens a
popover with a month grid + in-popover year navigation, enabling a direct
(year, month) jump in one interaction. Prev/next arrows + "Hoy" stay verbatim.
External `{ periodo, onChange }` contract of `PeriodoSelector` is unchanged.

## Technical Approach

The label `<span>` in `PeriodoSelector.tsx` becomes a `PopoverTrigger` button.
A new shadcn-pattern `components/ui/popover.tsx` wraps `radix-ui`'s Popover
(no new dependency — the umbrella `radix-ui` ^1.6.2 is already installed and
`button.tsx` already imports `Slot` from it). A new presentational
`components/MonthYearPicker.tsx` renders the grid + year nav and reports a
chosen `YYYY-MM` upward. Two new pure helpers land in `periodo-anual.ts`
(unit-tested FIRST — strict TDD): compose `(anio, mes)` → `YYYY-MM`, and a
future predicate driving the grid/year clamp. `PeriodoSelector` owns the
popover `open` state and closes it on selection; it keeps computing "now" once
(`const ahora = new Date()`) and passes the derived current period **string**
down, so no component reads `Date` in render except that single injection
point. No `apps/api` import; period stays a hand-written `YYYY-MM` string.

## Architecture Decisions

### D1 — Popover primitive: wrap the `radix-ui` umbrella, NO new dependency
`components/ui/popover.tsx` follows the canonical shadcn new-york structure but
imports from the **umbrella** package exactly like `button.tsx`
(`import { Popover as PopoverPrimitive } from "radix-ui"`, then
`PopoverPrimitive.Root` / `.Trigger` / `.Portal` / `.Content` / `.Anchor`).
Radix gives focus trap, escape-to-close, focus-return-on-close, and correct
`aria-haspopup`/`aria-expanded` out of the box (WCAG 2.2 AA, ADR-018).
Rejected: adding `@radix-ui/react-popover` (redundant supply-chain surface vs
ADR-006 — the umbrella already ships it) and hand-rolling a11y (re-implements a
focus trap that Radix already solves correctly). Export `Popover`,
`PopoverTrigger`, `PopoverContent`, `PopoverAnchor`.

`PopoverContent` token classes (Serene tokens confirmed present in
`index.css`): `z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none`,
rendered inside `PopoverPrimitive.Portal` with `align="center"` and
`sideOffset={8}`. **No `animate-in`/`animate-out` utilities** — the project has
no `tailwindcss-animate`/`tw-animate-css` plugin (`index.css` imports only
`tailwindcss`), so those classes would be dead. KISS: the popover shows/hides
without CSS animation, fully functional and accessible. Documented deviation
from stock shadcn.

### D2 — Two new pure helpers in `periodo-anual.ts` (colocated, TDD first)
- `periodoDesde(anio: number, mes1a12: number): string` — composes a
  zero-padded `YYYY-MM`. Implemented by reusing the existing private
  `formatearPeriodo(anio, mes)` (1-based month, already zero-pads). Exported as
  the public name so callers don't reach into a private. The grid iterates
  `mesIndex` 0..11 and calls `periodoDesde(anioMostrado, mesIndex + 1)`.
- `esPeriodoFuturo(periodo: string, ahora: Date): boolean` — returns
  `periodo > periodoActualUTC(ahora)`. Zero-padded `YYYY-MM` strings compare
  lexicographically = chronologically, so this is a pure string comparison, no
  `Date` math (same TZ-safe discipline as `mesAnterior`/`mesSiguiente`). Drives
  BOTH the per-cell grid clamp and the next-year-nav clamp. `ahora` injected
  for deterministic tests.

Colocated in the existing file (new file = YAGNI). Rejected `new Date(y, m)`
(reintroduces TZ risk) and inline component logic (untestable without a Date in
the component). Current year for the year-nav clamp reuses the existing
`anioDePeriodo(periodoActualUTC(ahora), 0)` — no extra helper.

### D3 — `MonthYearPicker` as a separate presentational component
`components/MonthYearPicker.tsx` (separate file, not inlined — the grid + year
nav + its own `anioMostrado` state is enough surface to isolate and test in
RTL without a popover/router harness). Props:

```ts
{
  readonly periodo: string        // currently viewed period → active cell + initial displayed year
  readonly periodoActual: string  // current UTC month (single Date injection is upstream) → future clamp
  readonly onSelect: (periodo: string) => void  // chosen YYYY-MM; parent applies it and closes the popover
}
```

Internal state — the **displayed** year, distinct from the selected period:
`const [anioMostrado, setAnioMostrado] = useState(() => anioDePeriodo(periodo, anioDePeriodo(periodoActual, 0)))`.
It initializes from the viewed period's year but is navigated independently
(‹ prev-year | anioMostrado | next-year ›) without changing the selection.
Selecting a month cell composes `periodoDesde(anioMostrado, mesIndex + 1)` and
calls `onSelect(...)` — it does NOT mutate `anioMostrado`. A cell is **active**
(shows selected state) when `periodoDesde(anioMostrado, mes) === periodo`, so
the active highlight only appears while the displayed year matches the
selection's year. A cell is **disabled** when
`esPeriodoFuturo(periodoDesde(anioMostrado, mes), periodoActual-as-Date)` — but
since the predicate takes a `Date`, the picker instead compares strings
directly: `periodoDesde(anioMostrado, mes) > periodoActual`. (To keep ONE
future rule, `esPeriodoFuturo` is used at the `PeriodoSelector`/helper boundary
and the picker uses the same `> periodoActual` string comparison internally —
identical semantics, no Date in the picker.) Next-year nav disabled when
`anioMostrado >= anioDePeriodo(periodoActual, 0)`; prev-year always enabled.

### D4 — Wiring into `PeriodoSelector`, external contract frozen
`PeriodoSelector` keeps `{ periodo: string | undefined; onChange: (p: string) => void }`
verbatim (no container/`useResumen`/bucket-reset churn). It computes
`const ahora = new Date()` once, `const efectivo = periodo ?? periodoActualUTC(ahora)`,
`const periodoActual = periodoActualUTC(ahora)` — the single Date read. Adds
`const [abierto, setAbierto] = useState(false)`. The label becomes:

```
<Popover open={abierto} onOpenChange={setAbierto}>
  <PopoverTrigger asChild>
    <Button variant="ghost" aria-label={`Cambiar mes y año, actualmente ${mesCompletoLabel(efectivo)}`}
            className="text-xl font-semibold text-foreground">
      {mesCompletoLabel(efectivo)}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <MonthYearPicker
      periodo={efectivo}
      periodoActual={periodoActual}
      onSelect={(p) => { onChange(p); setAbierto(false) }} />
  </PopoverContent>
</Popover>
```

Arrows (`mesAnterior`/`mesSiguiente`) and "Hoy" (`periodoActualUTC(ahora)`)
plus their `esMesActual` clamp are unchanged. Selecting a month applies via the
existing `onChange` and closes the popover.

## Data Flow

```
click label ──▶ Popover opens (Radix focus mgmt)
  MonthYearPicker(periodo=efectivo, periodoActual)
    year nav ‹/›  ─▶ setAnioMostrado (local only, no onChange)
    month cell    ─▶ periodoDesde(anioMostrado, mes) ─▶ onSelect
                    ─▶ PeriodoSelector: onChange(YYYY-MM) + setAbierto(false)
                    ─▶ existing container navigate({search:{periodo}}) ─▶ URL param
                    ─▶ useResumen ─▶ ResumenScreen ─▶ bucket-reset effect (unchanged)
arrows / Hoy ─▶ mesAnterior/mesSiguiente/periodoActualUTC ─▶ onChange (unchanged)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/domain/periodo-anual.ts` | Modify | Export `periodoDesde(anio, mes1a12)` (reuse `formatearPeriodo`) + `esPeriodoFuturo(periodo, ahora)` |
| `apps/web/src/domain/periodo-anual.test.ts` | Modify | Unit tests FIRST: composition + zero-pad; future predicate true/false/equal |
| `apps/web/src/components/ui/popover.tsx` | Create | shadcn Popover over `radix-ui` umbrella; Serene tokens; no animate utils |
| `apps/web/src/components/MonthYearPicker.tsx` | Create | Month grid (`grid-cols-3`) + year nav; `anioMostrado` state; active/disabled clamp |
| `apps/web/src/components/MonthYearPicker.test.tsx` | Create | RTL: 12 months, active marked, select past → onSelect arg, future disabled, next-year disabled at current year, escape/kbd |
| `apps/web/src/components/PeriodoSelector.tsx` | Modify | Label → PopoverTrigger; owns `open` state; renders picker; arrows/Hoy/contract unchanged |
| `apps/web/src/components/PeriodoSelector.test.tsx` | Modify | Integration: clicking label opens popover; arrows/Hoy still work |

## Interfaces

```ts
// periodo-anual.ts — pure, never throw, YYYY-MM strings, no Date arithmetic
export function periodoDesde(anio: number, mes1a12: number): string   // (2027, 3) -> "2027-03"
export function esPeriodoFuturo(periodo: string, ahora: Date): boolean // "2026-08" vs now "2026-07" -> true

// MonthYearPicker.tsx
{ readonly periodo: string; readonly periodoActual: string; readonly onSelect: (periodo: string) => void }

// ui/popover.tsx exports
Popover, PopoverTrigger, PopoverContent, PopoverAnchor

// PeriodoSelector.tsx — UNCHANGED external contract
{ readonly periodo: string | undefined; readonly onChange: (periodo: string) => void }
```

## Styling (Serene tokens only — all confirmed in `index.css`)

- Popover surface: `bg-popover text-popover-foreground border rounded-md shadow-md p-4 w-72`.
- Month grid: `grid grid-cols-3 gap-2`. Cell = `<Button variant="ghost" size="sm">` with `mesAbreviado` text.
  - Active month: `variant="default"` (`bg-primary text-primary-foreground`) to read as selected (strong tone = text-safe, respects the two-tier color rule; pastel bucket colors are NOT used here).
  - Default/hover: ghost (`hover:bg-accent hover:text-accent-foreground`).
  - Disabled (future): native `disabled` → Button's `disabled:opacity-50 disabled:pointer-events-none`.
- Year-nav row: `flex items-center justify-between`. Prev/next = `<Button variant="ghost" size="icon-sm">` + lucide `ChevronLeft`/`ChevronRight` (already a dep). Year label = `<span className="text-sm font-semibold text-foreground" aria-live="polite">`.
- Focus ring inherited from `Button` (`focus-visible:ring-ring/50`), `--ring` = `#1a1c1c` (>=3:1 on any surface).

## A11y (Spanish, WCAG 2.2 AA — ADR-018)

- Trigger: real `<button>` via `PopoverTrigger asChild` on `Button`; Radix adds
  `aria-haspopup="dialog"` + `aria-expanded`/`data-state`. Explicit
  `aria-label="Cambiar mes y año, actualmente {mesCompletoLabel}"` names its purpose.
- Grid cells: real `<button>`s; visible `mesAbreviado`, full
  `aria-label={mesCompletoLabel(periodoDesde(anioMostrado, mes))}` (e.g. "julio
  2026"); active cell marked `aria-pressed={true}`; future cells native
  `disabled` (implicit `aria-disabled`).
- Year nav: `aria-label` "Año anterior"/"Año siguiente"; year value in an
  `aria-live="polite"` span so navigation is announced.
- Focus trap, escape-to-close, and focus-return-to-trigger on close are Radix
  defaults (confirmed behavior of `radix-ui` Popover) — no custom handling.

## Testing Strategy (STRICT TDD — vitest + Testing Library)

Order (tests FIRST):
1. `periodo-anual.test.ts` — `periodoDesde` composition + zero-pad (single-digit
   month, boundary Dec); `esPeriodoFuturo` true (next month), false (prev
   month), false (equal). Injected `ahora`, no clock mocking.
2. `MonthYearPicker.test.tsx` — props-only (`periodo` + `periodoActual`
   strings), **no fake timers needed** since Date is injected as a string:
   renders 12 month buttons; active month has `aria-pressed`; clicking a past
   month calls `onSelect` with the right `YYYY-MM`; a future month button is
   `disabled`; next-year nav disabled when displayed year === current year,
   prev-year enabled; clicking prev-year re-renders the grid for the new year;
   Escape/keyboard handled by Radix at the popover layer (asserted in the
   integration test, not here).
3. `PeriodoSelector.test.tsx` (add to existing) — integration with fake timers +
   `fireEvent` (existing convention: `userEvent` async click hangs under fake
   timers): clicking the label opens the popover and shows the grid; selecting a
   month fires `onChange` with the composed `YYYY-MM` and closes; prev/next/Hoy
   and their clamp still behave as today.

**jsdom + Radix gotcha:** Radix Popover may call
`Element.prototype.hasPointerCapture` / `scrollIntoView`, which jsdom does not
implement. If the integration test errors on open, add a small shim in the web
test setup (`vi.fn()` stubs for those prototype methods) — do NOT switch to
`userEvent`. Documented so `sdd-apply` doesn't rediscover it.

## Size & Slicing

**Medium**, estimated ~350–400 changed lines (popover ~40, picker ~70, picker
test ~120, helper +tests ~55, PeriodoSelector +test ~60). It sits right at the
400-line budget. Recommendation: ship as a **single PR** with `size:exception`
readiness. If the budget must hold, the clean slice boundary is:

- **Slice 1** — pure helpers (`periodoDesde`, `esPeriodoFuturo`) + tests +
  `ui/popover.tsx` + `MonthYearPicker.tsx` + its RTL tests. Self-contained,
  unwired, fully tested; nothing renders it yet.
- **Slice 2** — wire the label into `PeriodoSelector` (popover trigger + open
  state) + the integration test. Small, user-visible.

Slice 1 has no user-facing effect, so if delivered stacked, Slice 2 is what
"turns it on".

## Constraints Honored

- No `apps/api` import; period stays a `YYYY-MM` string. TS strict, no `any`.
- KISS/YAGNI: no day granularity, no ranges, no date library, no animate plugin,
  no speculative abstraction. Single Date injection point.
- Serene tokens only (two-tier color rule respected: strong `--primary` for the
  selected cell, never a pastel-on-light).

## Open Questions

None. Future-clamp direction is locked (mirror the existing next-arrow clamp:
future months disabled in the grid, next-year disabled at the current year).
