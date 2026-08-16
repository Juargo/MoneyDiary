# Design: US-047 — Web dashboard main chart, 5 items (#281)

> Scope of this document: the **HOW at architectural level** for the proposal in
> `./proposal.md`. It does not enumerate implementation steps (that is
> `sdd-tasks`) and it does not restate acceptance criteria (that is the spec
> delta, prefix `WG5-*`).

All product decisions listed as binding in the proposal are treated as fixed
inputs and are **not** reopened here: ring = 4 spend wedges, Ingresos is
legend-only and non-interactive, signs are client-derived by item kind,
`/semaforo` ships as a stub route, the SVG stays hand-rolled, `PeriodoSelector`
is reused verbatim, `eslint-jsx-a11y` at `error` on touched files, zero backend
or wire change.

---

## 0. Verified starting point

Every claim below was read from the real code before designing against it.

| Fact | Evidence |
|---|---|
| The chart is a **filled pie**, not a donut; wedges start at the centre (`M cx cy L …`) | `src/domain/pie-geometry.ts:73` |
| Geometry is already slice-count agnostic (`calcularAngulos` over N fractions) | `src/domain/pie-geometry.ts:19-30` |
| Ring membership is an allowlist of exactly 3 names | `src/domain/distribucion-gasto.ts:16` |
| `BUCKETS_GASTO` is **also** consumed by the IDEAL inset to index `targets` | `src/components/DistribucionPie.tsx:4,179-189` |
| `TajadaGasto` carries **no money** — only `bucket`/`porcentaje`/`fraccion` | `src/domain/distribucion-gasto.ts:20-26` |
| The SinCategoria legend row is hardcoded in the screen, not in the view-model | `src/components/ResumenScreen.tsx:14,99-102` |
| `cantidadSinCategoria: number` is on the wire and unconsumed by web | `packages/api-client/src/types.gen.ts:1855` |
| `esResumenMesDto` is also reused unmodified by `esResumenAnualDto` (`candidato.meses.every(esResumenMesDto)`), validating each of `/api/resumen/anual`'s 12 months — the tightened guard applies there too, not only to `/api/resumen` | `apps/web/src/api/client.ts:~165-176` |
| `formatearMontoCLP` emits `-` only for a negative BigInt; no `+` support | `src/domain/formatear-monto.ts:49-52` |
| `SemaforoBadge` is **also** used by `ResumenAnual` (12 instances, `size={20}`) | `src/components/ResumenAnual.tsx:9,125` |
| Legend rows and pie wedges both take their accessible name from `aria-label` = bucket UI label | `LeyendaGasto.tsx:51`, `DistribucionPie.tsx:108` |
| CA-01's month header already ships and is already pinned by a test | `ResumenPage.tsx:33`, `ResumenPage.test.tsx:246` |
| Route files are flat under `src/routes/_authenticated/`; thin containers stay untested; route-tree integration tests live in `src/test/` | `buckets.$bucket.tsx:12-18`, `src/test/app-shell-layout.test.tsx` |
| A **real-viewport Playwright harness already exists** (`movil` 360 / `tablet` 880 / `escritorio` 1280, chromium, `vite preview` of the prod build) | `playwright.config.ts` |
| `WCTG-14` shipped false precisely because a className assert was taken as proof of layout | `playwright.config.ts:8-11`, `e2e/tablet-grid.e2e.ts` |
| `apps/web` imports **nothing** from `apps/mobile` — the ports are duplicated source files, not shared modules | grep over `src/**`: only docblock references |
| a11y is app-wide `warn`, with an explicitly scoped `error` list (US-042/043 precedent) | `eslint.config.js:60-97` |

---

## 1. Architecture at a glance

The layering that already exists is sufficient; nothing new is introduced.

```
GET /api/resumen (unchanged)
        │  ResumenMesDto
        ▼
domain/resumen-view-model.ts ────────────────────────► ResumenViewModel
   ├── distribucion-gasto.ts   → distribucionGasto: TajadaGasto[]   (RING input: 4 items, geometry only)
   ├── distribucion-gasto.ts   → BUCKETS_5030 / BUCKETS_ANILLO      (membership, single source)
   └── formatear-monto.ts      → formatearMontoConSigno()           (LEGEND money labels)
        │                                    │
        │  leyendaPrincipal / leyendaComplemento : ItemLeyenda[]
        ▼                                    ▼
components/DistribucionPie.tsx        components/LeyendaGasto.tsx
   (pie-geometry.ts + inner radius)      (2 groups + <hr>, chevrons, tx count)
        └────────── components/ResumenScreen.tsx (composition, T1 grid, hint) ──────────┐
                             │                                                          │
                    components/SemaforoTag.tsx ──Link──► routes/_authenticated/semaforo.tsx (stub)
```

Three invariants govern every decision below:

- **I-1 — Money math stays where it is (ADR-024).** The only client derivations
  this change adds are: a sign prefix chosen by item kind, a CLP string, a
  count string, and the *share-of-spending* ratio that `calcularDistribucionGasto`
  already computed before this US. No basis points, no thresholds, no estado.
- **I-2 — `TajadaGasto` never learns about money.** The ring's input is
  geometry (`fraccion`) + its own label (`porcentaje`). The legend's money
  labels are a **separate projection** built in the view-model. Widening
  `TajadaGasto` with a `montoLabel` would fuse two consumers with different
  reasons to change (SRP).
- **I-3 — Pure math in `domain/`, colour/label/interaction in `components/`.**
  `pie-geometry.ts` receives absolute pixel radii, never a "donut ratio"
  design token; `distribucion-gasto.ts` never imports `lib/bucket-colors`.

