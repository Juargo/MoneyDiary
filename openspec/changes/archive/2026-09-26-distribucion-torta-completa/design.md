# Design: Full (filled) pie for the "Distribución del gasto" chart

## Technical Approach

Presentation-only change in `apps/web`. The filled-pie code path already exists and is already pinned
byte-for-byte (`arcoPath` with `rInterior === 0`, and the `DistribucionPie` default `conInterior = false`).
The change therefore does three things, in this order:

1. **Flip the only production call site** (`ResumenScreen.tsx:150`, drop `conInterior`), driven by a RED
   test at the `ResumenScreen` level. At this point the live dashboard is already a filled pie.
2. **Delete the donut path, which is now dead** (YAGNI rule 3): the `conInterior` prop, `RATIO_INTERIOR`,
   `rInteriorAnillo`, the `rInterior` threading through `Pie` and `centroidLabel`, `arcoPath`'s sixth
   parameter and both annular branches, and `radioEtiqueta`. The label radius becomes `r / 2` inline.
3. **Delete the donut-only tests, adapt the rest, refresh docblocks**, then run the grep gate, the unit /
   type / lint / e2e gates and a skewed-split visual check against the IDEAL inset.

No new geometry, no new abstraction, no layout change. The IDEAL inset (`right-1 bottom-0`) is not moved
(user decision; any residual overlap becomes a follow-up). `apps/mobile` is untouched. The spec delta
(`WG5-01`, `WG5-12`) is owned by the spec phase; this design only relies on it.

## Architecture Decisions

### Decision 1: Delete the donut path instead of keeping it behind a default-off flag

**Choice**: Remove `conInterior`, `RATIO_INTERIOR`, `rInteriorAnillo`, the `rInterior` prop/argument chain,
`arcoPath`'s `rInterior` parameter with both annular branches and the `[0, r)` clamp, and `radioEtiqueta`.
**Alternatives considered**: (a) only flip the call site and keep the flag (exploration approach 1 as
written); (b) keep `arcoPath`'s optional parameter "for mobile parity".
**Rationale**: User-approved (not reopened). After the flip, the flag has exactly one value in production,
the parameter only ever receives its default, and the annular tests pin shapes nobody renders (YAGNI rule 3,
"delete dead paths"). Mobile has its own `pie-geometry` port; web does not share it, so parity is not a
reason to keep dead web code. Rollback is a `git revert`, which restores the whole path if it is ever needed.

### Decision 2: Final `arcoPath` signature is 5 arguments, output byte-identical to today's filled form

**Choice**:

```ts
export function arcoPath(
  cx: number,
  cy: number,
  r: number,
  inicio: number,
  fin: number,
): string
```

Body keeps exactly two branches: the full-sweep branch (`fin - inicio >= 359.999`, two half-circle arcs
starting at `M cx cy`) and the ordinary wedge branch (`M cx cy L p1 A r r 0 largeArc 1 p2 Z`). The `rInt`
local, the clamp and both `rInt > 0` branches disappear. Local names lose the `Exterior` suffix
(`topExterior` → `top`, `p1Exterior` → `p1`, and so on), because "exterior" only made sense next to an
interior. The emitted strings must stay byte-identical to what `arcoPath(..., 0)` returns today.
**Alternatives considered**: keep the suffixed names to shrink the diff.
**Rationale**: KISS rule 1 (optimise for reading): a lone `topExterior` invites the question "exterior to
what?". The rename is safe because the byte-exact regression tests (Decision 5) pin the output before and
after. `MiniDistribucionPie.tsx:61` already calls the 5-argument form, so no call site changes.

### Decision 3: Label radius is `r / 2` inline in `centroidLabel`, not a named helper or constant

