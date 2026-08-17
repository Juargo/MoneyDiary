# Design: US-050 — Mobile dashboard with parity (5-item chart + annual table)

> Scope contract: this design answers `proposal.md` and nothing else. Its "Out of Scope (binding
> decisions — closed)" and "Closed Questions" are settled product decisions and are treated here as
> immovable inputs. Where a §Approach sentence and a Closed Question collide, the Closed Question
> wins and the reconciliation is recorded explicitly (see D-05).

---

## 0. Architecture at a glance

No new architectural pattern. `apps/mobile` keeps the exact four-tier split it has had since
Sprint 3, and every new artifact lands in the tier it already belongs to:

```
app/index.tsx            ← route + state owner: periodo, mes fetch, shell composition
  └─ src/components/     ← pure presentation (props in, JSX out; no fetch, no env, no money math)
       └─ src/domain/    ← pure functions: view-model, formatting, ring math, period helpers
  └─ src/api/            ← fetch boundary: ApiResult<T>, never throws
  └─ src/theme/          ← design tokens (hex literals for SVG fills)
```

Dependency rule (mobile analog of ADR-005): `domain ← components ← app`; `api` is a leaf the route
owns. `domain` never imports React Native, `react-native-svg`, or `theme/`. That is why
`TajadaGasto` carries `bucket/porcentaje/fraccion` only and the hex color is resolved in
presentation via `COLOR_BUCKET` — unchanged, and preserved by everything below.

### Composition tree after this change

```
SafeAreaView                                        app/index.tsx
└─ ScrollView                                       (shell — always rendered)
   ├─ Header  periodoLabel = formatearPeriodoLabel(periodoVista)
   ├─ SLOT ── switch(estadoMes)                     ← the ONLY thing that swaps
   │   ├─ 'loading'            → <Loading />
   │   ├─ 'error'              → <ErrorState error onRetry />
   │   ├─ 'data' + sinIngreso  → <Empty />                     (Closed Question 1)
   │   └─ 'data'               → <ResumenScreen viewModel />
   │                               ├─ IngresoCard
   │                               └─ card: [heading · SemaforoTag]
   │                                        DistribucionPie  (4-wedge donut, label-less)
   │                                        LeyendaGasto     (5 rows, inert)
   └─ ResumenAnual  anio periodoSeleccionado onSelectPeriodo   ← owns its OWN fetch + states
       └─ MesCelda ×12 (Pressable) → MiniDistribucionPie (44px, label-less)
├─ Pressable "Subir cartola"                        (unchanged)
└─ Pressable "Cerrar sesión"                        (unchanged)
```

Two independent network reads live on this screen after US-050 (`/api/resumen` owned by the route,
`/api/resumen/anual` owned by `ResumenAnual`). Neither can blank the other.

**Shell `ScrollView` sizing requirement.** `Loading`, `ErrorState`, and `Empty` are all styled
`flex-1 items-center justify-center` and only center correctly when they are (or sit inside) a
flexed ancestor — true pre-US-050, when the SLOT was the sole child of a flexed `SafeAreaView`;
false by default once the SLOT sits one level deeper, inside a `ScrollView` (RN's `ScrollView`
sizes its content to content height, not to the viewport). The shell `ScrollView` in
`app/index.tsx` MUST set `contentContainerStyle={{ flexGrow: 1 }}` so the SLOT's full-screen
states keep their centering. This is a layout requirement no RNTL test can measure (RNTL does not
lay out): verification is Maestro/manual on the EAS internal build (ADR-022), not a unit-test
gate.

---

## 1. Layer-by-layer design

### 1.1 `src/domain/formatear-monto.ts` (MODIFIED)

Port web's two additions **verbatim** and adopt web's stricter guard:

```ts
const FORMATO_DECIMAL_VALIDO = /^-?\d+$/;
export function esMontoStringValido(montoStr: string): boolean
export function formatearMontoCLP(montoStr: string): string          // now guarded by the regex
export function formatearMontoConSigno(montoStr: string, s: '+'|'-'): string
```

`esMontoStringValido` is required by two new consumers: `montoSeguro` inside the ported ring math
(§1.2) and the fetch-boundary money guards (§1.5). `formatearMontoConSigno` is required by the
legend (`+$1.000.000` for Ingresos, `−$400.000` for spend rows).

Adopting web's regex tightens mobile's `formatearMontoCLP`: today a bare `BigInt(...)` silently
accepts `'0x10'`, `'0o7'`, `'+100'`, `' 100'` and resolves them to a *different* number — a real
money-safety hole web already closed and whose docstring names mobile as the laggard. Behaviour for
every well-formed decimal string is byte-identical, so the 7 existing cases stay green unedited.

### 1.2 `src/domain/distribucion-gasto.ts` (MODIFIED)

The convergence back to web (which was originally a port *of this file*):

| today (mobile) | after |
|---|---|
| `const BUCKETS_GASTO = ['Necesidades','Deseos','Ahorro']` (private) | `export const BUCKETS_5030 = [...]` + `export const BUCKETS_ANILLO = [...BUCKETS_5030, 'SinCategoria']` |
| `BigInt(porNombre.get(...))` — throws on a malformed total | `montoSeguro(...)` — degrades to `0n` |
| apportions over 3 items | apportions over `BUCKETS_ANILLO` (4 items); `SinCategoria` **dilutes** the other three (US-047 WG5-13) |

`PRECISION`, the BigInt ratio, and `apportionarLargestRemainder` are copied byte-for-byte — the
percentages still always sum to exactly 100.

**Deliberate signature divergence from web (D-08):** mobile does **not** port web's trailing
optional `bucketsIncluidos` parameter. That parameter exists on web only as the residue of a
US-047 PR-boundary shim; on mobile every call site wants the full 4-item ring, and the legend
*filters* (never renormalizes) for display, exactly like web's post-T11 end state. A parameter with
one possible value is a flag that is never toggled (yagni). Parity is protected by the shared
fixture table (D-09), not by signature mimicry.

Deleting `BUCKETS_GASTO` rather than aliasing it is intentional — the same reason web gave: `tsc`
must fail loudly at every stale call site instead of silently keeping a 3-item membership.

### 1.3 `src/domain/periodo-anual.ts` (NEW)

Verbatim port of the subset of web's module this screen actually consumes:

```ts
export function mesAbreviado(periodo: string): string        // '2026-07' → 'JUL'
export function mesCompletoLabel(periodo: string): string    // '2026-07' → 'julio 2026'
export function anioDePeriodo(periodo: string, anioPorDefecto: number): number
export function periodoActualUTC(ahora: Date): string        // UTC, never local time
```

