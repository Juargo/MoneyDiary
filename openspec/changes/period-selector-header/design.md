# Design: period-selector-header

## Technical Approach

Rewrite `PeriodoSelector.tsx` in place as a Serene-token header: prev/next chevron
`Button`s flanking a prominent formatted month label, plus a "Hoy" shortcut. Month
arithmetic lives in pure, UTC-safe string helpers added to `periodo-anual.ts`
(unit-tested FIRST, strict TDD). The `{ periodo, onChange }` prop contract is kept
verbatim, so `ResumenPage`/`ResumenScreen` wiring and the bucket-reset effect
(`ResumenScreen.tsx:87-89`) are untouched — period still flows through the existing
`onPeriodoChange` → URL search-param path. `ResumenPage` only promotes the slot from a
right-aligned box to a centered top header row. Frontend/domain boundary respected:
period stays a hand-written `YYYY-MM` string; no `apps/api` import.

## Architecture Decisions

### Decision: Month arithmetic as pure string helpers in `periodo-anual.ts`
**Choice**: Add three pure functions operating directly on the `YYYY-MM` string —
`mesAnterior`, `mesSiguiente`, `esMesActual` — colocated with the existing
`periodoActualUTC`/`mesCompletoLabel`.
**Alternatives considered**: (a) `new Date(y, m)` arithmetic then reformat; (b) inline
logic inside the component; (c) new `periodo-nav.ts` file.
**Rationale**: Parsing the two integers and rolling over the month avoids `Date`
timezone drift and mutation bugs entirely (CLAUDE.md notes helpers are UTC-only). Colocating
with the other period helpers keeps discoverability; a new file is YAGNI. Pure functions are
trivially unit-testable — required under strict TDD. Rejected (a): reintroduces the exact TZ
risk the string approach eliminates. Rejected (b): untestable without a DOM harness.

### Decision: Rewrite in place, stable prop contract
**Choice**: Keep `PeriodoSelector({ periodo: string | undefined, onChange: (p: string) => void })`.
**Alternatives considered**: New `PeriodoHeader` component + rewire container.
**Rationale**: Container, `useResumen`, and the bucket-reset invariant depend only on the
callback path. A stable contract means zero wiring/route churn and keeps the diff well under 400 lines.

### Decision: Clamp "next" via `esMesActual`, prev unbounded
**Choice**: `next`/`Hoy` disabled when the effective period equals `periodoActualUTC(new Date())`.
**Rationale**: Backend resolves future/absent periods to the current month (degraded/empty data),
so advancing past today is meaningless. Reuses one pure predicate for both the next-clamp and the
Hoy no-op guard (locked decision #2).

### Decision: `undefined` period → treat as current month
**Choice**: `const efectivo = periodo ?? periodoActualUTC(new Date())` for label + arithmetic.
**Rationale**: An absent/invalid search param means the backend is showing the current month, so
the header must reflect that (label = current, next disabled). Keeps display truthful.

## Data Flow

    [‹]  [ julio 2026 ]  [›]  [Hoy]
     │                    │     │
     └── mesAnterior ─────┴─ mesSiguiente / periodoActualUTC ──→ onChange(YYYY-MM)
                                                                     │
                          existing container: navigate({ search: { periodo } })
                                                                     │
                                    URL param → useResumen → ResumenScreen
                                                                     │
                              bucket-reset effect fires on periodo change (unchanged)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/domain/periodo-anual.ts` | Modify | Add `mesAnterior`, `mesSiguiente`, `esMesActual(periodo, ahora)` pure helpers |
| `apps/web/src/domain/periodo-anual.test.ts` | Create/Modify | Unit tests FIRST for the three helpers (rollover, clamp) |
| `apps/web/src/components/PeriodoSelector.tsx` | Modify | Rewrite as prev/next + label + Hoy header, Serene tokens, same props |
| `apps/web/src/components/PeriodoSelector.test.tsx` | Create | RTL tests: label render, prev/next click args, next disabled at current, Hoy |
| `apps/web/src/components/ResumenPage.tsx` | Modify | Promote slot (lines 33-35) to a centered top header row |

## Interfaces / Contracts

```ts
// periodo-anual.ts — pure, never throw, operate on YYYY-MM string (no Date arithmetic)
export function mesAnterior(periodo: string): string   // "2026-01" -> "2025-12"
export function mesSiguiente(periodo: string): string  // "2026-12" -> "2027-01"
export function esMesActual(periodo: string, ahora: Date): boolean // === periodoActualUTC(ahora)

// PeriodoSelector.tsx — UNCHANGED prop contract
{ readonly periodo: string | undefined; readonly onChange: (periodo: string) => void }
```

Styling: Serene Finance tokens only (mapped in `index.css @theme`) — label
`text-xl font-semibold text-foreground` (pattern from `BucketDetailList.tsx:101`);
arrows `<Button variant="ghost" size="icon-sm">` with lucide `ChevronLeft`/`ChevronRight`
(lucide-react already a dep — `nav-items.ts`); Hoy `<Button variant="outline" size="sm">`.
Container row `mx-auto flex w-full max-w-6xl items-center justify-center gap-3`.

A11y (Spanish): arrows are real `<button>`s (via `Button`) with `aria-label="Mes anterior"` /
`"Mes siguiente"`, Hoy `aria-label="Ir al mes actual"`, chevron glyphs `aria-hidden`. Disabled
state = native `disabled` (Button already renders `disabled:opacity-50 disabled:pointer-events-none`
+ `focus-visible:ring`), giving correct AT semantics. WCAG 2.2 AA (ADR-018).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (vitest) | `mesAnterior`/`mesSiguiente` year rollover; `esMesActual` true/false vs injected `ahora` | Pure, table cases, written FIRST |
| Component (RTL) | Label text via `mesCompletoLabel`; prev/next fire `onChange` with correct `YYYY-MM`; next+Hoy disabled at current month; Hoy jumps to `periodoActualUTC` | Mocked `onChange`, no router harness |

## Migration / Rollout

No migration required. Pure frontend restyle; backend contract unchanged.

## Open Questions

None. The proposal's future-period question is resolved by locked decision #2 (clamp next at current month).