**Choice**: `centroidLabel(cx, cy, r, inicio, fin)` (the `rInterior` parameter is removed) computes
`const radio = r / 2;` directly, with a one-line "why" comment: labels sit at half the radius, the middle of
a filled wedge, which also keeps them clear of the bottom-right IDEAL inset for realistic splits.
**Alternatives considered**: (a) keep a renamed domain helper, e.g. `radioEtiqueta(r)`; (b) a module
constant `RATIO_ETIQUETA = 0.5`; (c) pass the radius into `centroidLabel` from `Pie`.
**Rationale**: KISS rules 1 and 4 and YAGNI: `r / 2` is self-explanatory, has one caller, and has no variant
left to parameterise. A helper would be a one-line function wrapping a division, tested separately, which
is more surface than the expression it names. (c) would move the same expression one level up for no gain.
The domain layer (`pie-geometry.ts`) stays pure arc math; label placement stays a component concern, as the
old `RATIO_INTERIOR` comment already argued for visual ratios.

### Decision 4: Strict TDD sequencing - RED at the screen level, then GREEN by flipping, then refactor-delete

**Choice**:

1. **RED** in `ResumenScreen.test.tsx`: a new test proves the dashboard renders a filled pie with labels at
   `r / 2`. It fails today because `ResumenScreen` passes `conInterior`.
2. **GREEN**: remove the `conInterior` attribute at `ResumenScreen.tsx:150` only. The prop still exists, so
   nothing else changes and every other test stays green.
3. **Characterisation pins** (GREEN on arrival, before any deletion): a byte-exact full-360° filled path in
   `pie-geometry.test.ts` and an `r / 2` label-position test in `DistribucionPie.test.tsx`. They protect
   the refactor in step 4.
4. **REFACTOR (delete)**: remove the dead code and, in the same step, the donut-only tests that pinned it.
   `tsc -b` catches any remaining caller of the removed prop or parameter.

**Alternatives considered**: (a) put the RED test in `DistribucionPie.test.tsx`; (b) delete first and let
type errors drive the change.
**Rationale**: At the `DistribucionPie` level the filled pie is already the default, so a test there cannot
go RED; the bug is the call site's opt-in, so the RED test must render `ResumenScreen`. (b) has no failing
behavioural test and would violate the strict-TDD rule that behaviour changes start from an observed RED.

### Decision 5: Test disposition

| File | Test | Disposition |
|------|------|-------------|
| `src/components/ResumenScreen.test.tsx` | NEW: "renders the spending chart as a filled pie with on-wedge labels at half the radius (WG5-01)" | **Add (RED first)** |
| `src/domain/pie-geometry.test.ts` | `calcularAngulos` (3 cases) | Keep |
| `src/domain/pie-geometry.test.ts` | `arranca en el centro y cierra el wedge (Z)` | Keep |
| `src/domain/pie-geometry.test.ts` | `marca large-arc-flag=1 cuando el barrido supera 180°` | Keep |
| `src/domain/pie-geometry.test.ts` | `un barrido completo (0→360) produce un path cerrado sin NaN` | Keep |
| `src/domain/pie-geometry.test.ts` | `omitiendo rInterior devuelve el mismo string EXACTO de hoy (contrato de regresión, D-01)` | **Adapt**: same assertion (`'M 120 80 L 162.426 37.574 A 60 60 0 0 1 162.426 122.426 Z'`), retitle to a filled-wedge regression contract, drop the `rInterior`/`D-01` comment |
| `src/domain/pie-geometry.test.ts` | NEW: byte-exact filled full sweep, `arcoPath(100, 100, 80, 0, 360)` equals `'M 100 100 L 100 20 A 80 80 0 1 1 100 180 A 80 80 0 1 1 100 20 Z'` | **Add (characterisation, GREEN on arrival)**; pins the restructured 360° branch |
| `src/domain/pie-geometry.test.ts` | `con rInterior > 0 arranca en el borde exterior ...` | **Delete** |
| `src/domain/pie-geometry.test.ts` | `un barrido completo (0→360) con rInterior > 0 emite dos subpaths ...` | **Delete** |
| `src/domain/pie-geometry.test.ts` | `rInterior >= r degrada al wedge relleno ...` | **Delete** |
| `src/domain/pie-geometry.test.ts` | `describe('radioEtiqueta')` and its import | **Delete** |
| `src/components/DistribucionPie.test.tsx` | `main-ring wedge paths do not start at the centre ... when conInterior is enabled` | **Delete** |
| `src/components/DistribucionPie.test.tsx` | `renders the filled pie (no hole) by default — the donut hole is opt-in via conInterior` | **Adapt**: unconditional "renders a filled pie: every main wedge starts at the centre with a single arc"; same assertions, no opt-in wording, rewritten comment |
| `src/components/DistribucionPie.test.tsx` | NEW: "places each on-wedge % label at half the radius on its wedge's mid-angle" | **Add (characterisation, GREEN on arrival)** |
| `src/components/DistribucionPie.test.tsx` | IDEAL inset filled-wedge test | Keep; drop the "did not inherit the donut ring's rInterior" phrasing from its comment |
| `src/components/DistribucionPie.test.tsx` | All other tests (a11y, labels, classes, focus, `< 5%`, placeholder, navigation, FIX 8) | Keep unchanged |

