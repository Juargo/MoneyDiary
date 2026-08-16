# Tasks: US-047 — Web dashboard main chart, 5 items (#281)

Scope: `apps/web` only. Zero changes to `apps/api`, `packages/api-client`, `apps/mobile`.
Runner commands (run from repo root):

- Unit/component: `pnpm web test` (vitest, jsdom)
- Typecheck: `pnpm web typecheck` (`tsr generate && tsc -b`)
- Lint (a11y gate): `pnpm web exec eslint .` (same as `pnpm web lint`)
- E2E (real viewport): `pnpm web test:e2e` (Playwright — `movil`/`tablet`/`escritorio` projects)

**Strict TDD ordering.** For every task with both a red and a green step, write/update
the failing test FIRST, watch it fail for the stated reason, then implement the minimal
change to turn it green. Do not write implementation before its test exists and fails.

**Anti-blind-re-record rule (design §4.1, binding).** Every assertion moving from 3→5 or
3→4 items MUST be renamed to the behavior it newly proves. A task that changes an
expectation count while leaving the old test name intact fails review — see the exact
rename text embedded in each task below (from design §5's table, verified counts).

**WCTG-14 anti-pattern guard (binding on T13).** T1/tablet-variant and divider-visibility
proof MUST come from rendered/computed geometry in Playwright (`getComputedStyle`,
bounding boxes) — never from asserting a `md:`/`lg:`-prefixed className string is present
in jsdom markup. A jsdom className check may exist only as a smoke check explicitly
labeled as such in its test name.

---

## Phase 0 — Domain: geometry (foundation, no dependents until Phase 2)

### [x] T1 — RED: `pie-geometry.test.ts` — 5 new donut cases, 0 edits to the existing 6

File: `apps/web/src/domain/pie-geometry.test.ts`

Add, without touching any of the existing 6 cases:
1. Omitting `rInterior` (or passing `undefined`) returns the exact string `arcoPath`
   returns today, byte for byte (regression contract).
2. An annular wedge (`rInterior > 0`, partial sweep) does **not** start with `M cx cy`
   and its path string references both the outer radius and the inner radius (the hole
   exists).
3. The 0→360 full-sweep branch with `rInterior > 0` emits two subpaths with opposite
   sweep flags and contains no `NaN` token (a 100%-single-bucket month is a ring, not a
   disc).
4. `rInterior >= r` degrades to the filled-wedge (`rInterior = 0`) path shape instead of
   emitting an inverted/self-crossing path.
5. New `radioEtiqueta(r, rInterior)` returns the mid-band radius `(r + rInterior) / 2`.

Verify: `pnpm web test -- pie-geometry` fails only on the 5 new cases (the existing 6 must
already be green against current `arcoPath`, since they exercise no new parameter).

Traces to: WG5-01 (donut rendering), design D-01.

### [x] T1 — GREEN: implement `rInterior`/`radioEtiqueta` in `pie-geometry.ts`

File: `apps/web/src/domain/pie-geometry.ts`

- Add trailing optional `rInterior = 0` parameter to `arcoPath` per design D-01 (annular
  two-arc path when `rInterior > 0`; full-sweep branch draws outer circle then inner
  circle with inverted sweep flag; clamp `rInterior` to `[0, r)`, degrade to `0` at/above
  `r`, never throw).
- Add and export `radioEtiqueta(r: number, rInterior: number): number`.

Verify: `pnpm web test -- pie-geometry` — all 11 cases green. `pnpm web typecheck` green.

Parallel-safe: No — foundation for T5/T6.

---

## Phase 1 — Domain: membership, formatting, view-model (parallel-safe within phase)

### [x] T2 — RED: `distribucion-gasto.test.ts` — invert 1, add 3

File: `apps/web/src/domain/distribucion-gasto.test.ts`

- **Rename+invert** the existing `:43` case — old name "excluye SinCategoria del pie y
  del denominador" → new name **"incluye SinCategoria en el anillo y en el denominador"**
  — assert the opposite of today's exclusion (this is the semantic core of the US, WG5-13;
  do not leave the old name on an inverted assertion).