Not ported: `periodoDesde`, `esPeriodoFuturo`, `mesAnterior`, `mesSiguiente`, `esMesActual` — they
serve web's month/year picker and prev/next header, both explicitly out of scope (binding decision
4). Same total/never-throw discipline as the existing `formatearPeriodoLabel`: an unparseable
`periodo` comes back verbatim.

`ahora: Date` stays an injected argument (never `new Date()` inside) so specs pin "today" without
mocking the global.

### 1.4 `src/domain/resumen-view-model.ts` (MODIFIED)

**(a) `ItemLeyenda`** — the 3-kind discriminated union, ported verbatim from web (`'gasto'` ·
`'sinCategoria'` · `'ingreso'`). The union is the load-bearing part: the wireframe pins genuinely
different row shapes (`name · % · amount` vs `name · N tx · amount` vs `name · amount`), and
optional fields on a single kind would make illegal rows representable.

**(b) `leyendaPrincipal` / `leyendaComplemento`** — ported verbatim:

- `leyendaPrincipal`: the 4-item ring filtered to `BUCKETS_5030` membership. **No renormalization**
  — the three spend rows show the *diluted* ring percentages, so the legend and the wedges always
  read the same number (US-047 WG5-03/WG5-13). Filtering is safe here because these values only get
  printed; they never drive angle math (that is why filtering the *pie* would be a bug —
  `calcularAngulos` force-closes the last wedge at 360° and would silently absorb the missing share).
- `leyendaComplemento`: always `[ingreso(+), sinCategoria(−, cantidadLabel)]`, in that order,
  regardless of spending. A true `cantidadSinCategoria: 0` renders a real `'0 tx'` row — never an
  omission (WG5-05).
- `totalPorBucket` join and `montoSeguro`/`bucketConMayorTotal` discipline come along unchanged,
  minus `bucketPorDefecto` (web-only: it seeds a transactions panel mobile does not have — yagni).

**(c) `aResumenAnualViewModel(dto: ResumenAnualDto)` (NEW, this file — the proposal's
"view-model extension")**

```ts
export interface MesAnualViewModel {
  readonly periodo: string;            // '2026-07'
  readonly etiqueta: string;           // 'JUL'
  readonly nombreAccesible: string;    // 'julio 2026'
  readonly tieneDatos: boolean;        // !sinIngreso
  readonly tajadas: readonly TajadaGasto[];
}
export interface ResumenAnualViewModel {
  readonly anio: number;
  readonly meses: readonly MesAnualViewModel[];
  readonly sinDatosEnElAnio: boolean;  // every month sinIngreso
}
```

This is a deliberate improvement over web, whose `MesCelda` calls `calcularDistribucionGasto`
inline on every render. Deriving all 12 months **once per fetch** (memoized in the component,
§1.7) is what makes the 12-mini grid cheap to re-render on every month tap, and it keeps the
component free of money math.

**(d) Removals** — `periodoLabel` and `targets` leave `ResumenViewModel`. See §1.8.

### 1.5 `src/api/client.ts` (MODIFIED)

```ts
export async function fetchResumenAnual(anio?: number): Promise<ApiResult<ResumenAnualDto>>
```

Structurally a byte-for-byte mirror of `fetchResumen`: `API_BASE_URL` guard → `network`;
`construirHeadersSesion()`; `401 → unauthorized`; other non-2xx → `http`; bad JSON or failed shape
guard → `parse`; never throws. No TanStack Query, no new HTTP abstraction — the platform-agnostic
*runtime* client stays registered debt with an explicit trigger (ADR-012); inventing it here would
be speculative.

Mobile keeps its own 4-tag `ApiError` union — web's richer `invalid`/`server` tags with messages are
**not** ported. The backend's 400 on `/anual` is an invalid `anio`, and mobile never sends a
user-typed year (it is derived from a `YYYY-MM` the backend itself emitted), so a 400 is a genuine
"should not happen" that belongs in the generic `http` bucket. Adding a fifth tag would add a
branch no test can reach honestly.

**Money guards at the boundary (D-14).** `esResumenMesDto` gains a money-format check on
`totalIngreso` and every `bucket.total`, via `esMontoStringValido`; `esResumenAnualDto` reuses
`esResumenMesDto` over `meses` (DRY). Reason: `formatearMontoConSigno` — new in the legend —
**throws** on a malformed amount, and there is no ErrorBoundary in this app, so a malformed 2xx body
would crash the render instead of landing in the already-handled `parse` state. This is the same
two-layer defence web ships (boundary guard + `montoSeguro`).

### 1.6 `src/domain/pie-geometry.ts` (MODIFIED) and the donut

Port web's trailing-optional `rInterior` parameter to `arcoPath` (annular wedge; inverted inner
sweep; two-subpath full-360° branch so a 100% bucket still renders a ring; `rInterior` clamped to
`[0, r)` — degrade, never throw). `rInterior === 0` returns the exact same string as today, so the
existing `pie-geometry.spec.ts` cases stay green unedited.

`radioEtiqueta` is **not** ported: mobile's ring is label-less (D-07), so nothing needs a mid-band
radius.

### 1.7 Components