---

## 2. Decisions (ADR-style)

### D-01 — Donut geometry: annular two-arc path, additive parameter

**Decision.** `arcoPath` gains a **trailing optional parameter**:

```ts
export function arcoPath(
  cx: number, cy: number, r: number,
  inicio: number, fin: number,
  rInterior = 0,          // NEW — absolute px, 0 = today's filled wedge
): string
```

- `rInterior === 0` → the function returns **the exact string it returns
  today**, byte for byte. This is the regression contract: the six existing
  `pie-geometry.test.ts` cases must pass **unmodified**.
- `rInterior > 0` → an annular wedge: outer arc forward, straight line inward,
  inner arc **backward** (sweep flag inverted), `Z`. The wedge no longer starts
  at `M cx cy`; it starts at the outer boundary point.
- Full-sweep branch (`barrido >= 359.999`, i.e. a single item holding 100 % of
  spend) with `rInterior > 0` → two subpaths: the outer circle (two half arcs)
  followed by the inner circle drawn with the **opposite** sweep flag, so the
  default non-zero fill rule punches the hole. Without this branch a
  100 %-in-one-bucket month would silently render a filled disc.
- **Guard:** `rInterior` is clamped to `[0, r)`. A value `>= r` degrades to `0`
  (filled wedge) instead of emitting an inverted, self-crossing path. Degrade,
  never throw — same discipline as `montoSeguro`.

**Also in `pie-geometry.ts`:** `export function radioEtiqueta(r, rInterior)`,
returning the mid-band radius `(r + rInterior) / 2`. Today `DistribucionPie`
hardcodes `r * 0.62` for label placement (`centroidLabel`); with a hole at
`0.58 r` that constant lands *inside the hole*. Deriving it keeps the label
centred in the band for any ratio and makes it unit-testable, which a magic
number inside a component is not.

**Rejected — stroke-based ring** (`<circle>` + `stroke-dasharray`/`dashoffset`).
It is less code for the shape, but it destroys three things this codebase
already paid for: the per-wedge `<path role="button" aria-pressed>` interaction
contract (a dash segment is not an addressable element), the wedge separator
stroke (WCAG 1.4.11, `PIE_WEDGE_STROKE`), and the `<5 %` label suppression
geometry. Trading working accessibility for shorter path math is a bad trade.

**Rejected — chart library.** Already rejected in the proposal; restated only
because the donut is the one moment where the temptation returns.

**Presentation side.** `DistribucionPie` owns the ratio:
`const RATIO_INTERIOR = 0.58;` → `rInterior = r * RATIO_INTERIOR` for the main
ring, `0` for the IDEAL inset. The ratio is a visual choice, so it lives in the
component, not in `domain/`.

### D-02 — The "IDEAL 50/30/20" inset **stays**, unchanged and filled

The wireframe does not show it. It ships today and works.

**Decision: keep it**, as a filled (`rInterior = 0`), non-interactive,
absolutely-positioned inset at bottom-right, exactly as it renders now.

Rationale:
1. No acceptance criterion asks for its removal; the proposal's Affected Areas
   table does not list it as removed. Deleting shipped, tested behaviour on the
   strength of an omission in a wireframe is scope creep in the *subtractive*
   direction.