- New: the 77/12/11 mockup fixture with `SinCategoria: 0` still reads 77/12/11 (a zero
  4th bucket doesn't shift the existing 3-bucket reading).
- New: all four `BUCKETS_ANILLO` percentages sum to exactly 100 under largest-remainder,
  for a case where `SinCategoria` carries a nonzero total.
- New: `BUCKETS_ANILLO` ends with `'SinCategoria'` and `BUCKETS_5030` excludes it (ring
  order + membership pinned as a literal-array assertion, not implementation detail).

Verify: fails to compile/run — `BUCKETS_GASTO`/`BUCKETS_5030`/`BUCKETS_ANILLO` don't yet
exist in the shape the new tests need.

Traces to: WG5-01, WG5-13, design D-05.

### [x] T2 — GREEN: split `BUCKETS_GASTO` into `BUCKETS_5030`/`BUCKETS_ANILLO`

File: `apps/web/src/domain/distribucion-gasto.ts`

- Delete `BUCKETS_GASTO` (do not alias — design D-05 requires `tsc` to fail at every call
  site so each one declares which set it meant).
- Add `export const BUCKETS_5030 = ['Necesidades', 'Deseos', 'Ahorro'] as const;`
- Add `export const BUCKETS_ANILLO = [...BUCKETS_5030, 'SinCategoria'] as const;`
- `calcularDistribucionGasto` iterates `BUCKETS_ANILLO` (4 items) instead of the old
  3-item allowlist.

Verify: `pnpm web test -- distribucion-gasto` green. `pnpm web typecheck` will now show
every stale `BUCKETS_GASTO` call site as a compile error — do NOT fix those here; T4/T6
fix their own call sites. Confirm the compiler output names exactly: `DistribucionPie.tsx`
and (transitively) `resumen-view-model.ts`'s test file, nothing else.

Parallel-safe: Yes, with T3 (different file, no shared symbol).

### [x] T3 — RED: `formatear-monto.test.ts` — 4 new cases for `formatearMontoConSigno`

File: `apps/web/src/domain/formatear-monto.test.ts`

- `formatearMontoConSigno(montoStr, '+')` and `(montoStr, '-')` — the sign comes from the
  caller's argument, never from the string's own sign.
- A negative-magnitude input never yields a doubled `--` prefix (formatter operates on
  absolute magnitude, then prefixes the caller's sign).
- Magnitude `0` renders with no sign prefix at all (`$0`, not `-$0`/`+$0`).
- A value above `Number.MAX_SAFE_INTEGER` keeps every digit through the signed path
  (extends the existing above-2^53 test class).

Verify: fails — `formatearMontoConSigno` does not exist yet.

Traces to: WG5-04, design D-04.

### [x] T3 — GREEN: implement `formatearMontoConSigno`

File: `apps/web/src/domain/formatear-monto.ts`

- New function `formatearMontoConSigno(montoStr: string, signo: '+' | '-'): string` per
  design D-04: reuses `esMontoStringValido` (no second regex), operates on the absolute
  magnitude, prefixes `signo` unless the magnitude is `0`. `formatearMontoCLP` stays
  byte-identical — do not add a parameter to it.

Verify: `pnpm web test -- formatear-monto` green. `pnpm web typecheck` green (no other
file imports this yet).

Parallel-safe: Yes, with T2.

### [x] T4 — RED: `api/client.test.ts` — `esResumenMesDto` gains `cantidadSinCategoria` guard (+2)

File: `apps/web/src/api/client.test.ts`

- A payload missing `cantidadSinCategoria`, or carrying it as a non-number, is rejected
  (`fetchResumen` returns the existing `WAC-02` parse-error path) — no new
  error-handling branch introduced.
- A payload with `cantidadSinCategoria: 0` is accepted — a legitimate zero is not
  confused with a missing/invalid field by the guard itself.

Verify: fails — today's `esResumenMesDto` accepts both malformed cases.

Traces to: WG5-05, design §3 ("DTO guard extension"), design §0 (blast-radius note:
`esResumenAnualDto` reuses this guard unmodified — verified safe, no extra test needed
here per design's own verification).

### [x] T4 — GREEN: extend `esResumenMesDto`

File: `apps/web/src/api/client.ts`

- Add `typeof candidato.cantidadSinCategoria === 'number'` to `esResumenMesDto`'s
  conjunction (same shape as the existing `totalIngreso` check), around line 90.

Verify: `pnpm web test -- client` green (including the untouched `esResumenAnualDto`
suite — confirms the shared-guard blast radius is safe, per design §3). `pnpm web
typecheck` green.

Parallel-safe: Yes, with T2/T3 (different file).

---

## Phase 2 — Domain: view-model (depends on T1, T2, T3, T4)

### [x] T5 — RED: `resumen-view-model.test.ts` — invert 1, add 5

File: `apps/web/src/domain/resumen-view-model.test.ts`

- **Rename+invert** the existing `:147` case for the same reason as T2 (the view-model's
  `distribucionGasto` now includes SinCategoria — name the new behavior, don't leave the
  old assertion's name on an inverted expectation).
- New: `leyendaPrincipal` is exactly the three 50/30/20 items in canonical order, all
  `kind: 'gasto'`, all rendering a `-`-prefixed `montoLabel`.
- New: `leyendaComplemento` is exactly `[ingreso(+), sinCategoria(-, cantidadLabel)]` in
  that order.
- New: `cantidadSinCategoria: 0` maps to `cantidadLabel: '0 tx'` and the SinCategoria
  item still exists in `leyendaComplemento` (never omitted for a real zero — WG5-05).
- New: `TajadaGasto` still carries no `montoLabel` field (I-2 held — the ring stays
  money-free; only `ItemLeyenda` carries money).
- New: `estadoGlobal` and `porcentajeLabel` still pass through verbatim with no
  recomputation (CA-06/WG5-11 — no estado/bp math leaked into the view-model).

Verify: fails — `ItemLeyenda`, `leyendaPrincipal`, `leyendaComplemento` don't exist yet.

Traces to: WG5-03, WG5-04, WG5-05, WG5-11, WG5-13, design D-03.

### [x] T5 — GREEN: `ItemLeyenda` discriminated union + `leyendaPrincipal`/`leyendaComplemento`

File: `apps/web/src/domain/resumen-view-model.ts`

- Add the 3-kind discriminated union `ItemLeyenda` (`'gasto'` / `'sinCategoria'` /
  `'ingreso'`) exactly per design D-03 — `porcentaje` only on `'gasto'`, `cantidadLabel`
  only on `'sinCategoria'`, no `esClickeable` field (interactivity derives from `kind` in
  presentation).
- `aResumenViewModel` builds `leyendaPrincipal` (3 `'gasto'` items, joined against
  `dto.buckets` by name for `montoLabel`, sign `-`, using `distribucionGasto`'s
  ring-share `porcentaje` per bucket) and `leyendaComplemento` (`'ingreso'` from
  `dto.totalIngreso` sign `+`, `'sinCategoria'` from `dto.cantidadSinCategoria` +
  its bucket total, sign `-`).
- Add `readonly leyendaPrincipal` / `readonly leyendaComplemento` to `ResumenViewModel`.
- `viewModel.totalIngreso` (unsigned) stays untouched — the signed label is additive.

Verify: `pnpm web test -- resumen-view-model` green. `pnpm web typecheck` green — this is
the point where `distribucion-gasto.ts`'s renamed exports (T2) get their real consumer.

Parallel-safe: No — depends on T1 (not directly, but T6 does), T2, T3, T4 all merged.

---

## Phase 3 — Components (depends on Phase 2)

### [x] T6 — RED: `DistribucionPie.test.tsx` — 3 edits, +3

File: `apps/web/src/components/DistribucionPie.test.tsx`

- **Rename** `pie-slice` count assertion 3→4: old name (whatever asserts 3 wedges) →
  new name naming "one wedge per ring item, including Sin categoría".
- Edit the fills-array assertion to include the new neutral grey for `SinCategoria` (not
  the `#CCCCCC` fallback) — assert a deliberate color exists.
- **Rename** `getAllByRole('button')` 3→4 assertion to name "the new Sin categoría wedge
  is selectable, and the IDEAL inset still contributes zero interactive wedges".
- New: main-ring wedge `<path>` `d` attributes do not start with `M cx cy` and reference
  the inner radius (CA-01 donut proof at unit level, via `rInterior`).
- New: the IDEAL inset's wedges DO start at `M cx cy` (filled) and still number exactly 3
  — the inset kept the 3-bucket 50/30/20 set and did not inherit the hole.
- New: the Sin categoría wedge's on-wedge `%` label follows the same uniform `≥5%`
  suppression rule (`showLabels`) as the other 3 wedges — no special-case suppression for
  its wedge label (R-6: the `%` omission is scoped to the LEGEND row only, not the ring).

Do NOT touch: `PIE_LABEL_FILL`, `PIE_WEDGE_STROKE`, `role="group"`/`role="img"` assertions
— these stay green unmodified as proof those invariants held.

Verify: fails — `DistribucionPie` doesn't yet thread `rInterior`, doesn't have a 4th
wedge, and `COLOR_BUCKET` has no `SinCategoria` entry.

Traces to: WG5-01, WG5-03 (R-6), WG5-12 (accessible name), design D-01, D-05, D-08.

### [x] T6 — GREEN: donut geometry + neutral grey in `DistribucionPie.tsx`

Files: `apps/web/src/components/DistribucionPie.tsx`, `apps/web/src/lib/bucket-colors.ts`,
`apps/web/src/index.css`

- `DistribucionPie.tsx`: import `BUCKETS_ANILLO`/`BUCKETS_5030` instead of the deleted
  `BUCKETS_GASTO` — main ring's `Pie` (via `slicesDesdeTajadas`) now renders 4 slices
  (already true once `calcularDistribucionGasto` returns 4 — T2/T5 upstream); `slicesIdeales`
  switches its `BUCKETS_GASTO` reference to `BUCKETS_5030` (still 3, unaffected — this is
  R-1's mitigation, confirmed by the T6 "IDEAL inset still 3 wedges, still `M cx cy`" test).
  Add `const RATIO_INTERIOR = 0.58;` and thread `rInterior = r * RATIO_INTERIOR` to
  `arcoPath` for the main ring only (`rInterior = 0` for the IDEAL inset — unchanged).
  Replace the hardcoded `r * 0.62` label-centroid constant with `radioEtiqueta(r,
  rInterior)` (T1).
- `lib/bucket-colors.ts`: add a deliberate neutral grey `SinCategoria` entry to
  `COLOR_BUCKET` — must NOT reuse `COLOR_EXCESO` (design D-08: different meanings).
- `index.css`: add the matching `@theme` token (e.g. `--color-sin-categoria`) next to the
  existing `--color-necesidades`/`--color-gustos`/`--color-ahorro`/`--color-exceso` block,
  per `lib/bucket-colors.ts`'s own docblock contract.
- Contrast check (design D-08, R-11, acceptance item — not a separate task): confirm the
  chosen grey clears the `PIE_LABEL_FILL` (`#1a1c1c`) and white `PIE_WEDGE_STROKE`
  contrast floors (WCAG AA, same floor the existing 3 pastels already pass). Record the
  computed ratio in the PR description.

Verify: `pnpm web test -- DistribucionPie` green. `pnpm web typecheck` green.

Parallel-safe: Yes, with T7 (different component file), once Phase 2 is merged.

### [x] T7 — RED: `LeyendaGasto.test.tsx` — 3 edits, +5

File: `apps/web/src/components/LeyendaGasto.test.tsx`

- **Rename** `leyenda-item` count assertion 3→5: new name "three 50/30/20 rows, a
  separator, then Ingresos and Sin categoría".
- Migrate the `{ name: 'Necesidades' }`-style accessible-name queries to
  content-derived-name queries (e.g. matching "Necesidades 42% -$624.500") — this is the
  R-8/D-08 deliberate `aria-label` removal; do not leave a query asserting the old
  bucket-only name.
- **Rename+invert** "renders nothing when there is no spending" → **"still renders the
  Ingresos row when there is no spending"** (design D-08: `LeyendaGasto` no longer
  returns `null`; the complement group always renders).
- New: Ingresos row is not a `<button>`, has no `%` text, and is not `aria-disabled` (the
  CA-04/WG5-06 interim — inert, not a disabled control).
- New: spend-bucket amounts start with `-`, the Ingresos amount starts with `+` (WG5-04).
- New: the Sin categoría row IS a `<button>` and shows `N tx` (an `sr-only` expansion of
  the count, per accessible-name discipline) alongside its `-`-prefixed amount and
  chevron.
- New: the chevron icon is `aria-hidden` and does not appear in any row's accessible
  name.
- New: the separator element sits structurally between the two rendered groups (design
  D-03: "two arrays, not a `grupo` field" — assert its DOM position, not a CSS class).

Do NOT touch (must stay green unmodified — proof they didn't regress): `outline-slate-800`
focus-ring assertion, `px-2`/`py-1` target-size assertion.

Verify: fails — `LeyendaGasto` doesn't yet accept `principales`/`complemento`, has no
divider, chevron, or `'ingreso'`/`'sinCategoria'` row shapes.

Traces to: WG5-03, WG5-04, WG5-06, WG5-12, design D-03, D-08, D-09 (divider element
structure — visibility is T13's job, not this task's).

### [x] T7 — GREEN: rewrite `LeyendaGasto.tsx` for the 3-kind union + divider

File: `apps/web/src/components/LeyendaGasto.tsx`

- Change props from `tajadas: ReadonlyArray<LeyendaTajada>` to `principales:
  ReadonlyArray<ItemLeyenda>` + `complemento: ReadonlyArray<ItemLeyenda>` (design D-03).
  Remove the old `LeyendaTajada` export/interface (dead per D-03 — the discriminated
  union replaces it; if any other file still imports `LeyendaTajada`, that's this task's
  scope to fix, not T9's).
- Render two `<ul>`s: the first for `principales` (`'gasto'` items — `<button>` + color
  dot + name + `%` + `montoLabel` + chevron, `WCAT-01` drill-down via `onSelectBucket`),
  the second for `complemento` (`'ingreso'` → inert `<li>` with a code comment
  documenting the interim per design D-07 point 1; `'sinCategoria'` → `<button>` +
  `montoLabel` + `cantidadLabel` (`sr-only` count text) + chevron, same drill-down as
  spend buckets).
- Divider: a single separator element between the two `<ul>`s, `hidden lg:block` Tailwind
  class only — no conditional JSX (D-09). This task adds the element; T13 is the
  Playwright proof it is actually absent/present at each viewport.
- Remove the row `aria-label` (D-08 deliberate accessible-name change) — accessible name
  now derives from visible text content.
- Chevron: `lucide-react`'s `ChevronRight`, `aria-hidden="true"`.
- Preserve `outline-slate-800` focus ring and `px-2 py-1` target size unchanged (LOCKED).

Verify: `pnpm web test -- LeyendaGasto` green. `pnpm web typecheck` green.

Parallel-safe: Yes, with T6.

### [x] T8 — RED: `SemaforoBadge.test.tsx` stays green with ZERO edits (verification task)

File: `apps/web/src/components/SemaforoBadge.test.tsx` (no changes to this file)

This is a negative-space task: run the existing suite BEFORE touching
`SemaforoBadge.tsx`, confirm it is green (baseline), then again AFTER the style-table
extraction (T8-GREEN) with **zero diff to the test file** — the design's own proof that
extracting the estado→(word,tone) table did not change the badge's behavior and that
`ResumenAnual`'s 12 instances were not collaterally converted into links.

Verify: `pnpm web test -- SemaforoBadge` green before and after, `git diff` on the test
file is empty.

Traces to: design D-06.

### [x] T8 — GREEN: extract `lib/semaforo-estilos.ts`

Files: `apps/web/src/lib/semaforo-estilos.ts` (new), `apps/web/src/components/SemaforoBadge.tsx`

- Move the `ESTILOS`/`SIN_DATOS` estado→(label, cara/tone, className) table out of
  `SemaforoBadge.tsx` into `lib/semaforo-estilos.ts`, exported for reuse by the new
  `SemaforoTag` (T9). Keep the "unknown/`null` → SIN_DATOS, never coerced into a known
  color" fallback intact.
- `SemaforoBadge.tsx` imports the extracted table; its own rendering logic is otherwise
  byte-for-byte unchanged.

Verify: `pnpm web test -- SemaforoBadge` green, zero diff to the test file (T8-RED
confirms this). `pnpm web typecheck` green.

Parallel-safe: Yes, with T6/T7 (T8 touches only `SemaforoBadge.tsx` + new
`lib/semaforo-estilos.ts`).

### [x] T9 — RED: `SemaforoTag.test.tsx` (new) — 5 cases

File: `apps/web/src/components/SemaforoTag.test.tsx` (new)

Using the router harness from T10 (built together with this task since neither can run
without the other — see note below):
1. Renders an `<a>` whose accessible name carries the estado **word** (e.g. "Verde"), not
   conveyed by color alone (ADR-018/W2-02).
2. `href` targets `/semaforo` and carries `?periodo=` matching the prop passed in.
3. `estadoGlobal: null` renders "Sin datos" and is **still** an `<a>` (never disabled,
   never omitted).
4. An unknown wire value (e.g. `'azul'`) is not coerced into a known color — falls back to
   the same "Sin datos" treatment.
5. The chevron is `aria-hidden`.

Note on ordering: `SemaforoTag` renders a TanStack `<Link>`, which throws without router
context. Write `src/test/router-harness.tsx` (T10 content) FIRST as a bare prerequisite
— it is not itself a `.test.` file and carries no assertions of its own — then write this
RED test importing it. This does not violate TDD: the harness is test infrastructure, not
implementation under test.

Verify: fails — `SemaforoTag` doesn't exist yet.

Traces to: WG5-07, WG5-08, WG5-12, design D-06.

### [x] T9/T10 — GREEN: `router-harness.tsx` + `SemaforoTag.tsx`

Files: `apps/web/src/test/router-harness.tsx` (new), `apps/web/src/components/SemaforoTag.tsx` (new)

- `router-harness.tsx`: exports `renderConRouter(ui, { initialPath })` building a minimal
  memory router (root route rendering `ui` + a `/semaforo` route rendering a sentinel), no
  auth, no real route tree (design §4.4). Excluded from coverage per `src/test/**`'s
  existing exclusion.
- `SemaforoTag.tsx`: `<Link to="/semaforo" search={{ periodo }}>` rendering `[dot]
  Semáforo: {estado} ›`, consuming the extracted `lib/semaforo-estilos.ts` table (T8) for
  the word/tone, keyboard-operable with a visible focus ring (WG5-12).

Verify: `pnpm web test -- SemaforoTag` green. `pnpm web typecheck` green.

Parallel-safe: Yes, with T6/T7/T8 (new files only).

---

## Phase 4 — Composition + route (depends on T5, T6, T7, T9/T10)

### T11 — RED: `ResumenScreen.test.tsx` — ~5 edits, +3

File: `apps/web/src/components/ResumenScreen.test.tsx`

- `renderScreen` helper switches from its current `QueryClientProvider`-only wrapper to
  route through `renderConRouter` (T10) — one helper change, not twelve per-test edits
  (design §4.4).
- Bucket button count: Sin categoría 1→2 — rename the assertion to state WHY (it joined
  the ring as a 4th wedge, in addition to its pre-existing legend button).
- The three spend-bucket button-count assertions stay at 2 each, but their queries switch
  to regex/content-derived names (the wedge's concise `aria-label` is unchanged; the
  legend row's name grew per T7/D-08) — rename to state the wedge-name-stays-concise /
  row-name-grew distinction.
- `semaforo-global` testid now resolves to a link (`SemaforoTag`), not a static `<span
  role="img">` — rename the assertion to name this as the CA-03 composition-level proof.
- New: the hint text (design D-08, a single muted line under the legend, owned by
  `ResumenScreen`) renders.
- New: the card body carries the T1 grid container (`data-testid="grafico-card-body"`) —
  explicitly labeled in the test name as a **smoke check**, not the CA-05 proof (that is
  T13, Playwright-only).
- Do NOT touch: the existing assertion pinning page-level `p-4`/`grid-cols-1`/
  `lg:grid-cols-2` — it must stay green unmodified, proof the page-level boundary did not
  drift to `md` (only the card body did, per D-09).

Verify: fails — `ResumenScreen` doesn't yet drop the hardcoded `BUCKET_SIN_CATEGORIA` row,
doesn't render `SemaforoTag`, doesn't have the T1 grid or hint text.

Traces to: WG5-02, WG5-03, WG5-05, WG5-07, WG5-09 (search param carry), design D-08, D-09.

### T11 — GREEN: rewire `ResumenScreen.tsx`

File: `apps/web/src/components/ResumenScreen.tsx`

- Drop the hardcoded `BUCKET_SIN_CATEGORIA` constant and the manual
  `entradasLeyenda` spread — pass `viewModel.leyendaPrincipal` /
  `viewModel.leyendaComplemento` (T5) straight to `LeyendaGasto`'s new `principales`/
  `complemento` props (T7).
- Card header: replace `<SemaforoBadge estadoSemaforo={...} size={28} />` with
  `<SemaforoTag estadoGlobal={viewModel.estadoGlobal} periodo={viewModel.periodo} />`
  (T9), keeping the `semaforo-global` testid wrapper.
- Card body: wrap `DistribucionPie` + `LeyendaGasto` in the T1 grid container per design
  D-09 (`grid grid-cols-1 gap-4 md:grid-cols-2`, `data-testid="grafico-card-body"`). Page-
  level grid (`grid-cols-1 lg:grid-cols-2`) and `p-4` stay untouched.
- Add the hint text (single muted line, full width, below the card body, no
  `aria-describedby` wiring per design D-08's rationale).
- `PeriodoSelector` composition at the page level (`ResumenPage.tsx`) is untouched — WG5-02
  requires no relocation; do not edit `ResumenPage.tsx` in this task.

Verify: `pnpm web test -- ResumenScreen` green. `pnpm web typecheck` green.

Parallel-safe: No — this task is the integration point; keep it solo to avoid merge
conflicts with T6/T7/T9 landing underneath it.

### T12 — RED+GREEN: `/semaforo` stub route + `src/test/semaforo-route.test.tsx` (new, +2)

Files: `apps/web/src/routes/_authenticated/semaforo.tsx` (new),
`apps/web/src/test/semaforo-route.test.tsx` (new)

RED first: write the route-tree integration test (mirroring
`src/test/configuracion-entry-points.test.tsx`'s pattern — real `routeTree.gen`, memory
history, stubbed `/api/auth/me`) asserting:
1. Navigating to `/semaforo` (authenticated) resolves and renders the explicit
   under-construction state — not blank, not a 404 (the route doesn't exist yet, so this
   fails first).
2. An unauthenticated navigation to `/semaforo` redirects to
   `/login?redirect=/semaforo` via the existing `_authenticated` guard — no new guard
   code.

GREEN: create `src/routes/_authenticated/semaforo.tsx` — flat naming (matches
`buckets.$bucket.tsx`), thin container, `createFileRoute('/_authenticated/semaforo')`
with `validateSearch` via `normalizarPeriodo` (reused, not reinvented), rendering `<h1>`
+ "en construcción" copy + `<Link to="/">Volver al resumen</Link>`. Docblock documents:
this is a US-049 stub, its trigger, and that it must not be deleted while `SemaforoTag`
links to it (design D-07 point 2).

Run `pnpm web typecheck` (regenerates `routeTree.gen.ts` via `tsr generate`) before
re-running the test — the route must be registered in the generated tree for the
integration test to resolve it.

Verify: `pnpm web test -- semaforo-route` green. `pnpm web typecheck` green.

Parallel-safe: Yes, with T11 (different files) — but merge order: this must land before
T14 (eslint scope references this file's glob) and before T9's `SemaforoTag` navigation
target is exercised in Playwright (T13/T15 stub the route content, not this file itself).

### T13 — eslint.config.js: D-10 scoped a11y `error` block

File: `apps/web/eslint.config.js`

Not a red/green pair (config, not testable via vitest) — verify via the lint runner
directly.

- Add the scoped `error`-severity `jsx-a11y` block exactly per design D-10's file list:
  `DistribucionPie.tsx`, `LeyendaGasto.tsx`, `SemaforoBadge.tsx`, `SemaforoTag.tsx`,
  `ResumenScreen.tsx`, `routes/_authenticated/semaforo*.tsx` (glob, matching the
  precedent in the existing `configuracion*.tsx` block — copy its shape, not its file
  list).
- Comment records WHY this is a file list, not a directory glob (touched files are loose
  in `src/components/`, unlike the `configuracion/` subdirectory precedent) and registers
  the follow-up debt (extracting a `src/components/dashboard/` directory) with its
  trigger — do not do the extraction now.

Verify: `pnpm web exec eslint .` reports zero `jsx-a11y` errors across the whole repo
(the 6 files pass at `error` severity; everything else stays at the app-wide `warn`,
unaffected). `pnpm web test` full suite still green (config-only change).

Traces to: WG5-12, design D-10.

### T14 — Manual a11y verification pass (acceptance item, not a new test file)

No new file — cross-check against already-written tests from T6/T7/T9/T11:

- Confirm the donut `<svg role="group"|"img" aria-label="Distribución del gasto">`
  exposes an accessible name/description not conveyed by color alone (already asserted
  in `DistribucionPie.test.tsx`, T6 — this task is the explicit sign-off, no new file).
- Confirm keyboard operability (Tab/Enter/Space) for every spend-bucket row, the Sin
  categoría row, and the semáforo tag, each with a visible focus ring — and confirm the
  Ingresos row is never reached by Tab (already asserted across T7/T9/T11's suites).
- Run `pnpm web exec eslint .` one more time after all Phase 3/4 tasks land, as the final
  CA-06 gate check.

Verify: `pnpm web test` (full suite) green, `pnpm web exec eslint .` clean, `pnpm web
typecheck` clean.

---

## Phase 5 — Playwright fixtures + E2E (depends on all of Phase 4)

### T15 — `e2e/fixtures/api-stubs.ts` — add 3 DTO stubs (must land BEFORE T16)

File: `apps/web/e2e/fixtures/api-stubs.ts`

- Add literal-instance stubs (per `src/api/types.ts` DTOs, per this file's own stated
  rule — no hand-rolled-guess shapes) for:
  - `GET /api/resumen` — a `ResumenMesDto` with nonzero totals in all 4 items
    (Necesidades/Deseos/Ahorro/SinCategoria) and a nonzero `totalIngreso`, so the ring/
    legend/T1 grid all render their non-empty-state markup.
  - `GET /api/resumen/anual` — a minimal 12-month `ResumenAnualDto` (reuses the same
    per-month shape).
  - `GET /api/buckets/:bucket` — a minimal `DetalleBucketDto` (empty or single-row
    transaction list is sufficient — this stub only needs to keep the transactions panel
    from erroring, not to assert on its content).
- Wire all 3 into `stubApi(page)` alongside the existing `/api/auth/me`, `/api/categorias`,
  `/version` stubs.

Verify: no automated test for this file alone — verified transitively by T16 (its specs
fail immediately with unstubbed-network errors if this task is skipped or wrong-shaped).

Traces to: design §4.3 "Fixture work this requires", R-9 (must be its own task, ordered
before the T1/T13-equivalent Playwright task).

### T16 — `e2e/dashboard-donut.e2e.ts` (new) — 6 real-viewport assertions

File: `apps/web/e2e/dashboard-donut.e2e.ts` (new)

Write against the stubbed dashboard (T15) at all 3 Playwright projects
(`movil`/`tablet`/`escritorio`), asserting by **rendered/computed geometry only** — never
by className presence (the binding WCTG-14 guard):

1. `tablet` (880px): `getComputedStyle('[data-testid=grafico-card-body]').gridTemplateColumns`
   resolves to 2 tracks.
2. `tablet` (880px): the legend's bounding box starts to the right of the donut `<svg>`'s
   bounding box (geometry, confirming side-by-side, not merely the 2-track computed
   style).
3. `tablet` (880px), divider: the legend divider element's `getComputedStyle(...).display`
   resolves to `none` and its bounding box has zero area.
4. `movil` (360px): `grafico-card-body`'s `gridTemplateColumns` resolves to 1 track, and
   the legend's bounding box sits below the donut's bounding box.
5. `movil` (360px), divider: same zero-area/`display: none` absence proof as #3 (closes
   the mobile-viewport gap WG5-10's new mobile scenario names).
6. `escritorio` (1280px): the page grid still resolves to 2 tracks (no regression to the
   existing `lg` page-level behavior) AND the divider's bounding box is non-zero-area with
   a visible `display` value, sitting between the spend-bucket rows and the
   Ingresos/Sin categoría rows.

Each assertion's test name must state which of the 6 named proofs above it is (3 grid +
3 divider) — do not collapse them into fewer, harder-to-diagnose tests.

Verify: `pnpm web test:e2e -- dashboard-donut` green across all 3 projects. Full
`pnpm web test:e2e` suite green (confirms T15's stubs didn't regress `tablet-grid.e2e.ts`
or any other existing spec).

Traces to: WG5-10, design §4.3, §5 (`e2e/dashboard-donut.e2e.ts` row, +6).

---

## Phase 6 — Final gate (after all phases merged)

### T17 — Full-suite verification + `ResumenPage.test.tsx` zero-diff confirmation

- Confirm `apps/web/src/components/ResumenPage.test.tsx` required **zero edits** across
  the whole change (design §5's explicit "0 edits" row) — `git diff` on that file must be
  empty. This is the evidence CA-01's month header stayed reused-unchanged, not restated.
- Run in order: `pnpm web typecheck`, `pnpm web test`, `pnpm web exec eslint .`,
  `pnpm web test:e2e`. All 4 green.
- Confirm zero diff in `apps/api/`, `packages/api-client/`, `apps/mobile/` (`git diff
  --stat` against those paths returns nothing) — the proposal's stated zero-backend-
  change guarantee.

Traces to: proposal Success Criteria (all CA-01..CA-06 + the final "pnpm web test/
typecheck green, zero backend diff" line item).

---

## Task dependency graph

```
T1 (pie-geometry) ─────────────────────────────┐
T2 (distribucion-gasto) ───────────────────────┤
T3 (formatear-monto)     [T1/T2/T3/T4 parallel] ├──► T5 (resumen-view-model)
T4 (client.ts guard) ───────────────────────────┘         │
                                                            ├──► T6 (DistribucionPie) ─┐
                                                            ├──► T7 (LeyendaGasto)    ─┤
                                                            └──► T9/T10 (SemaforoTag) ─┤
T8 (SemaforoBadge extraction) [parallel to T6/T7/T9]                                  │
                                                                                        ▼
                                                                              T11 (ResumenScreen)
T12 (/semaforo route)  [parallel to T11]                                              │
T13 (eslint D-10)      [after T12 exists, before T14]                                 │
                                                                                        ▼
                                                                              T14 (a11y sign-off)
                                                                                        │
                                                                                        ▼
                                                                        T15 (e2e stubs, MUST precede T16)
                                                                                        │
                                                                                        ▼
                                                                              T16 (dashboard-donut.e2e.ts)
                                                                                        │
                                                                                        ▼
                                                                              T17 (final gate)
```

**Parallel-safe groups:**
- T1, T2, T3, T4 — different files, no shared symbols (Phase 1, after T1 lands as its own
  prerequisite chain but before T5).
- T6, T7, T8, T9/T10 — different component files, all depend only on Phase 2 (T5) being
  merged.
- T11, T12 — different files (`ResumenScreen.tsx` vs. new route file); T13 depends on T12
  existing (its glob references the route file pattern) but not on T11.

**Strictly sequential (do not parallelize):** T1 before T6 (rInterior/radioEtiqueta); T2
before T5/T6 (BUCKETS_5030/BUCKETS_ANILLO); T5 before T6/T7/T11 (ItemLeyenda,
leyendaPrincipal/Complemento); T8 before T9 (extracted style table); T10 before T9's test
can run (router harness); T11 before T15/T16 (stubs+e2e assert against the composed
screen); T15 strictly before T16 (R-9, explicit design requirement); everything before
T17.

---

## Review Workload Forecast

**Estimated changed lines (apps/web only, additions + deletions):**

| Area | Files | Est. lines |
|---|---|---|
| Domain (pie-geometry, distribucion-gasto, formatear-monto, resumen-view-model + their 4 test files) | 8 | ~260 |
| api/client.ts + client.test.ts | 2 | ~25 |
| Components (DistribucionPie, LeyendaGasto, SemaforoBadge, SemaforoTag [new], ResumenScreen + 5 test files, 1 new) | 11 | ~420 |
| lib/bucket-colors.ts, lib/semaforo-estilos.ts (new), index.css | 3 | ~50 |
| Route: semaforo.tsx (new) + src/test/semaforo-route.test.tsx (new) + src/test/router-harness.tsx (new) | 3 | ~110 |
| eslint.config.js | 1 | ~20 |
| e2e/fixtures/api-stubs.ts + e2e/dashboard-donut.e2e.ts (new) | 2 | ~160 |
| **Total** | **30** | **~1045** |

**Chained PRs recommended: Yes**
**400-line budget risk: High** (single PR would land ~1045 changed lines, well over the
400-line review budget)
**Decision needed before apply: Yes**

delivery_strategy: `ask-on-risk` (per orchestrator instructions — this forecast is the
trigger to ask before `sdd-apply` starts).
chain_strategy (if the user confirms chaining): `stacked-to-main` (each slice below is
independently mergeable and independently green — `tsc` + `pnpm web test` + `pnpm web
exec eslint .` all pass at every slice boundary; no cross-workspace tsc trap since this
is single-workspace `apps/web` only).

**Proposed PR boundaries (each independently green):**

1. **PR #1 — Domain foundation** (T1–T5): `pie-geometry.ts`, `distribucion-gasto.ts`,
   `formatear-monto.ts`, `resumen-view-model.ts`, `api/client.ts` + their test files.
   ~310 lines. Green in isolation: yes — `DistribucionPie`/`LeyendaGasto`/`ResumenScreen`
   still compile against the OLD `BUCKETS_GASTO`... **caveat:** T2 deletes `BUCKETS_GASTO`,
   which breaks `DistribucionPie.tsx` compilation until T6 lands. To keep PR #1
   independently green, land T2's rename together with a **minimal** one-line fix in
   `DistribucionPie.tsx`'s `slicesIdeales` (swap `BUCKETS_GASTO` → `BUCKETS_5030`, the
   exact call-site fix T6 would otherwise make) inside PR #1 — this is a 1-line
   compile-fix, not new behavior, and keeps `tsc` green without pulling T6's full donut
   rewrite forward.

   **Apply-time addendum (2026-08-16, PR #1 landed):** T5 widened `ResumenViewModel`
   with two new REQUIRED fields (`leyendaPrincipal`/`leyendaComplemento`), which broke a
   second, unforecast call site: `ResumenScreen.test.tsx`'s hand-rolled `ResumenViewModel`
   fixture (it builds the object literal by hand, not via `aResumenViewModel`). Fixed with
   the same minimal-compile-fix discipline as the `DistribucionPie.tsx` case above — the
   fixture gained the two new fields with literal values matching its existing data, no
   other line in that file touched. T11 (Phase 4) is still the task that rewrites this
   fixture/suite for real to exercise the new legend props end to end.

   **judgment-day round 2 CRITICAL fix (2026-08-16, PR #1 iteration):** the original PR1
   shim (`ResumenScreen.tsx`'s `tajadasInterinas` — a component-side `.filter(...)` of the
   4-item `viewModel.distribucionGasto` down to `BUCKETS_5030` membership) filtered but
   never renormalized. With a diluted 4-item reading like 40/25/25/10, the filtered 3 items
   printed 40+25+25 = 90, not 100, and `calcularAngulos`'s forced-360 closure silently
   stretched the LAST wedge (Ahorro) to absorb SinCategoria's missing 10 points — a
   user-visible rendering defect. Fixed by keeping the math in the domain layer (ADR-024):
   `calcularDistribucionGasto` (`distribucion-gasto.ts`) gained a trailing optional
   `bucketsIncluidos: ReadonlyArray<string> = BUCKETS_ANILLO` param — passing `BUCKETS_5030`
   apportions (largest-remainder, BigInt ratios) over ONLY the 3 spend buckets, so the
   result sums to exactly 100 again. `aResumenViewModel` now computes a second,
   `BUCKETS_5030`-scoped reading into a new REQUIRED `distribucionGastoInterina` field
   (same PR1-shim-removal contract as below); `aLeyendaPrincipal` was also switched to
   consume it directly (it had the SAME filter-without-renormalize bug, latent because its
   only test fixture happens to have a zero-total SinCategoria). `ResumenScreen.tsx` now
   reads `viewModel.distribucionGastoInterina` for both the pie and the legend spread — the
   component-side filter predicate is gone entirely, so the DRY duplication Judge A flagged
   (the same `BUCKETS_5030`-membership predicate appearing in both `ResumenScreen.tsx` and
   `resumen-view-model.ts`) resolved itself rather than needing a shared-helper extraction.
   **Updated shim-removal reminder:** PR2/PR3 (T6/T11) must remove BOTH
   `distribucionGastoInterina` (the view-model field) AND its two call sites
   (`ResumenScreen.tsx`'s pie/legend props) when the real 4-wedge donut UI lands — not just
   the original `tajadasInterinas` local variable.
2. **PR #2 — Ring + legend + semáforo tag components** (T6–T10): `DistribucionPie.tsx`,
   `LeyendaGasto.tsx`, `SemaforoBadge.tsx`, `lib/semaforo-estilos.ts`, `SemaforoTag.tsx`,
   `lib/bucket-colors.ts`, `index.css`, `src/test/router-harness.tsx` + their test files.
   ~490 lines estimated; **actual ~939 changed lines** (694 insertions + 245 deletions,
   `size:exception` pre-approved for this batch) — `LeyendaGasto.tsx`/its test file grew
   past the estimate because the prop-shape change (`tajadas` → `principales`/
   `complemento`) is a full rewrite, not an incremental edit. Green in isolation: yes,
   once PR #1 is merged.

   **Apply-time addendum (2026-08-16, PR #2 landed):**
   - **`ResumenScreen.tsx` interim rewire (forced by T7, not scope creep):**
     `LeyendaGasto`'s prop shape changed entirely (`tajadas: LeyendaTajada[]` →
     `principales`/`complemento`: `ItemLeyenda[]`), which broke `ResumenScreen.tsx`'s
     call site immediately — this is NOT deferrable to T11 the way the `BUCKETS_GASTO`
     1-line compile-fixes were. Fixed by wiring `viewModel.leyendaPrincipal`/
     `leyendaComplemento` (T5, PR1 — already the REAL non-shim fields) straight into
     the new props, deleting the local `entradasLeyenda`/`LeyendaTajada` array-building
     entirely. The donut PIE prop (`DistribucionPie`'s `tajadas`) still reads the PR1
     shim `viewModel.distribucionGastoInterina` (3 items) — rewiring the pie itself to
     the real 4-item `distribucionGasto` is still T11's job (design D-09's grid rewrite
     lands together with it).
   - **`ResumenScreen.test.tsx` interim query fix (3 tests):** the legend row's
     accessible name is now content-derived (D-08: name + %/count + amount, e.g.
     "Necesidades 50% -$500.000") instead of the removed bucket-only `aria-label`. 3
     assertions that queried `getAllByRole('button', {name: 'Necesidades'})` (exact)
     to count BOTH the pie wedge and the legend row were updated to a `/^Necesidades\b/`
     prefix-regex so both controls still match; the "PR1 shim regression" test's
     expected `leyenda-item` count moved 4→5 (Ingresos now renders as a row INSIDE
     `LeyendaGasto` itself, T7, not just inside `IngresoCard` elsewhere). This is a
     MINIMAL interim fix, not T11's full rename pass — T11's task text still separately
     calls for renaming these assertions to state the wedge-name-stays-concise/
     row-name-grew distinction explicitly, and for the OTHER 3 tests that iterate
     `getAllByRole('button', {name: 'Ahorro'/'Gustos'})` in aria-pressed-loop assertions
     without an explicit length check (`defaults the transactions panel...`, `clicking a
     different legend/slice row...`, `resets the bucket selection...`): these still PASS
     today (because they now match only the pie wedge — the legend row's grown name no
     longer exact-matches — and the wedge alone satisfies the loop's aria-pressed
     assertion), but their legend-row coverage is silently reduced until T11's full
     query rename. Not a correctness bug; flagged here so T11 doesn't miss it.
   - **`SemaforoTag`'s `Link to="/semaforo"` typing (real constraint, not a choice):**
     verified directly against `tsc` that TanStack Router's `Link` `to` prop is
     typechecked against the app's GLOBALLY REGISTERED route tree
     (`declare module '@tanstack/react-router' { interface Register ... }` in
     `main.tsx`, populated from `routeTree.gen.ts`) — NOT against whichever router
     instance a test's `RouterProvider` supplies at runtime. Since T12 (`/semaforo`'s
     real route) is scoped to PR3, `to="/semaforo"` fails `tsc` today regardless of the
     test harness. Resolved with a narrow, documented local cast (`NavLink` in
     `SemaforoTag.tsx`) rather than pulling T12 forward — keeps PR2's scope exactly
     T6–T10 as planned. **Removal trigger for T12:** delete the `NavLink` cast and use
     `Link` directly once the real route is registered; `tsc` will flag the cast as
     dead/unnecessary at that point.
3. **PR #3 — Composition, route, eslint, a11y gate** (T11–T14): `ResumenScreen.tsx`,
   `routes/_authenticated/semaforo.tsx`, `src/test/semaforo-route.test.tsx`,
   `eslint.config.js` + test files. ~215 lines. Green in isolation: yes, once PR #2 is
   merged.
4. **PR #4 — E2E fixtures + Playwright spec + final gate** (T15–T17): `e2e/fixtures/
   api-stubs.ts`, `e2e/dashboard-donut.e2e.ts`. ~160 lines + the final full-suite/zero-diff
   sign-off (T17, no new lines). Green in isolation: yes, once PR #3 is merged (asserts
   against the fully composed screen).

Each boundary keeps `tsc -b`, `vitest run`, and `eslint .` green within `apps/web` at
every stacked step — no PR depends on a later PR's code to compile or pass its own tests.