| component | change | contract |
|---|---|---|
| `DistribucionPie.tsx` | rewritten | 4-wedge **donut** (`RATIO_INTERIOR = 0.58`, the same visual constant web uses), white 2px wedge separator (WCAG 1.4.11), muted placeholder ring when `tajadas` is empty. **Removed:** the IDEAL inset, `slicesIdeales`, the `targets` prop, `centroidLabel`, and the on-wedge `%` labels. Keeps `accessibilityLabel="Distribución del gasto"` (Maestro anchor, `.maestro/a11y-labels.yaml:46`) |
| `LeyendaGasto.tsx` | rewritten | props `{ principales, complemento }: ReadonlyArray<ItemLeyenda>`; a vertical 5-row list, every row an **inert `View`** (binding decision 2: non-navigable, no chevrons). Dispatch by `item.kind`, never by a boolean flag. The `SinCategoria` row is `accessible` with an explicit `accessibilityLabel` that expands `'3 tx'` → `'3 transacciones sin categorizar'` (web's exact string, produced by web's exact `.replace(/\s*tx$/, …)`); the other rows rely on their visible text |
| `SemaforoTag.tsx` | NEW | static tinted pill: face + `Semáforo: {label}`. **No `Pressable`, no chevron, no navigation** (binding decision 1). `estadoGlobal` passes through verbatim from the backend — never recomputed (ADR-024). ADR-018: the state is carried by the visible Spanish word, never by colour alone |
| `semaforo-estilos.ts` (`src/theme/`) | NEW | the `estado → {label, cara, icon, bg}` table extracted out of `SemaforoBadge`, so the tag and any future indicator read one table. Mirrors web's own US-047 D-06 extraction (`lib/semaforo-estilos.ts`). Unknown/`null` estado → `SIN_DATOS`, never coerced into a known colour |
| `SemaforoBadge.tsx` + spec | **DELETED** | its only production consumer is `ResumenScreen` (ripgrep-verified, §4), which now renders `SemaforoTag`. The `testID="semaforo-global"` wrapper survives on the tag — the Maestro anchor is preserved |
| `ResumenAnual.tsx` | NEW | self-contained section: owns `useEffect`/`useState` around `fetchResumenAnual()` — called with **no argument**, so the request never carries `?anio` (MOB-10; the backend resolves the current year) — and its own Loading / Error+retry / Empty / data states. The `anio` prop threaded from `app/index.tsx` is used **only** for the heading label `Año {anio}`, never for the fetch. Renders `MesCelda` ×12 in a `flex-row flex-wrap` 4×3 grid. `useMemo(() => aResumenAnualViewModel(dto), [dto])` |
| `MesCelda` (inside `ResumenAnual.tsx`) | NEW | `React.memo`'d `Pressable`; `accessibilityRole="button"`, `accessibilityLabel={'Ver ' + nombreAccesible}` (web parity), `accessibilityState={{ selected, disabled: !tieneDatos }}`, `disabled={!tieneDatos}`. Selected → 2px ring + bold label (shape + weight, not colour alone). Min height 76 → tap target ≥44×44 (WCAG 2.5.8) |
| `MiniDistribucionPie.tsx` | NEW | port of web's: fixed `size = 44`, label-less, ≤4 `<Path>`, muted placeholder circle when `tajadas` is empty. Carries **no** accessibility props — the parent `Pressable` is `accessible`, which collapses the subtree into a single AT node |
| `states/Loading.tsx` | MODIFIED | gains an optional `mensaje` prop, default `'Cargando resumen…'` (existing spec stays green). `ResumenAnual` passes `'Cargando resumen anual…'` (web's exact copy) |
| `states/Error.tsx`, `states/Empty.tsx` | unchanged (component code) | reused as-is; their `flex-1 items-center justify-center` centering now depends on the shell `ScrollView` carrying `contentContainerStyle={{ flexGrow: 1 }}` (§0) — no RNTL test can measure this layout, verified manually on-device (Maestro/EAS build, ADR-022) |
| `Header.tsx`, `IngresoCard.tsx` | unchanged | reused as-is |
| `ResumenScreen.tsx` | rewritten (name kept) | re-scoped from "the whole screen" to "the month block": `IngresoCard` + the chart card. The `ScrollView` and `Header` move up into the shell (§1.9). Name kept deliberately: three docstrings, one Maestro comment and the integration spec reference it, and renaming buys nothing the docstring cannot say. **Removed:** the `Ver detalles ›` `Pressable` (binding decision 4 — no destination exists) |

**Accepted tradeoff — `LeyendaGasto` row-level AT reading (judgment-day, scoped out of US-050):** only the
`sinCategoria` row sets `accessible` on its wrapper (per the transform's own assignment above), so it
collapses into one screen-reader stop. The `gasto`/`ingreso` rows do **not** — a screen reader steps
through each row's name, `%`, and amount as separate stops (≈10 stops for the 3 spend rows) instead of
one announcement per row. This is a deliberate scope cut, not an oversight: grouping every row would
require touching each row's accessibility props beyond what MOB-08 asked for. Candidate follow-up US if
row-level grouping (one announcement per row, matching the `sinCategoria` row's pattern) is wanted.


**Annual grid performance (proposal risk #2).** Four cheap, non-speculative measures, in order of
effect: (1) all BigInt ring math for the 12 months runs once per fetch in the memoized view-model,
never on selection; (2) `MesCelda` is `React.memo`'d and its props are primitives plus a
referentially stable per-month object and a `useCallback`'d `onSelectPeriodo`, so a tap re-renders
exactly two cells; (3) minis are fixed-size and label-less — no `<SvgText>` nodes, which are the
expensive ones on Android — for ≤48 `<Path>` nodes total; (4) plain `View` rows, **not** a
`FlatList` (12 always-visible items; virtualization here is complexity without measurement). Real
device measurement stays on the EAS internal build (ADR-022), as the proposal states.

### 1.8 Removals and the code they strand

| removed | why | what `tsc` forces |
|---|---|---|
| IDEAL 50/30/20 inset | Closed Question 2 | `DistribucionPie`'s `targets` prop and `slicesIdeales` go; `ResumenViewModel.targets` becomes unreferenced and is deleted; `resumen-view-model.spec.ts`'s "propaga los targets" case is deleted |
| `Ver detalles ›` | Closed Question 4 | `ResumenScreen.spec.tsx`'s "exposes the 'Ver detalles' affordance" case is deleted (that spec file is rewritten wholesale for the 5-row legend anyway) |
| `SemaforoBadge` | superseded by `SemaforoTag` | `SemaforoBadge.spec.tsx` is deleted; its state-table assertions are re-expressed against `semaforo-estilos.ts` + `SemaforoTag.spec.tsx`, so no coverage is lost |
| `ResumenViewModel.periodoLabel` | the header moved to the shell, which labels `periodoVista` (§1.9) | `resumen-view-model.spec.ts`'s "deriva periodoLabel" case moves to the shell/`periodo-label` level; `formatearPeriodoLabel` itself stays and gains a call site in `app/index.tsx` |
| `BUCKETS_GASTO` | replaced by the 5030/ANILLO split | every stale call site fails to compile — the point |

No test is deleted whose *behaviour* still exists; each deletion above removes a case whose subject
was removed by a binding product decision.

**Scope note:** the `targets` literals still present in `resumen-view-model.spec.ts` /
`client.spec.ts` DTO fixtures belong to the WIRE `ResumenMesDto.targets` field (the
HTTP contract), which is out of this change's scope — only the view-model's own
`targets` field was removed above. Deferred, not a miss.

### 1.9 `app/index.tsx` — state and composition

```ts
const [periodo, setPeriodo] = useState<string | undefined>(undefined); // undefined = mes en curso
const [estado, setEstado]   = useState<Estado>({ fase: 'loading' });   // unchanged shape

const cargar = useCallback(async () => { … await fetchResumen(periodo) … }, [periodo]);
useEffect(() => { void cargar(); }, [cargar]);            // re-runs on month change
useEffect(() => registrarRecargaResumen(cargar), [cargar]); // unchanged

const periodoVista = periodo ?? periodoActualUTC(new Date());
const anio         = anioDePeriodo(periodoVista, new Date().getUTCFullYear());
```

- `undefined` means "let the backend resolve the current month" — the request simply omits
  `?periodo` (existing `fetchResumen` behaviour). Selection resets on app restart (binding decision
  4: no persistence).
- `periodoVista` is the single source for the header label, the grid's selected-cell marker and
  `anio`. It is a *presentation* derivation (which month am I looking at), not money math — web
  derives "today" the same way, in UTC, never local time.
- Tapping a cell calls `setPeriodo(p)`; the effect re-fires, the SLOT shows `Loading` while the grid
  stays on screen. That is the whole interaction — no navigation, no deep link, no persistence.
- `anio` never changes today (all 12 selectable cells belong to the current year — binding decision
  4), so the annual fetch runs exactly once per mount. `anioDePeriodo` is used anyway, for web
  parity and so a future year navigation is a prop change, not a rewrite.
- The shell `ScrollView` sets `contentContainerStyle={{ flexGrow: 1 }}` (see §0) — required for
  `Loading`/`ErrorState`/`Empty`'s `flex-1` centering to hold now that the SLOT is nested one level
  deeper than it was pre-US-050.

### 1.10 `src/api/resumen-refresh.ts` (MODIFIED)

The pub/sub is a **single listener slot** whose docstring says "this app has exactly one screen that
ever needs to be notified". US-050 breaks that premise: `ResumenAnual` is a second subscriber, and
without it, US-033's post-upload refresh updates the chart while the grid keeps showing the just-fed
month as an empty, non-tappable cell — a visible contradiction on one screen.

Promote the slot to a `Set<() => void>`; `registrarRecargaResumen` returns an unregister that
deletes only its own callback. This *preserves* review fix #2's guarantee (a stale cleanup can no
longer clobber a newer registration) structurally instead of by identity check. Caller-visible API
is unchanged, so `app/index.tsx`, `app/subir.tsx` and the existing specs are untouched.

---

## 2. Decisions (ADR-style)

| id | decision | rationale | rejected alternative |
|----|----------|-----------|----------------------|
| D-01 | No new layer, no state library, no new dependency — the change lands entirely inside the existing `app` / `components` / `domain` / `api` / `theme` split | The proposal's success criteria include "no new dependency added to `apps/mobile`"; `useState`+`useEffect` already serve two fetches on this app | TanStack Query on mobile (ADR-012's runtime client is registered debt with a trigger; this US is not it) |
| D-02 | `fetchResumenAnual` mirrors `fetchResumen` structurally: same `ApiResult`/`ApiError` tags, same `construirHeadersSesion`, never throws | Two near-identical 30-line fetchers are simpler than the generic client that would unify them; that generic client is ADR-012's registered debt, not this US's job | A shared `fetchJson<T>(url, guard)` helper — a 3-strikes abstraction attempted at strike 2, and it would have to swallow each endpoint's status semantics |
| D-03 | Mobile keeps its 4-tag `ApiError`; the `/anual` 400 collapses into `http` | Mobile never sends a user-authored `anio`; a fifth tag would create a branch no honest test can reach | Porting web's `invalid`/`server` tags with messages (a wider union for one unreachable case) |
| D-04 | The annual section owns its own fetch and its own Loading/Error/Empty states | Mirrors web's self-contained `ResumenAnual` (and `BucketDetailList`); an annual failure must never blank the main chart, and vice-versa | Lifting the annual fetch into `app/index.tsx` (one failure surface for two independent reads) |
| D-05 | `app/index.tsx` becomes a **shell** (ScrollView + Header + SLOT + `ResumenAnual`); only the SLOT switches on the month state | The mechanical generalization of Closed Question 1. Special-casing `sinIngreso` alone would leave `loading`/`error` full-screen, so a failed tap-to-switch would strand the user on a screen with no month navigation — precisely what CQ1 forbids, one state over | Special-casing only `sinIngreso` (two composition modes in one switch); putting `ResumenAnual` inside `ResumenScreen` (it would vanish exactly when the user most needs to move months) |
| D-06 | The state switch stays in `app/index.tsx`; `ResumenScreen` keeps its name and is re-scoped to the month block | Proposal §Approach mandates the switch's location; the rename would touch three docstrings, a Maestro comment and the integration spec for zero behaviour | Moving the switch into a `DashboardShell` component; renaming `ResumenScreen` → `ResumenMes` |
| D-07 | The main ring is **label-less**; percentages live only in the legend | With a 0.58 hole the 240px ring leaves a ~50px band; the 4th wedge is routinely thin, and web needed a bespoke `PIE_LABEL_FILL` because white fails contrast on every pastel. Dropping the labels removes an existing white-on-`#E7E1BF` contrast debt instead of porting machinery to manage it, and deletes the need for `radioEtiqueta` | Porting web's `PIE_LABEL_FILL` + `radioEtiqueta` + `centroidLabel` (more code, cramped band, a contrast analysis mobile can simply not need) |
| D-08 | Port `calcularDistribucionGasto` **without** web's trailing `bucketsIncluidos` param | On mobile every call site wants all 4 ring members; the legend filters for display only. A parameter with exactly one possible value is a flag that is never toggled | Signature-identical port "for parity" — parity is enforced by D-09, which is stronger and cheaper |
| D-09 | Ring parity is pinned by a **duplicated fixture table + a byte-equality guard**, not by hoping two copies stay in sync | The proposal's #1 risk. Each workspace runs *its own* implementation against a *bit-identical* case table; if either implementation drifts, that workspace's spec goes red, and if either table is edited unilaterally, the equality guard goes red. This is the only mechanism available given ADR-008 (no `packages/shared`, deliberate) | "Port verbatim and mirror the tests" by hand (what the proposal literally says — it decays the first time either side is edited); extracting a shared package (contradicts ADR-008) |
| D-10 | `SinCategoria` slice colour = `#8A8F9C`, added to `COLORS` as a named `sinCategoria` token | Same *semantics* as web's choice (a neutral grey — uncategorized is not over-budget, so it must not borrow an accent) expressed in **mobile's own** palette: web's `lib/bucket-colors.ts` explicitly instructs "do NOT port this migration to `apps/mobile`". `#8A8F9C` is the neutral this palette already uses for "sin datos"; ≈3.2:1 against the white wedge separator, comfortably above the pale-yellow slice's own already-shipped ratio | Porting web's `#AEB4C4` (imports the Serene Finance palette mobile deliberately does not use); inventing a second near-identical grey (two greys, one meaning); the `#CCCCCC` unstyled fallback (reads as a bug) |
| D-11 | `theme/colors.ts` gains the token; `tailwind.config.js` is **not** touched | The mirror exists only for `className` usage; slice/dot colours are applied as inline `style` from `COLOR_BUCKET`, so no Tailwind class is needed. Adding an unused entry to a hand-synced mirror is pure drift surface | Mirroring the token "for consistency" |
| D-12 | `SemaforoTag` is a static `View`; the `estado → estilo` table is extracted to `theme/semaforo-estilos.ts` | Binding decision 1 (not tappable, no chevron). Extracting instead of copying prevents two Spanish words for the same state on the same screen — the exact failure web's US-047 D-06 extraction prevented | A second local table inside `SemaforoTag`; keeping `SemaforoBadge` and adding the tag beside it (two indicators, one state) |
| D-13 | `resumen-refresh` becomes a `Set` of listeners; `ResumenAnual` registers its own reload | US-050 introduces the second subscriber the module's docstring said would never exist. Without it, US-033's upload leaves the new grid stale against the chart it sits under — a visible contradiction, not a hypothetical | Leaving it as registered debt (ships a known-wrong screen); threading a `recargaToken` prop from the route (re-couples the section the D-04 split just made self-contained) |
| D-14 | Money-format validation moves to the **fetch boundary** for `/api/resumen` and `/api/resumen/anual` | `formatearMontoConSigno` (new, in the legend) throws on a malformed amount and there is no ErrorBoundary in this app; a malformed 2xx body must become the already-handled `parse` state, not a render crash. Two-layer defence, exactly as web ships it | Wrapping the formatter in try/catch at each call site; relying on `montoSeguro` alone (it guards the ratio, not the label) |
| D-15 | The 12-month grid is a plain `flex-row flex-wrap` 4×3 of `React.memo`'d `Pressable`s, fed by a per-fetch memoized view-model | Cheapest thing that answers the perf risk with real leverage (no BigInt math on tap, two cells re-render per tap) | `FlatList` virtualization for 12 always-visible cells (complexity with no measurement behind it) |
| D-16 | Months without data are `disabled` `Pressable`s carrying `accessibilityState={{ disabled: true }}`, not omitted and not inert `View`s | The cell must still announce "this month exists and is unavailable"; omitting it would break the 4×3 calendar reading, and a bare `View` says nothing to AT | Rendering nothing; rendering an enabled cell that no-ops on tap (an affordance that lies) |
| D-17 | Selected state is announced via `accessibilityState={{ selected: true }}` and shown as a 2px ring + bold label | ADR-018: state is never colour-only; ring (shape) + weight (typography) + the AT state are three independent channels | A tinted background as the sole marker |
| D-18 | Tapping an annual cell re-fetches `GET /api/resumen` for that `periodo` instead of reusing the already-fetched `meses[i]: ResumenMesDto` from the annual payload | Freshness after cartola uploads (US-033) — the annual payload can go stale the moment a new cartola lands, and deriving the chart from two alternative sources (the annual payload vs. its own fetch) would fork the SLOT into two states with a cache-coherence problem instead of one simple state machine. Accepted cost: an extra round-trip and a brief loading flash on every tap | Reusing `meses[i]` from the annual payload directly (avoids the round-trip, but risks showing stale data and forks the SLOT's single source of truth into two) |

### D-05 in detail — reconciling §Approach with Closed Question 1

`proposal.md` §Approach says "The chart card and the new `ResumenAnual` section are siblings inside
the existing `ScrollView`", where "the existing `ScrollView`" is `ResumenScreen`'s — i.e. inside the
**data** branch. Closed Question 1 (decided later, at the proposal gate, and marked binding) says
`Empty` replaces *only* the chart card while the annual section still renders. Both cannot hold: a
`ScrollView` owned by the data branch does not exist during `Empty`.

Reconciliation of record: the **sibling relationship §Approach describes is preserved exactly**; the
`ScrollView` that hosts it simply moves one level up, into the route. Nothing else about §Approach
changes. The generalization to `loading`/`error` is not scope creep but the removal of a
special case: CQ1's own stated reason ("on mobile the annual grid is the only month navigation, so
blanking it would strand the user") applies verbatim the moment a tap-to-switch request is in
flight or fails.

### D-09 in detail — the ring-parity fixture

```
apps/mobile/src/domain/__fixtures__/distribucion-anillo.fixture.ts   ← PARIDAD: apps/web/src/domain/__fixtures__/distribucion-anillo.fixture.ts
apps/web/src/domain/__fixtures__/distribucion-anillo.fixture.ts      ← PARIDAD: apps/mobile/…
```

Both files are byte-identical and export one array of named cases:

```ts
export const CASOS_PARIDAD_ANILLO = [
  { nombre: 'dilución 4 items',        buckets: [...], esperado: [['Necesidades',25],['Deseos',15],['Ahorro',10],['SinCategoria',50]] },
  { nombre: 'mockup 77/12/11 con SinCategoria = 0', … },
  { nombre: 'cuatro unos → 25/25/25/25 (suman 100)', … },
  { nombre: 'sin gasto → []', … },
  { nombre: 'total malformado degrada a 0, no lanza', … },
  { nombre: 'bucket en 0 mezclado no produce NaN', … },
  { nombre: 'BigInt-safe sobre 2^53', … },
] as const;
```

Each workspace's spec runs `it.each(CASOS_PARIDAD_ANILLO)` against **its own**
`calcularDistribucionGasto`. One extra test in `apps/mobile` reads both files with
`fs.readFileSync` (paths resolved from `__dirname`) and asserts byte equality — it lives in mobile
because mobile is the copy that historically drifted. Only default-path (4-item) cases go in the
table, which is why D-08's signature divergence costs nothing.

Honest limit, stated up front: the guard pins the *case table*, not the implementations. Identical
table + both suites green means identical observable behaviour **on those cases**. That is the
strongest guarantee available without violating ADR-008, and it converts a silent drift into a red
build.

---

## 3. Test ledger (TDD — tests first, per suite)

Runner: `pnpm --filter @moneydiary/mobile test` (jest-expo + RNTL, ADR-017). Maestro stays manual,
out of CI.

**Domain — 46 cases**

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `domain/formatear-monto.spec.ts` | MOD | **+9** | `esMontoStringValido`: `'100'` ok, `''`/`'abc'`/`'12.5'`/`'+100'`/`' 100'`/`'0x10'` rejected (6); `formatearMontoConSigno('1000','+')` → `'+$1.000'` (1); `('400000','-')` → `'-$400.000'` (1); magnitude `0` carries **no** sign prefix (1). The 7 existing cases stay green **unedited** (the stricter guard is a superset) |
| `domain/distribucion-gasto.spec.ts` | MOD | **~10** | `it.each(CASOS_PARIDAD_ANILLO)` (7); `BUCKETS_ANILLO` ends in `SinCategoria` and `BUCKETS_5030` excludes it (1); the four ring percentages always sum to 100 with a nonzero `SinCategoria` (1); byte-equality of the two fixture files (1). The pre-US-050 "excluye SinCategoria" case is **inverted**, not deleted — that inversion is the semantic core of the change |
| `domain/periodo-anual.spec.ts` | NEW | **11** | `mesAbreviado` for month 1/7/12 (3); unparseable → verbatim (1); `mesCompletoLabel('2026-07')` → `'julio 2026'` (1); unparseable → verbatim (1); `anioDePeriodo` (1) + fallback (1); `periodoActualUTC` with an injected `Date` (1); **UTC, not local**: a `Date` whose local month differs from its UTC month resolves by UTC (1); month is zero-padded (1) |
| `domain/pie-geometry.spec.ts` | MOD | **+4** | `rInterior = 0` returns the byte-identical legacy string for a normal wedge and for the 360° branch — the regression contract (2); `rInterior > 0` emits an annular wedge (outer arc, inward line, reversed inner arc) (1); `rInterior >= r` degrades to the filled wedge instead of throwing (1) |
| `domain/resumen-view-model.spec.ts` | MOD | **~12** | `leyendaPrincipal` is exactly 3 `kind:'gasto'` items in canonical order (1); its percentages equal the **diluted** ring values, not renormalized ones (1); `leyendaComplemento` is always `[ingreso, sinCategoria]` in that order (1); `cantidadSinCategoria: 0` yields a real `'0 tx'` row (1); ingreso amount is `+`-prefixed, spend/sinCategoria `-`-prefixed (1); `leyendaPrincipal` empties when there is no spending while `leyendaComplemento` stays (1); `estadoGlobal` passes verbatim (1); `aResumenAnualViewModel`: 12 months, labels `ENE…DIC` (1); `tieneDatos === !sinIngreso` (1); tajadas per month use the 4-item ring (1); `sinDatosEnElAnio` true only when all 12 are `sinIngreso` (1); a month with no spend yields `tajadas: []` (1). **Deleted:** "propaga los targets", "deriva periodoLabel" (§1.8) |

**API — 15 cases**

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `api/client.spec.ts` | MOD | **+13** | `fetchResumenAnual`: URL is `{base}/api/resumen/anual` with no query when `anio` is omitted (1); `?anio=2026` when given (1); sends `x-api-key` and `Authorization` when a token is stored (1); 200 ok (1); 401 → `unauthorized` (1); 500 → `http` (1); 400 → `http` (D-03) (1); fetch rejection → `network` (1); missing base URL → `network`, **no fetch performed** (1); non-JSON → `parse` (1); wrong shape → `parse` (1). Money guard (D-14): a `bucket.total` of `'12.5'` → `parse` on `/api/resumen` (1) and inside `meses[3]` on `/anual` (1) |
| `api/resumen-refresh.spec.ts` | MOD | **+2** | two registered listeners both fire on `solicitarRecargaResumen()` (1); unregistering one leaves the other subscribed (1). Existing cases stay green |

**Components / route — 51 cases**

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `components/LeyendaGasto.spec.tsx` | NEW | **8** | renders exactly 5 rows (1); labels are `Necesidades / Gustos / Ahorro / Ingresos / Sin categoría` — never the raw `Deseos`/`SinCategoria` (1); spend rows show the ring `%` (1); the sinCategoria row shows `N tx` and **no** `%` (1); amounts carry `+`/`−` per kind (1); **no row is a button** — zero `role="button"`, zero chevrons (binding decision 2) (1); the sinCategoria row's accessible name spells out "transacciones sin categorizar" (1); `cantidadLabel: '0 tx'` still renders a row (1) |
| `components/DistribucionPie.spec.tsx` | NEW | **5** | 4 wedge paths for a 4-item ring (1); placeholder ring when `tajadas` is empty (1); **no** IDEAL inset and no `targets` prop in the public type (1); no on-wedge `%` text nodes (D-07) (1); keeps `accessibilityLabel="Distribución del gasto"` (1) |
| `components/SemaforoTag.spec.tsx` | NEW | **5** | verde/amarillo/rojo render the Spanish word as visible text (3 → 1 parametrized); `null` → `Sin datos`, never coerced into a colour (1); an unknown wire value → `Sin datos` (1); it is **not** a button and has no press handler (1); the state word is real text, not only a colour (ADR-018) (1) |
| `components/MiniDistribucionPie.spec.tsx` | NEW | **3** | ≤4 paths for a 4-item ring (1); placeholder circle when empty (1); renders no text/label nodes (1) |
| `components/ResumenAnual.spec.tsx` | NEW | **14** | loading → `'Cargando resumen anual…'` (1); error → retry affordance, and retry re-fetches (2); all-12-`sinIngreso` → `'Todavía no hay datos este año'`, no grid (1); heading `Año 2026` (1); renders 12 cells (1); each cell exposes `accessibilityLabel="Ver julio 2026"` (1); a month with data is pressable and calls `onSelectPeriodo` with its `YYYY-MM` (1); a month without data is `disabled` and pressing it does **not** call `onSelectPeriodo` (1); the disabled cell carries `accessibilityState.disabled` (1); the selected cell carries `accessibilityState.selected` and no other cell does (1); an annual failure does not affect what the parent renders (1); registers with `resumen-refresh` and reloads when `solicitarRecargaResumen()` fires (D-13) (1); calls `fetchResumenAnual` with **no arguments** (MOB-10 — the `anio` prop only labels the heading) (1) |
| `components/ResumenScreen.spec.tsx` | REWRITTEN | **7** | the `Distribución del gasto` heading anchor survives (1); it is an accessible `header` (1); `$1.000.000` income (1); the 5 legend labels are present (1); `testID="semaforo-global"` is present and is **not** a button (1); no `Ver detalles ›` anywhere (1); no `IDEAL` anywhere (1). **Deleted:** the "Ver detalles" case; the period-label case (moved to the route) |
| `components/SemaforoBadge.spec.tsx` | DELETED | −5 | its state-table coverage is re-expressed in `SemaforoTag.spec.tsx` + `semaforo-estilos.spec.ts` |
| `theme/semaforo-estilos.spec.ts` | NEW | **3** | the three known estados resolve to distinct labels (1); `null` → `SIN_DATOS` (1); an unknown string → `SIN_DATOS`, never a known colour (1) |
| `app/index.spec.tsx` | MOD | **+5** | the annual section renders **alongside** `Empty` when `sinIngreso` (CQ1) (1); it also renders alongside `loading` and `error` (D-05) (1); tapping a month re-fetches `/api/resumen` **with that periodo** (1); the header label follows the selected month (1); the default mount fetches with `periodo === undefined` (1). The 12 existing cases stay green (the `'Distribución del gasto'` anchor is unchanged) |
| `test/auth-navigation.integration.spec.tsx` | untouched | 0 | its three `'Distribución del gasto'` assertions still hold — verified anchor preservation |
| `.maestro/resumen-semaforo.yaml` | OPTIONAL | 0 | may gain `assertVisible: "Sin categoría"` and `"Año 2026"`. Device-gated, manual, never CI — not a gate for this US |

**Total: 112 new/changed cases** (46 domain + 15 api + 51 component/route), plus 5 deleted with
their subject and ~25 existing cases that must keep passing unedited.

---

## 4. Impact sweep (ripgrep-verified, not assumed)

| symbol / file | call sites found | impact |
|---|---|---|
| `SemaforoBadge` | `ResumenScreen.tsx:6,41` + its own spec. **Zero** other imports | Safe to delete once `SemaforoTag` lands |
| `calcularDistribucionGasto` | `resumen-view-model.ts:73` (1 production call) + its own spec | Signature unchanged (`buckets` only) → blast radius is the returned array's length, which only `LeyendaGasto`/`DistribucionPie` read |
| `formatearMontoCLP` | `resumen-view-model.ts:53,70`, `preview-cartola.ts:48,49` + spec | The stricter guard changes behaviour **only** for strings that were never valid money (hex/octal/binary/`+`/whitespace). Every well-formed decimal string formats byte-identically → `preview-cartola` untouched |
| `formatearPeriodoLabel` | `resumen-view-model.ts:2,69` only | Moves to `app/index.tsx`; the function itself survives with the same contract |
| `pie-geometry` (`calcularAngulos`/`arcoPath`) | `DistribucionPie.tsx:5` + spec | `rInterior` is trailing-optional and defaults to the legacy string → existing callers and cases compile and pass unchanged |
| `'Distribución del gasto'` | `.maestro/resumen-semaforo.yaml:20`, `.maestro/a11y-labels.yaml:46`, `app/index.spec.tsx` (×10), `test/auth-navigation.integration.spec.tsx` (×3), `ResumenScreen.tsx:38` | **Anchor preserved verbatim.** Do not "improve" this string |
| `testID="semaforo-global"` | `.maestro/resumen-semaforo.yaml:27`, `ResumenScreen.tsx:40`, 2 specs | Preserved on the `SemaforoTag` wrapper |
| `registrarRecargaResumen` / `solicitarRecargaResumen` | `app/index.tsx:9,59`, `app/subir.tsx`, 2 specs | Caller-facing API unchanged by the `Set` promotion |
| `tailwind.config.js` | mirrors `theme/colors.ts` by hand | **Not touched** (D-11) — slice colours are inline styles |
| `packages/api-client` | already exports `ResumenAnualDto` / `ResumenMesDto` | **Zero** contract work: no OpenAPI regen, no `types.gen.ts` change, no cross-workspace typecheck hazard |
| `apps/api`, `apps/web`, `apps/landing` | untouched, except web's `__fixtures__` file added by D-09 | The fixture file is additive; web's existing `distribucion-gasto.test.ts` keeps its own cases and gains the shared `it.each` |

No backend change, no Prisma/migration, no env var, **no new dependency** (`react-native-svg` is
already a direct dep).

---

## 5. Per-file change ledger and PR slicing

| # | file | change | est. lines | tests |
|---|------|--------|-----------:|-------|
| **PR 1 — Ring + money parity (domain only, no UI)** |||||
| 1.1 | `src/domain/formatear-monto.ts` | MOD — `esMontoStringValido`, `formatearMontoConSigno`, stricter guard | ~45 | — |
| 1.2 | `src/domain/formatear-monto.spec.ts` | MOD | ~55 | +9 |
| 1.3 | `src/domain/distribucion-gasto.ts` | MOD — `BUCKETS_5030`/`BUCKETS_ANILLO`, `montoSeguro` | ~40 | — |
| 1.4 | `src/domain/__fixtures__/distribucion-anillo.fixture.ts` | NEW | **133** (real; ~75 forecast) | — |
| 1.5 | `apps/web/src/domain/__fixtures__/distribucion-anillo.fixture.ts` | NEW (byte-identical twin) | **133** (real; ~75 forecast) | — |
| 1.6 | `src/domain/distribucion-gasto.spec.ts` | MOD — `it.each` + byte-equality guard | ~70 | ~10 |
| 1.7 | `apps/web/src/domain/distribucion-gasto.test.ts` | MOD — adopt the shared `it.each` | ~20 | (re-expressed) |
| 1.8 | `src/theme/colors.ts` | MOD — `sinCategoria` token + `COLOR_BUCKET` entry | **9** (real; ~8 forecast) | — |
| 1.9 | `src/domain/resumen-view-model.spec.ts` | MOD — blast-radius sync: ring consumer re-expressed for the 4-item output (§4 impact sweep) | **+12** | — |
| | | **subtotal** | **~517** (real; ~390 forecast) | **~19** |

> **Honest reconciliation (post-implementation):** the two fixture files came in at 133 lines
> each — ~58 lines over the ~75 forecast per file, ~116 lines combined — because the D-09 case
> table grew from 7 to 8 named cases (the 8th exercises a genuine largest-remainder tie, added
> during judgment-day review; see the fixture's own case comment) plus Prettier's line-wrapping
> of the new case's `nombre` string. `colors.ts` landed 1 line over forecast (9 vs ~8).
> `resumen-view-model.spec.ts` (1.9) was not itemized in the original table at all — PR1's
> ring/bucket change forces a blast-radius re-sync of its existing ring-consumer test (§4), which
> the original per-file table missed. Net: ~390 → ~517 real, a ~127-line overage fully
> attributable to these three causes; of the 517 lines, 266 (the byte-identical fixture twin pair)
> are duplicated data, not net new logic.
| **PR 2 — Period helpers, annual fetch, refresh fan-out** |||||
| 2.1 | `src/domain/periodo-anual.ts` | NEW | ~65 | — |
| 2.2 | `src/domain/periodo-anual.spec.ts` | NEW | ~85 | 11 |
| 2.3 | `src/api/client.ts` | MOD — `fetchResumenAnual`, `esResumenAnualDto`, money guards | ~70 | — |
| 2.4 | `src/api/client.spec.ts` | MOD | ~130 | +13 |
| 2.5 | `src/api/resumen-refresh.ts` | MOD — `Set` of listeners | ~15 | — |
| 2.6 | `src/api/resumen-refresh.spec.ts` | MOD | ~30 | +2 |
| | | **subtotal** | **~395** | **~26** |
| **PR 3 — View model (legend union + annual projection)** |||||
| 3.1 | `src/domain/resumen-view-model.ts` | MOD — `ItemLeyenda`, both legends, `aResumenAnualViewModel`, drop `targets`/`periodoLabel` | ~150 | — |
| 3.2 | `src/domain/resumen-view-model.spec.ts` | MOD | ~180 | ~12 |
| | | **subtotal** | **~330** | **~12** |
| **PR 4 — Chart card (donut, 5-row legend, semáforo tag)** |||||
| 4.1 | `src/domain/pie-geometry.ts` | MOD — `rInterior` port | ~55 | — |
| 4.2 | `src/domain/pie-geometry.spec.ts` | MOD | ~55 | +4 |
| 4.3 | `src/components/DistribucionPie.tsx` | REWRITE — donut, stroke, no inset, no labels | ~90 | — |
| 4.4 | `src/components/DistribucionPie.spec.tsx` | NEW | ~70 | 5 |
| 4.5 | `src/components/LeyendaGasto.tsx` | REWRITE — 5 inert rows by `kind` | ~85 | — |
| 4.6 | `src/components/LeyendaGasto.spec.tsx` | NEW | ~110 | 8 |
| 4.7 | `src/theme/semaforo-estilos.ts` | NEW — extracted table | ~45 | — |
| 4.8 | `src/theme/semaforo-estilos.spec.ts` | NEW | ~35 | 3 |
| 4.9 | `src/components/SemaforoTag.tsx` | NEW | ~35 | — |
| 4.10 | `src/components/SemaforoTag.spec.tsx` | NEW | ~60 | 5 |
| 4.11 | `src/components/SemaforoBadge.tsx` + `.spec.tsx` | DELETE | −103 | −5 |
| 4.12 | `src/components/ResumenScreen.tsx` | REWRITE — month block, no "Ver detalles" | ~55 | — |
| 4.13 | `src/components/ResumenScreen.spec.tsx` | REWRITE | ~90 | 7 |
| | | **subtotal (recomputed)** | **~682** ⚠ (55+55+90+70+85+110+45+35+35+60−103+55+90) | **~33** |
| **PR 5 — Annual grid + route shell** |||||
| 5.1 | `src/components/MiniDistribucionPie.tsx` | NEW | ~45 | — |
| 5.2 | `src/components/MiniDistribucionPie.spec.tsx` | NEW | ~45 | 3 |
| 5.3 | `src/components/ResumenAnual.tsx` | NEW — section + `MesCelda` | ~165 | — |
| 5.4 | `src/components/ResumenAnual.spec.tsx` | NEW | ~200 | 14 |
| 5.5 | `src/components/states/Loading.tsx` | MOD — optional `mensaje` | ~6 | — |
| 5.6 | `app/index.tsx` | MOD — periodo state + shell composition | ~75 | — |
| 5.7 | `app/index.spec.tsx` | MOD | ~110 | +5 |
| 5.8 | `.maestro/resumen-semaforo.yaml` | OPTIONAL | ~4 | — |
| | | **subtotal** | **~650** ⚠ | **~22** |

### Review Workload Forecast

- **Estimated changed lines: ~2 447 across 5 PRs** (PR1 ~390 + PR2 ~395 + PR3 ~330 + PR4 ~682 +
  PR5 ~650; corrected from the original ~2 310 — PR 4's rows were mis-summed as ~545 when they
  actually add to ~785 before the deletion, and the `SemaforoBadge` deletion is −103 lines, not −140, taking the
  corrected PR 4 subtotal to ~682).
- **400-line budget risk: High.** PR 4 (~682) and PR 5 (~650) exceed it; PRs 1–3 sit just under.
  Both overruns are test volume, not production complexity (PR 5's production code is ~290 lines).
- **Chained PRs recommended: Yes.**
- **Recommended chain strategy: `feature-branch-chain`.** PR 1 alone changes the ring to 4 wedges
  while the legend is still the old 3-row component — a coherent but half-redesigned dashboard would
  sit on `main` for the length of the chain. A tracker branch that accumulates and merges once
  avoids shipping that intermediate state, and PRs 3–5 are only meaningful together.
- **Decision needed before apply: Yes** — chain strategy, plus a `size:exception` for PRs 4 and 5 if
  the reviewer prefers not to split them further. If a further split is wanted, the natural cut is
  PR 4 → 4a (`pie-geometry` + `DistribucionPie`) / 4b (legend + semáforo tag + `ResumenScreen`), and
  PR 5 → 5a (`MiniDistribucionPie` + `ResumenAnual`) / 5b (route shell + `Loading`).

---

## 6. Risks carried into implementation

| risk | severity | mitigation in this design | residual |
|------|----------|---------------------------|----------|
| Ring math drifts between the two workspaces | Med | D-09: byte-identical fixture table run by both suites + a byte-equality guard; drift turns a silent divergence into a red build | The guard pins the case table, not the implementations — behaviour outside those 7 cases is unpinned. Stated, accepted |
| 12 SVG minis hurt scroll on low-end Android | Med | D-15: per-fetch memoized math, `React.memo` cells, label-less fixed-size minis, no `<SvgText>` | Not measured on-device yet; the EAS internal build (ADR-022) is where this is confirmed. If it regresses, the next lever is rendering the minis as 4 stacked `View` bars, not virtualization |
| Second network call widens the failure surface | Low | D-04: independent states in both directions; D-05: the shell keeps navigation alive through every month-fetch phase | Two spinners can be on screen at once on a cold start — acceptable, and visually distinct (card vs section) |
| `formatearMontoCLP`'s stricter guard throws somewhere it used to pass | Low | Only ever-invalid money strings are affected; `preview-cartola`'s inputs come from the same backend serializer; D-14 rejects malformed bodies one layer earlier | A malformed amount now surfaces as `parse` instead of a bad number — a better failure, but a *different* one for anyone who relied on the old leniency (nobody does; ripgrep-verified) |
| Maestro/integration anchors broken by the rewrite | Low | §4 pins `'Distribución del gasto'`, `testID="semaforo-global"`, `'Subir cartola'`, `'Cerrar sesión'` as untouchable strings; the integration spec needs no edit | Maestro is device-gated and manual — a break would surface late |
| `SinCategoria` grey diverging from web's grey confuses cross-client reading | Low | D-10: same *semantics* (neutral, non-accent), different hex by explicit instruction in web's own `bucket-colors.ts` | Two clients show two greys for the same bucket. Deliberate; the palettes already diverge by product decision |
| `resumen-refresh` `Set` promotion regresses the CU-10 upload flow | Low | Caller API unchanged; existing specs stay green; +2 fan-out cases | — |
| PR 4/5 review fatigue at ~550–650 lines | Med | §5 offers a pre-cut 4a/4b, 5a/5b split | Requires the delivery decision before apply |