### Decision 6: Visual acceptance check is a temporary, uncommitted Playwright spec that measures boxes

**Choice**: Reuse the repo's own no-backend harness (`stubApi(page)`), override `**/api/resumen*` with a
skewed DTO, and measure the bounding boxes of the main pie's `<text>` labels against the IDEAL inset's
box, plus a screenshot per project. The spec is deleted after the check; results go into the verify report.
**Alternatives considered**: (a) eyeball only; (b) commit the spec as a permanent regression test.
**Rationale**: jsdom does not lay out, and the overlap depends on the chart column's real width (see Risks),
so only a real browser can answer the question. Measuring beats eyeballing. It is not committed because
moving the inset is out of scope: a permanent test that could go RED for a reason this change is not
allowed to fix would block unrelated work. If the check finds an overlap, a follow-up issue can adopt the
spec as its RED test.

## Data Flow

Unchanged except for the removed flag:

    ResumenScreen ──(tajadas, targets, onSelectBucket)──> DistribucionPie
                                                              │
                         ┌────────────────────────────────────┴───────────────┐
                         v                                                    v
            Pie (main, showLabels, interactive)                    Pie (IDEAL inset, static)
                 │  calcularAngulos → arcoPath(cx,cy,r,a,b)             │  same, no labels
                 │  centroidLabel(cx,cy,r,a,b) → radius r/2             │
                 v                                                      v
            <path d="M cx cy L … A … Z"> + <text>%</text>          <path d="M cx cy L …">

Before: `conInterior` → `rInteriorAnillo = 0.58 r` → annular `arcoPath` and labels at `0.79 r`.
After: there is no hole radius anywhere in `apps/web`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/components/ResumenScreen.tsx` | Modify | Drop `conInterior` at line 150. Rewrite docblock lines 46-48: the pie renders `viewModel.distribucionGasto` as a filled pie (remove "donut hole enabled (`conInterior`, D-01)"). Keep the `dashboard-donut` filename reference at line 113 (e2e rename is out of scope). |
| `apps/web/src/components/ResumenScreen.test.tsx` | Modify | Add the RED filled-pie test (Decision 4, Interfaces below). |
| `apps/web/src/components/DistribucionPie.tsx` | Modify | Remove `radioEtiqueta` import; `centroidLabel` loses `rInterior` and uses `r / 2`; `Pie` loses the `rInterior` prop and its docblock line; `arcoPath` called with 5 args; `DistribucionPie` loses `conInterior` prop and docblock, `RATIO_INTERIOR`, `rInteriorAnillo`, and the `rInterior` attribute on the main `Pie`. Rewrite the component docblock's US-047 paragraph (lines 271-275) and the IDEAL cut-out comment ("off the main donut" → "off the main pie"). Replace the `centroidLabel` US-047/D-01 comment with the one-line `r / 2` rationale. |
| `apps/web/src/components/DistribucionPie.test.tsx` | Modify | Per Decision 5. |
| `apps/web/src/domain/pie-geometry.ts` | Modify | `arcoPath` to 5 args, two filled branches, `Exterior` suffixes dropped; docblock trimmed to the filled wedge and the 360° split; delete `radioEtiqueta` and its docblock. `calcularAngulos`, `puntoEnCirculo`, `redondear` unchanged. |
| `apps/web/src/domain/pie-geometry.test.ts` | Modify | Per Decision 5. |
| `openspec/changes/distribucion-torta-completa/specs/web-app/spec.md` | Create (spec phase) | MODIFIED `WG5-01`, `WG5-12`. Not authored here. |
| `apps/web/src/components/MiniDistribucionPie.tsx` | None (verified) | Already `arcoPath(cx, cy, r, tramos[i].inicio, tramos[i].fin)`. |
| `apps/web/e2e/dashboard-donut.e2e.ts`, `apps/web/e2e/fixtures/api-stubs.ts` | None | Layout-only; names out of scope. |
| `apps/web/src/index.css` (comments at lines 51 and 196) | None | Pre-existing stale "donut" comments in an untouched file; out of scope, noted for a later docs sweep. |

## Interfaces / Contracts

Final signatures (all internal to `apps/web`; no exported type changes besides the removals):

```ts
// domain/pie-geometry.ts
export function calcularAngulos(fracciones: ReadonlyArray<number>): Tramo[]; // unchanged
export function arcoPath(cx: number, cy: number, r: number, inicio: number, fin: number): string;
// radioEtiqueta: removed