2. YAGNI forbids building for hypothetical requirements. It does not license
   deleting a satisfied one. The 50/30/20 reference is the product's core
   metaphor (ADR-024's "cuánto dinero se muestra" side of the line).
3. It is the reason `BUCKETS_GASTO` cannot simply grow (see D-08) — keeping it
   forces the membership split to be modelled honestly rather than papered over.

**Reversal cost, recorded:** if the PO reads the wireframe as exclusive, removal
is ~20 lines in `DistribucionPie.tsx` (the `slicesIdeales` helper + the inset
`<div>`) plus two test cases, and `BUCKETS_5030` then survives as the legend's
grouping key. Cheap either way; the default is "keep", and the spec may override.

**The donut hole stays empty.** No centre total, no centre label. Nothing in
CA-01…CA-06 asks for one (YAGNI), and a centre total would be a *fourth*
place the same money is rendered.

### D-03 — Legend item model: one discriminated union, two ordered groups

```ts
// domain/resumen-view-model.ts
export type ItemLeyenda =
  | {
      readonly kind: 'gasto';
      readonly bucket: string;          // canonical domain name ('Deseos', not 'Gustos')
      readonly porcentaje: number;      // ring share from calcularDistribucionGasto's 4-item
                                         // apportionment (WG5-01/WG5-13); together with
                                         // SinCategoria's unlabeled share, the four sum to 100
      readonly montoLabel: string;      // '-$624.500'
    }
  | {
      readonly kind: 'sinCategoria';
      readonly bucket: string;          // 'SinCategoria'
      readonly montoLabel: string;      // '-$45.000'
      readonly cantidadLabel: string;   // '12 tx' — always present, never optional
    }
  | {
      readonly kind: 'ingreso';
      readonly montoLabel: string;      // '+$1.485.000'
    };
```

and on `ResumenViewModel`:

```ts
readonly leyendaPrincipal: ReadonlyArray<ItemLeyenda>;   // Necesidades, Deseos, Ahorro
readonly leyendaComplemento: ReadonlyArray<ItemLeyenda>; // Ingresos, SinCategoria
```

**Three kinds, not two.** The wireframe pins Sin categoría's row shape as
`name · N tx · −CLP amount` — no `%` — while the three spend buckets show
`name · % · CLP amount`. That is a real shape difference, not a labeling
nuance: `'gasto'` items always carry `porcentaje` and never a count; the Sin
categoría row always carries a count and never a `porcentaje`. Modeling that as
an optional field on a shared `'gasto'` kind — as an earlier draft of this
design did — would let a caller construct a `'gasto'` item with a
`cantidadLabel`, or omit `porcentaje` from Sin categoría: states the type
system should make unrepresentable. A dedicated `'sinCategoria'` kind makes the
wireframe's shape a compile-time guarantee. This does not reopen the earlier
"two kinds, not three" call against Ingresos: Ingresos still shares no
production-affecting field with either spend kind, so it stays its own,
minimal kind.

**Two arrays, not a `grupo` field.** The divider is a *visual* separation
between the 50/30/20 set and everything else. Expressing it as a field on the
item forces the component to detect group boundaries by comparing adjacent
elements — clever, fragile, and it lets a mis-ordered array render a divider in
the wrong place. Two ordered arrays make the divider **structural**: it is
whatever sits between the two `<ul>`s, and it cannot be wrong. This is not the
"three parallel lists by kind" the proposal rejected: the discriminated union is
preserved intact; grouping is an orthogonal axis. The divider element itself is
viewport-conditional per the wireframe (T1 tablet: absent; desktop: present) —
implemented as a Tailwind class on the separator only (e.g. `hidden lg:block`,
see D-09), never as conditional JSX; the "whatever sits between the two
`<ul>`s" structural guarantee is unaffected, since the array boundary stays
fixed regardless of viewport — only the separator's own visibility toggles.

**Interactivity is not a field.** No `esClickeable: boolean`. It is derived in
presentation from `kind`: `'gasto'` and `'sinCategoria'` → `<button>` +
chevron (both drill down, `WCAT-01..05`), `'ingreso'` → inert `<li>`. A boolean
with exactly one possible value per kind is a flag that is never toggled.

**Where the money comes from.** `TajadaGasto` has no money (I-2), so
`aResumenViewModel` joins by bucket name against `dto.buckets` (a `Map` built
once) to produce `montoLabel`. `dto.totalIngreso` feeds the `'ingreso'` item;
`dto.cantidadSinCategoria` and its bucket total feed the `'sinCategoria'`
item's `cantidadLabel`/`montoLabel`. `viewModel.totalIngreso` (unsigned) is
**left untouched** because `IngresoCard` consumes it — the signed label is an
addition, not a replacement.

**Sign rule (client-only, ADR-024).**
`'gasto'` and `'sinCategoria'` → `-`, `'ingreso'` → `+`, chosen **from
`kind`**, never read from the data. Explicit edge rule: **a zero magnitude
renders with no sign** (`$0`, not `-$0`) — a sign communicates the direction of
an actual flow. ASCII `-`/`+`, matching `formatearMontoCLP`'s existing `-`, not
the typographic U+2212.

### D-04 — `formatearMontoConSigno`, a new function (not a new parameter)

```ts
export function formatearMontoConSigno(montoStr: string, signo: '+' | '-'): string
```

`formatearMontoCLP` is left **byte-identical**. It is consumed across the app
and its "prefix `-` iff the BigInt is negative" behaviour is load-bearing;
adding an options bag to it would put an unused branch in every existing call
site.

Contract of the new function:
- validates via the existing `esMontoStringValido` (no second regex — DRY),
- operates on the **absolute magnitude**, then prefixes the caller's sign, so a
  hypothetical negative input can never produce `--$100`,
- magnitude `0` → no prefix, delegating to `formatearMontoCLP` unchanged,
- never `parseFloat`/`Number` on a money string; BigInt + string ops only
  (ADR-015; the existing above-2^53 test class extends to it).

The sign is a **caller** decision. The formatter does not know what a bucket is.

### D-05 — Ring membership: `BUCKETS_GASTO` is deleted, replaced by two constants

```ts
export const BUCKETS_5030  = ['Necesidades', 'Deseos', 'Ahorro'] as const;
export const BUCKETS_ANILLO = [...BUCKETS_5030, 'SinCategoria'] as const;
```

- `calcularDistribucionGasto` iterates `BUCKETS_ANILLO` → **4 wedges, and
  SinCategoria enters the denominator**. This is the substantive behaviour
  change of the US: the ring can only sum to 100 across its own wedges, so the
  uncategorized amount now *dilutes* the three spend percentages. It must be
  stated in the spec as an intended semantic change, not discovered in review.
  It remains the same *share-of-spending* client derivation that already
  existed — it is not `porcentajeBp` and does not touch the 50/30/20 reading
  (`BucketViewModel.porcentajeLabel`, still backend `porcentajeBp` verbatim).
- `slicesIdeales` (IDEAL inset) iterates `BUCKETS_5030` → indexing `targets`
  stays total. **Had the old constant merely grown, the inset would have read
  `targets.SinCategoria` (`undefined`) and rendered `NaN` paths.** This is the
  single most likely silent break in the change.
- The view-model splits the legend groups by `BUCKETS_5030` membership.

**The old name is removed, not aliased.** Deleting `BUCKETS_GASTO` makes `tsc`
fail at every call site and forces each one to declare which set it meant —
the same compiler-enforced migration ADR-036/ADR-037 used when retiring
`foldCategoriaId` and the closed `Categoria` enum. An alias would let the IDEAL
inset keep the wrong set and compile.

### D-06 — `SemaforoBadge` is **not** converted; a new `SemaforoTag` is added

`SemaforoBadge` renders 12 more times inside `ResumenAnual`'s month grid. Making
it a `<Link>` would put 12 stray navigation targets in the annual table — a
behaviour change in a component this US does not own.

**Decision.**
- `SemaforoBadge.tsx` keeps its current public behaviour. Its test file must
  stay green **with zero edits** — that is the proof the annual grid was not
  collaterally changed.
- The estado→(word, tone) table moves to `lib/semaforo-estilos.ts`, consumed by
  both components. This is extraction at the *second* occurrence, deliberately
  ahead of the "three strikes" rule, because it is a **data table keyed by a
  wire enum**, not a guessed shape: two copies drifting would show two different
  Spanish words for the same state on the same screen. The `null`/unknown →
  "Sin datos" fallback (W2-02: never coerced into a known colour) moves with it.
- `components/SemaforoTag.tsx` (new): a `<Link to="/semaforo" search={{ periodo }}>`
  rendering `[dot] Semáforo: {estado} ›`.

**Null `estadoGlobal` → still a link**, labelled "Semáforo: Sin datos ›".
A control that appears and disappears based on data is a worse pattern than one
that always exists and explains itself, and the destination page is precisely
where "there is no data for this month" belongs. One code path (`kiss`). Note
the dashboard only renders when `sinIngreso === false`, so this is defensive,
not a common path.

**`search={{ periodo }}` is carried.** The stub route declares
`validateSearch` with `normalizarPeriodo`, exactly like `index.tsx` and
`buckets.$bucket.tsx`. This is extensibility at zero cost: dropping the period
on navigation would be a real defect the moment US-049 renders content, and the
normalizer already exists.

**No shadcn primitive.** `ui/badge.tsx` is a `cva` span variant; the tag is a
link with a chevron and a colour dot, and `DASHBOARD_CARD_CLASS`'s docblock
already records why this dashboard does not adopt the vendored visual language
piecemeal. Plain Tailwind + `lucide-react`'s `ChevronRight` (ADR-027).

### D-07 — `/semaforo` stub route

`src/routes/_authenticated/semaforo.tsx`, flat naming (matches every sibling),
under the authenticated layout so it inherits `requireSession` + `AppShell`.

```
createFileRoute('/_authenticated/semaforo')
  validateSearch → { periodo?: string }  via normalizarPeriodo
  component      → <h1>Semáforo</h1> + "en construcción" copy + <Link to="/">Volver al resumen</Link>
```

It renders an explicit under-construction state, never a blank page and never a
404 (the proposal's stated mitigation for the dead-end risk). It stays a thin
container per the `buckets.$bucket.tsx` precedent — but see §5 for why it does
get a route-tree integration test even though route containers are normally
untested here.

**Where the interim decisions are documented in code** — exactly two places, so
they cannot drift:
1. `LeyendaGasto.tsx`, on the `'ingreso'` branch: why that row is an inert
   `<li>` and not a disabled button, and the trigger that would make it
   interactive (a real Ingresos drill-down, which has no endpoint and no US
   today — CA-04).
2. `routes/_authenticated/semaforo.tsx` docblock: this is a US-049 stub, its
   trigger, and the fact that it must not be deleted while `SemaforoTag` links
   to it (CA-03).

### D-08 — Component-level changes

| Component | Change | Not changed |
|---|---|---|
| `DistribucionPie` | `RATIO_INTERIOR` + `rInterior` threaded to `arcoPath`; label radius via `radioEtiqueta`; 4 wedges | `role="group"`/`role="img"` switch, `aria-label`, per-wedge `role="button"`/`aria-pressed`/Enter-Space, `PIE_WEDGE_STROKE`, `PIE_LABEL_FILL`, `<5 %` label suppression, IDEAL inset (filled, 3 wedges, non-interactive) |
| `LeyendaGasto` | takes `principales` + `complemento`; renders two `<ul>`s with a viewport-conditional `<hr>` between (`hidden lg:block`, D-09); adds chevron, `montoLabel`, `cantidadLabel`; `'ingreso'` renders as an inert `<li>`; **no longer returns `null` when there is no spending** (the complement group still renders) | `outline-slate-800` focus ring (LOCKED, WCAG 1.4.11), `px-2 py-1` target size (LOCKED, WCAG 2.5.8), `aria-pressed`, colour dot via `lib/bucket-colors` |
| `SemaforoBadge` | imports the extracted style table | everything else — zero behavioural diff |
| `SemaforoTag` | new | — |
| `ResumenScreen` | drops the hardcoded `BUCKET_SIN_CATEGORIA` legend row (now view-model data); swaps `SemaforoBadge` → `SemaforoTag` in the card header; adds the T1 grid on the card body; adds the hint text | page-level `p-4` / `grid-cols-1 lg:grid-cols-2`, the single `<h1>`, the FIX 5 period-reset guard, `bucketPorDefecto` defaulting, `BucketDetailList` panel |

**Accessible-name change (a11y improvement, deliberate).** Today a legend row's
`aria-label` is just the bucket label, which **overrides** its content — a
screen-reader user hears "Necesidades, button" and never the percentage or the
amount. With the row now carrying three data points, the `aria-label` is
**removed** and the accessible name is computed from the row's own visible text
("Necesidades 42 % -$624.500"), which also satisfies WCAG 2.5.3 Label in Name
for free and removes a duplicated string that could drift. The **pie wedge keeps
its concise `aria-label`** (a wedge has no text of its own). This is a real
behaviour change with real test consequences — see §6.

**Colour for the new wedge.** `COLOR_BUCKET` has no `SinCategoria` entry today,
so a naive 4-wedge ring would fall back to `#CCCCCC`. Add a deliberate neutral
grey and, per `lib/bucket-colors.ts`'s own docblock contract, a matching
`@theme` token in `index.css`. It must **not** reuse `COLOR_EXCESO` — over
budget and uncategorized are different meanings and sharing the accent would
teach the user the wrong thing. The `PIE_LABEL_FILL` (`#1a1c1c`) contrast floor
and the white separator stroke must be re-checked against the chosen grey.

**Hint text.** A single muted line under the legend, full width, owned by
`ResumenScreen` (it describes the screen's interaction model, not the legend's
data). Plain visible text — no `aria-describedby` wiring: the rows are buttons
with self-explanatory names, and pointing a description at five controls would
make every one of them announce the same sentence.

### D-09 — T1 tablet variant

**What changes:** the chart card's **body** goes from stacked
(donut above legend) to side-by-side (donut left, legend right) at Tailwind's
stock `md` (≥768 px). The **page-level** grid boundary stays at `lg` — the
transactions panel needs more width than a tablet has, and moving it would
silently re-cut a layout this US does not own.

```
ResumenScreen
  page grid          grid-cols-1                lg:grid-cols-2     ← UNCHANGED
    chart card
      card body      grid grid-cols-1 gap-4     md:grid-cols-2     ← NEW, data-testid="grafico-card-body"
        ├ DistribucionPie (fixed size 240)
        └ LeyendaGasto
      hint text (full width, below the body)
    transactions panel
```

**Donut size stays a fixed `240` prop default.** Nothing in CA-05 asks for a
fluid chart, and a responsive SVG size would need a resize observer or a
container query for a shape that already fits every tier
(360 px viewport − 16 px page padding ×2 − 20 px card padding ×2 = 288 px).

**Why `grid` and not `flex-row`:** the acceptance evidence for this tier is
`getComputedStyle(el).gridTemplateColumns` track counting — the exact mechanism
the `WCTG-14` repair used. A flex row has no equally crisp computed-style
signature.

**Divider visibility follows the same tablet/desktop split.** The legend's
divider (D-03) is hidden through the T1 tablet tier and appears only at the
desktop tier — `hidden lg:block` on the separator element, `lg` (≥1024px)
being this spec's existing desktop threshold (`WCTM-01`'s upper tablet bound).
This is a CSS-only toggle, not a second rendered branch: the divider element
is always in the DOM; only its Tailwind display utility changes with
viewport. `WG5-10`'s tablet scenario is the geometry proof that it is actually
absent at the tablet viewport, not merely styled `display: none` in theory.

### D-10 — a11y scope in `eslint.config.js`

Add one scoped-`error` block. Unlike US-042/043, the touched files are **loose
in `src/components/`**, so the directory-glob rationale does not transfer:
globbing `src/components/**` would make this US absorb the app's entire
pre-existing a11y debt — precisely what the US-042 comment says the app-wide
`warn` exists to avoid.

```js
{
  files: [
    'src/components/DistribucionPie.tsx',
    'src/components/LeyendaGasto.tsx',
    'src/components/SemaforoBadge.tsx',
    'src/components/SemaforoTag.tsx',
    'src/components/ResumenScreen.tsx',
    'src/routes/_authenticated/semaforo*.tsx',   // pattern, US-043 D-10 precedent
  ],
  extends: [jsxA11y.flatConfigs.recommended],
}
```

The comment must record **why it is a file list** and register the follow-up
(extracting a `src/components/dashboard/` directory so the list can collapse
into a glob) as debt with its trigger — not do it now.

---

## 3. Data flow, end to end

**DTO guard extension (WG5-05).** `esResumenMesDto` (`apps/web/src/api/client.ts:80-93`) validates
`totalIngreso`, `buckets` and `estadoGlobal`, but today does **not** validate `cantidadSinCategoria` — a
payload missing it, or carrying it as a non-number, currently passes the guard. Since the legend now reads
`cantidadSinCategoria` directly, this change extends the guard with a `typeof candidato.cantidadSinCategoria
=== 'number'` clause, the same shape as the existing `totalIngreso` check. A payload failing the extended
guard takes the pre-existing `esResumenMesDto`-rejection error path (`WAC-02`) — no new error-handling
branch. Everything downstream of the diagram below assumes a payload that has already passed this guard.

**Blast radius: `esResumenAnualDto` shares this guard, verified safe.** `esResumenAnualDto` reuses
`esResumenMesDto` unmodified to validate each of the 12 months in `/api/resumen/anual`'s response
(`candidato.meses.every(esResumenMesDto)`); the tightened guard therefore also gates that endpoint, not
only `/api/resumen`. This cannot regress `fetchResumenAnual`: the annual DTO is built server-side via
`aResumenMesDto`, which unconditionally populates `cantidadSinCategoria` for every month
(`resumen-mes.dto.ts:100`) — every real payload already satisfies the new clause, so the only payloads the
tightened guard newly rejects are already-malformed ones that the endpoint's own contract does not produce.

```
ResumenMesDto
 ├─ buckets[]            ─┬─► calcularDistribucionGasto(BUCKETS_ANILLO)  ─► TajadaGasto[4]  ─► ring wedges + on-wedge %
 │                        └─► Map<bucket,total> ──┐
 ├─ totalIngreso ─────────────────────────────────┤
 ├─ cantidadSinCategoria ─────────────────────────┤
 │                                                ▼
 │                        formatearMontoConSigno(kind) + `${n} tx`
 │                                                │
 │                            leyendaPrincipal[3] ┤ ('gasto', '-')
 │                            leyendaComplemento[2]┘ (ingreso '+', SinCategoria '-' + count)
 ├─ estadoGlobal ────────────────────────────────────► SemaforoTag (verbatim, never recomputed)
 └─ periodo ─────────────────────────────────────────► SemaforoTag search param
```

**Edge cases, decided:**

| Case | Behaviour |
|---|---|
| No spending at all (`distribucionGasto === []`) | Ring renders the muted placeholder (unchanged). `leyendaPrincipal` is empty; **the complement group still renders** so Ingresos remains visible. |
| `cantidadSinCategoria === 0` | The Sin categoría row **still renders**, `0 tx`. A legend that changes shape month to month is harder to read than one that says "nothing pending". |
| SinCategoria total is `0` | It is still a ring item at `0 %`; the degenerate wedge already has a no-NaN guard (FIX 8) and the `<5 %` rule suppresses its label. |
| One bucket holds 100 % of spend | Full-sweep annular branch (D-01) — must render a **ring**, not a disc. |
| Amount magnitude `0` | `$0`, no sign (D-03). |
| `estadoGlobal === null` | Tag still links; label "Sin datos"; never coerced into a colour. |
| Money string malformed | Existing `montoSeguro` / `esMontoStringValido` degrade to `0n`; the new formatter inherits the same guard. |

---

## 4. Verification design

### 4.1 The rule for updated assertions

Every assertion that moves from 3 to 5 (or 3 to 4) must be **renamed to the
behaviour it newly proves**. A number changed in place with the old test name
intact is a blind re-record and is rejected in review. The table in §6 names the
new proof for each one.

### 4.2 Layers

| Layer | Runner | Proves |
|---|---|---|
| Pure unit | vitest | arc math, membership, apportionment, sign/format, view-model projection |
| Component | vitest + jsdom + RTL | rendered structure, roles, names, `aria-pressed`, path shape |
| Route-tree integration | vitest + real `routeTree.gen` (the `src/test/` precedent) | `/semaforo` is actually registered and reachable; the tag navigates; the period survives |
| **Real viewport** | **Playwright** (`e2e/`, existing harness) | **T1 (CA-05) — the only layer allowed to satisfy it** |

### 4.3 CA-05 is Playwright-only

jsdom evaluates no layout. A `md:grid-cols-2` className in the markup is not
evidence that two tracks render at 880 px — that is exactly how `WCTG-14`
shipped false. New spec `e2e/dashboard-donut.e2e.ts`:

- `tablet` (880): `getComputedStyle(grafico-card-body).gridTemplateColumns`
  resolves to **2 tracks**; and the legend's bounding box starts to the **right**
  of the donut `<svg>`'s bounding box (geometry, not class).
- `tablet` (880), divider: the legend divider element's `getComputedStyle(...).display`
  resolves to `none` and its bounding box has zero area — absent from real geometry,
  not merely styled `hidden lg:block` in the markup (`WG5-10`).
- `movil` (360): the same element resolves to **1 track**; the legend's bounding
  box sits **below** the svg.
- `movil` (360), divider: same zero-area/`display: none` absence proof as tablet,
  closing the gap where the divider's mobile-tier behaviour otherwise has no
  geometry proof (`WG5-10`'s new mobile scenario).
- `escritorio` (1280): page grid still 2 tracks (the existing `lg` behaviour did
  not regress).
- `escritorio` (1280), divider: the divider's bounding box is present — non-zero
  area, `display` resolves to a visible value — sitting between the spend-bucket
  rows and the Ingresos/Sin categoría rows (`WG5-03`).

A jsdom className assertion may exist as a cheap smoke check **only if its test
name says it is a smoke check and not the CA-05 proof.**

**Fixture work this requires:** `e2e/fixtures/api-stubs.ts` currently stubs only
`/api/auth/me`, `/api/categorias` and `/version`. The dashboard additionally
calls `GET /api/resumen`, `GET /api/resumen/anual` and `GET /api/buckets/:bucket`.
Those three stubs must be added as **literal instances of `src/api/types.ts`
DTOs**, per that file's own stated rule (a fixture drifting from the contract
makes the suite assert against a fiction).

### 4.4 Router harness for component tests

`SemaforoTag` renders a TanStack `<Link>`, which throws without a router
context — and `ResumenScreen` now contains it. `ResumenScreen.test.tsx` today
wraps only in a `QueryClientProvider`.

**Decision:** add `src/test/router-harness.tsx` (not a `.test.` file;
`src/test/**` is already excluded from coverage) exporting a
`renderConRouter(ui, { initialPath })` that builds a **minimal memory router** —
a root route rendering `ui` plus a `/semaforo` route rendering a sentinel — with
no auth and no real route tree. `ResumenScreen.test.tsx`'s single `renderScreen`
helper routes through it, so the harness change is one function, not twelve
tests. `SemaforoTag.test.tsx` uses the same helper.

**Rejected:** threading the tag in as a `ReactNode` slot prop through
`ResumenPage` → `ResumenScreen` purely to keep the tests router-free. It would
push a routing concern up through two router-agnostic layers to protect a test
setup — the tail wagging the dog. The dashboard now genuinely contains
navigation; its tests should say so.

**Rejected:** a plain `<a href>` instead of `<Link>` — it would full-page
reload, breaking SPA navigation everywhere else in the shell.

---

## 5. Test plan per suite

| Suite | Δ | The behaviour each change must newly prove |
|---|---|---|
| `api/client.test.ts` | +2 | `esResumenMesDto` (WG5-05): a payload missing `cantidadSinCategoria`, or carrying it as a non-number, is rejected (`false`) — the pre-existing `WAC-02` rejection path, no new branch; a payload with `cantidadSinCategoria: 0` is accepted ⇒ a legitimate zero is not confused with a missing/invalid field by the guard itself. |
| `domain/pie-geometry.test.ts` | +5 cases, **0 edits** | Existing 6 pass untouched ⇒ the donut is additive. New: (a) omitting `rInterior` returns the exact legacy string; (b) an annular wedge does **not** start at `M cx cy` and contains both radii ⇒ the hole exists; (c) the 0→360 sweep with an inner radius emits two subpaths with opposite sweep flags and no `NaN` ⇒ a 100 %-single-bucket month is a ring, not a disc; (d) `rInterior >= r` degrades to a filled wedge instead of inverting; (e) `radioEtiqueta` returns the mid-band radius. |
| `domain/distribucion-gasto.test.ts` | 1 **inverted**, +3 | `:43` "excluye SinCategoria del pie y del denominador" → **"incluye SinCategoria en el anillo y en el denominador"**: the uncategorized amount now dilutes the three spend percentages — the semantic core of the US. New: the 77/12/11 mockup case with `SinCategoria: 0` still reads 77/12/11 ⇒ a zero fourth bucket does not shift the existing reading; all four sum to exactly 100 under largest-remainder; `BUCKETS_ANILLO` ends with `SinCategoria` and `BUCKETS_5030` excludes it (ring order + membership pinned). |
| `domain/formatear-monto.test.ts` | +4 | `+`/`-` come from the caller, never the data; a negative input never yields `--`; magnitude `0` carries no sign; a value above 2^53 keeps every digit through the signed path. |
| `domain/resumen-view-model.test.ts` | 1 inverted, +5 | `:147` inverted for the same reason as above. New: `leyendaPrincipal` is exactly the three 50/30/20 items in canonical order, all `kind:'gasto'`, all `-`-prefixed; `leyendaComplemento` is `[ingreso(+), SinCategoria(-, cantidadLabel)]`; `cantidadSinCategoria: 0` ⇒ `'0 tx'` and the row still exists; `TajadaGasto` still carries **no** `montoLabel` ⇒ I-2 held; `estadoGlobal`/`porcentajeLabel` still pass through verbatim ⇒ no estado math leaked client-side (CA-06). |
| `components/DistribucionPie.test.tsx` | 3 edits, +3 | `pie-slice` 3→4 renamed to "one wedge per **ring** item, including Sin categoría"; the fills array gains the new neutral grey ⇒ Sin categoría has a deliberate colour, not the `#CCCCCC` fallback; `getAllByRole('button')` 3→4 ⇒ the new wedge is selectable **and** the IDEAL inset still contributes none. New: main-ring wedge paths do not start at the centre and reference the inner radius (the CA-01 "donut" proof at unit level); the IDEAL inset's wedges **do** start at the centre and still number 3 ⇒ the inset kept the 50/30/20 set and did not inherit the hole; the Sin categoría wedge's on-wedge `%` label follows the same uniform `≥5 %` rule (`showLabels`) as the three spend wedges ⇒ no special-case suppression for its wedge label (R-6 scopes the `%` omission to the legend row only). Untouched: `PIE_LABEL_FILL`, `PIE_WEDGE_STROKE`, `role="group"`/`img`. |
| `components/LeyendaGasto.test.tsx` | 3 edits, +5 | `leyenda-item` 3→5 renamed to "three 50/30/20 rows, a separator, then Ingresos and Sin categoría"; the `{ name: 'Necesidades' }` queries become content-derived-name queries ⇒ the row now announces label + % + amount instead of the bucket name alone; "renders nothing when there is no spending" → **"still renders the Ingresos row when there is no spending"**. New: Ingresos is not a `button`, has no `%`, and is not `aria-disabled` (CA-04 interim); spend amounts start `-` and Ingresos starts `+` (CA-02); Sin categoría **is** a button and shows `N tx` with an `sr-only` expansion; the chevron is `aria-hidden` and absent from the accessible name; the separator sits between the two groups. Untouched (must NOT be re-recorded): `outline-slate-800`, `px-2`/`py-1`. |
| `components/SemaforoBadge.test.tsx` | **0 edits** | Green with zero diff ⇒ extracting the style table did not change the badge, and `ResumenAnual`'s 12 instances were not collaterally converted into links. |
| `components/SemaforoTag.test.tsx` (new) | +5 | Renders an `<a>` whose accessible name carries the estado **word** (not colour alone, ADR-018/W2-02); `href` targets `/semaforo` and carries `?periodo=`; `null` → "Sin datos" and **still a link**; an unknown wire value is not coerced into a known colour; the chevron is `aria-hidden`. |
| `components/ResumenScreen.test.tsx` | ~5 edits, +3 | `renderScreen` routes through the router harness (one helper, not twelve tests). Bucket button counts: Sin categoría 1→2 ⇒ it joined the ring; the three spend buckets stay at 2 but with regex names ⇒ wedge name stays concise while the row name grew. `semaforo-global` now resolves to a **link**, not a static `img` ⇒ CA-03 at composition level. New: the hint text renders; the card body carries the T1 grid (labelled a **smoke** check, CA-05 proof is Playwright). Untouched: the WDS-04 test asserting page-level `p-4`/`grid-cols-1`/`lg:grid-cols-2` ⇒ proof the page boundary did **not** drift to `md`. |
| `src/test/semaforo-route.test.tsx` (new) | +2 | Through the **real generated route tree**: `/semaforo` resolves and renders the under-construction state (not blank, not 404) ⇒ the route is genuinely registered, which no component test can show; navigating from the dashboard tag lands there with the period preserved. |
| `e2e/dashboard-donut.e2e.ts` (new) | +6 | CA-05, at real viewports — see §4.3 (3 grid-layout assertions + 3 divider bounding-box/display assertions: absent at tablet 880, absent at mobile 360, present at desktop 1280). |
| `e2e/fixtures/api-stubs.ts` | +3 stubs | `/api/resumen`, `/api/resumen/anual`, `/api/buckets/:bucket` as literal DTO instances. |
| `components/ResumenPage.test.tsx` | **0 edits** | CA-01 is already satisfied and already pinned (`:246`). The spec delta must say "reused unchanged"; the absence of a diff here is the evidence. |

---

## 6. Impact check — mobile and shared code

**`apps/mobile` is untouched by this US** (parity is US-050).

Verified, not assumed:

- `apps/web/src/**` contains **no import** from `apps/mobile` — every reference
  is a docblock note ("DOM port of …"). The ports are **duplicated source
  files**, which is the deliberate ADR-008 decision (no `packages/shared`).
  Web-side edits to `pie-geometry.ts`, `distribucion-gasto.ts`,
  `formatear-monto.ts`, `LeyendaGasto.tsx`, `DistribucionPie.tsx` and
  `SemaforoBadge.tsx` therefore cannot break mobile at compile or run time.
- `lib/bucket-colors.ts` already carries an explicit "do **NOT** port this to
  `apps/mobile`" instruction — the divergence is pre-existing and sanctioned.
- The one genuinely shared artifact, `packages/api-client`, is consumed
  **type-only** (`export type { BucketResumenDto, ResumenMesDto }`). No change
  to it, no change to `apps/api`. Any task touching either is scope creep, per
  the proposal's Affected Areas table.
- Divergence cost, recorded as debt with its trigger: after this change the web
  and mobile ports differ in ring membership, donut geometry and sign
  convention. US-050 is the trigger to reconcile; it will port the **decisions**
  in this document, not diff the files.

---

## 7. Risks carried into tasks

| # | Risk | Mitigation owned by |
|---|---|---|
| R-1 | `BUCKETS_GASTO` grown in place instead of split ⇒ IDEAL inset renders `NaN` paths from `targets.SinCategoria` | D-05: delete the old name so `tsc` fails at every call site; the inset test pins 3 wedges |
| R-2 | The 3→5 rewrite re-records assertions blindly and hides a regression | §4.1 + the §5 table: every edited assert must be renamed to what it newly proves |
| R-3 | T1 asserted by className only (the `WCTG-14` failure mode) | §4.3: CA-05 is satisfiable **only** by the Playwright harness; jsdom checks must be labelled smoke |
| R-4 | The T1 layout here is a design inference — the wireframe was not available to this phase | Spec must confirm the tablet arrangement against the wireframe before tasks; if it differs, only §D-09's grid target changes, not the mechanism |
| R-5 | Sin categoría entering the denominator changes numbers the user already knows | Must be an explicit `WG5-*` requirement, not an implementation detail |
| R-6 | Whether the Sin categoría row shows `%` alongside its `N tx` is a CA-02 reading | **Resolved: no, in the legend row only.** The wireframe pins the row as `name · N tx · −CLP amount` — the legend row intentionally trades the percentage for a transaction count, which the three spend-bucket rows do not carry. This does NOT change the ring: the Sin categoría wedge keeps the same uniform on-wedge `≥5 %` label rule as the other three wedges (`showLabels`, `WG5-01`/`WG5-03`) — no special-case suppression for its wedge label, only for its legend row's `%`. `ItemLeyenda`'s `'sinCategoria'` kind (D-03) has no `porcentaje` field, making the legend-row omission unrepresentable in code, not just documented |
| R-7 | D-02 keeps the IDEAL inset against a silent wireframe | Reversal cost is recorded in D-02; spec may override cheaply |
| R-8 | Removing the legend `aria-label` changes the accessible name across three suites | Deliberate (D-08); the query migration is listed per suite in §5 |
| R-9 | The Playwright fixture must grow three DTO stubs before CA-05 can be verified | §4.3; must be its own task, ordered **before** the T1 task |
| R-10 | `/semaforo` ships and US-049 slips | Stub renders an explicit under-construction state + "volver al resumen"; debt registered with US-049 as trigger (D-07) |
| R-11 | The new Sin categoría grey must clear the `PIE_LABEL_FILL` and separator-stroke contrast floors | D-08; contrast check is a task acceptance item, and `index.css` `@theme` parity is part of it |

---

## 8. What this design explicitly does **not** do

- No chart library, no `packages/shared`, no new shadcn primitive.
- No centre label in the donut hole.
- No responsive/fluid SVG sizing.
- No `vitest-axe` installation (pre-existing ADR-018 gap; CA-06 is met by the
  scoped `eslint-jsx-a11y` gate — explicitly not this US's job).
- No Ingresos drill-down, no `/buckets/Ingresos`, no backend field.
- No change to `porcentajeBp`, `estadoSemaforo`, `estadoGlobal` or any
  backend-computed value — they keep passing through verbatim (ADR-024).
- No `apps/mobile` parity work.