// components/DistribucionPie.tsx (module-private)
function centroidLabel(cx: number, cy: number, r: number, inicio: number, fin: number): { x: number; y: number };
function Pie(props: {
  readonly slices: ReadonlyArray<Slice>;
  readonly size: number;
  readonly showLabels?: boolean;
  readonly sliceTestId: string;
  readonly onSelectSlice?: (bucket: string) => void;
}): JSX.Element;

export function DistribucionPie(props: {
  readonly tajadas: ReadonlyArray<TajadaGasto>;
  readonly targets: ResumenViewModel['targets'];
  readonly onSelectBucket: (bucket: string) => void;
  readonly size?: number; // default 240
}): JSX.Element;
```

`centroidLabel` body (the only new expression):

```ts
// Half the radius: the middle of a filled wedge. It also keeps labels away from
// the IDEAL inset in the bottom-right corner (the old donut band sat at ~0.79 r).
const radio = r / 2;
```

### RED test shape (ResumenScreen level)

Uses the existing fixture (`distribucionGasto` 50/30/20) and the default `size = 240`, so `cx = cy = 120`,
`r = 120`, label radius `60`. Scope every query to the main chart with
`within(await screen.findByRole('group', { name: 'Distribución del gasto' }))`, because the legend and the
annual grid also render percentages. Needs `mockFetchAnual()` like its siblings.

- every `pie-slice` `d` starts with `'M 120 120'` and has exactly one `A ` command;
- the `50%` label (Necesidades, 0°–180°, mid-angle 90°) has `x ≈ 180` and `y ≈ 120`
  (`Number(getAttribute('x'))` with `toBeCloseTo(…, 3)`).

Today it fails on both counts: the donut wedge starts at the outer boundary (`M 120 0 …`) with two arcs,
and the label sits at `x ≈ 214.8` (radius `0.79 × 120`).

### Label-position pin (DistribucionPie level)

Same 50/30/20 fixture, `size = 240`. Expected centres (radius 60, angles clockwise from 12 o'clock):

| Label | Wedge | Mid-angle | x | y |
|-------|-------|-----------|---|---|
| `50%` | 0°–180° | 90° | 180 | 120 |
| `30%` | 180°–288° | 234° | 71.459 | 155.267 |
| `20%` | 288°–360° | 324° | 84.733 | 71.459 |

Assert with `toBeCloseTo(…, 3)`, not string equality (the `x`/`y` attributes are unrounded floats).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (domain) | `arcoPath` filled wedge and filled full sweep are byte-identical after the refactor; `large-arc-flag`; no NaN | Vitest, `pie-geometry.test.ts` (kept + one new byte-exact 360° pin) |
| Unit (component) | Main wedges start at `M cx cy` with one arc; labels at `r / 2`; `< 5%` suppression, a11y, focus, classes unchanged | Vitest + RTL, `DistribucionPie.test.tsx` |
| Unit (screen) | The dashboard's call site renders the filled pie (the RED test) | Vitest + RTL, `ResumenScreen.test.tsx` |
| Types | No caller of the removed prop/param survives | `tsc -b` (solution-style tsconfig; `--noEmit` checks nothing) |
| E2E | Chart card layout at 360/880/1280px; 360px floor (overflow, 24px targets) | Playwright, full suite across `movil`, `tablet`, `escritorio` projects |
| Visual acceptance | No `%` label overlaps the IDEAL inset under skewed splits | Temporary Playwright spec (procedure below), deleted afterwards |

### Grep gate (after the refactor step)

```sh
rg -n 'conInterior|RATIO_INTERIOR|rInteriorAnillo|rInterior|radioEtiqueta' apps/web
```

Expected: no matches (`.gitignore` already excludes `node_modules`/`dist`; `CHANGELOG.md` does not contain
these identifiers). Then a manual-review grep over the touched files:

```sh
rg -n -i 'donut|hole|agujero|D-01' \
  apps/web/src/components/DistribucionPie.tsx apps/web/src/components/DistribucionPie.test.tsx \
  apps/web/src/components/ResumenScreen.tsx apps/web/src/domain/pie-geometry.ts \
  apps/web/src/domain/pie-geometry.test.ts
```

Allowed residue: the `dashboard-donut` e2e filename in `ResumenScreen.tsx`. Anything else is a stale comment
to fix.

### Verification commands

```sh
pnpm web test                                   # vitest run, all web unit tests
pnpm --filter @moneydiary/web exec tsc -b       # NOT --noEmit
pnpm web lint                                   # eslint, incl. the scoped jsx-a11y override on DistribucionPie.tsx
pnpm web test:e2e                               # Playwright, all 3 projects: movil (360), tablet (880), escritorio (1280)
```

For iteration, `pnpm web test:e2e dashboard-donut mobile-floor` runs the two most relevant specs on all
three projects. The closing gate is the full suite; do not skip a project because it is slow
(e2e-three-viewports convention).

### Visual acceptance check (skewed split vs IDEAL inset)

No backend needed.

1. Create `apps/web/e2e/tmp-torta-sesgada.e2e.ts`. In each test, call `stubApi(page)` and **then** register
   `page.route('**/api/resumen*', …)` with a literal `ResumenMesDto` (same shape as `RESUMEN_MES_FIXTURE`,
   `sinIngreso: false`). Playwright matches the most recently registered route first, so the override wins.
   Three cases (bucket totals drive `calcularDistribucionGasto`; wedge order is Necesidades, Deseos,
   Ahorro):
   - **80/15/5**: Necesidades mid-angle 144° (deep in the bottom-right quadrant); the main target case.
   - **64/26/10**: Necesidades mid-angle ≈115°; the user's originally reported `64%` case.
   - **10/75/15**: Deseos spans 36°–306°, mid-angle 171°; a large non-first wedge near the bottom.
2. `page.goto('/?periodo=2026-07')`, wait for `'Toca un ítem del gráfico o la leyenda'`.
3. Scope to `page.getByRole('group', { name: 'Distribución del gasto' })`, collect each `text` element's
   `boundingBox()`, and the inset's box from `page.getByRole('img', { name: 'Distribución ideal 50/30/20' })`.
   Assert no label box intersects the inset box. Take `page.screenshot()` into the scratchpad.
4. Run on all three projects: `pnpm web test:e2e tmp-torta-sesgada`. `movil` matters most (narrowest column).
5. Delete the spec. Record the outcome per case and project in the verify report. If any case overlaps, open
   a follow-up issue (moving or resizing the inset) and attach the spec; it does not block this change.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. Presentation-only SVG geometry change.

## Migration / Rollout

No migration required. No API, schema or data change. Ships with the next Vercel deploy of `apps/web`;
rollback is `git revert` of the change's commits.

## Open Questions

- None blocking. Residual overlap under skewed splits is measured by the visual check and, if present,
  handed to a follow-up per the approved scope.
