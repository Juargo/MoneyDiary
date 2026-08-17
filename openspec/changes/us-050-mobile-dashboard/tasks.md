# Tasks: US-050 — Mobile dashboard with parity (5-item chart + annual table)

> Ordered implementation checklist for `design.md` (judgment-approved — decisions
> are NOT reopened here). Strict TDD is active (mobile runner: jest-expo + RNTL,
> ADR-017). Order follows design §0/§5: **domain ring+money → domain
> period/API/refresh → view model → chart card (geometry+pie, then
> legend+tag+screen) → annual grid (minis+section, then route shell) →
> closing.** Design §5 flags PR4 (~682) and PR5 (~650) as over the 400-line
> budget and offers a concrete cut ("PR4 → 4a/4b, PR5 → 5a/5b"); this file
> makes that cut the default plan (Phases 4a/4b, 5a/5b below), with shipping
> the whole PR under `size:exception` kept as the explicit alternative (see
> forecast).
>
> Legend: `[P]` = parallel-safe with sibling `[P]` tasks (disjoint files, no
> shared dependency). Unmarked tasks are sequential. `MOB-xx` = requirement in
> `specs/mobile-resumen-screen/spec.md`. `D-xx` = decision in `design.md` §2.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2 447 across 7 task-level slices (design §5 corrected totals, split at the task boundaries below) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 ~390 → PR2 ~395 → PR3 ~330 → PR4a ~270 → PR4b ~412 → PR5a ~455 → PR5b ~195 |
| Delivery strategy | ask-on-risk (session default) |
| Chain strategy | stacked-to-main (decided; 7 PRs, exceptions: PR4b/PR5a) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (decided at the apply gate — size:exception pre-approved for PR4b/PR5a; mobile ships nothing until the mobile-v* tag, so intermediate main merges stay unreleased)
400-line budget risk: High
```

### Per-slice line/test estimates (design §5, split at the 4a/4b and 5a/5b boundary)

| Slice | Files (design §5 refs) | Est. lines | Tests | Over 400? |
|---|---|---:|---:|---|
| PR1 — Ring + money parity | 1.1–1.8 | ~390 | ~19 | No |
| PR2 — Period helpers + annual fetch + refresh fan-out | 2.1–2.6 | ~395 | ~26 | No |
| PR3 — View model | 3.1–3.2 | ~330 | ~12 | No |
| PR4a — Donut geometry + `DistribucionPie` | 4.1–4.4 | ~270 (55+55+90+70) | 9 (4+5) | No |
| PR4b — Legend + `SemaforoTag` + `ResumenScreen` (+ `SemaforoBadge` deletion) | 4.5–4.13 | ~412 (85+110+45+35+35+60−103+55+90) | 18 (8+3+5−5+7) | **Yes (marginal)** |
| PR5a — `MiniDistribucionPie` + `ResumenAnual` | 5.1–5.4 | ~455 (45+45+165+200) | 17 (3+14) | **Yes** |
| PR5b — Route shell (`app/index.tsx`) | 5.5–5.7 (+5.8 optional) | ~195 (6+75+110+4) | 5 | No |

Splitting PR4/PR5 turns two ~650–680-line slices into a 270/412 pair and a
455/195 pair — closer to budget, but PR4b and PR5a still exceed 400 because
their overrun is test volume (`ResumenAnual.spec.tsx` alone is ~200 lines for
14 cases), not production complexity (design §5's own note: PR5's production
code is ~290 lines total). **Alternative kept explicit, per design §5:** ship
PR4/PR5 whole (not split into a/b) under `size:exception` if the reviewer
prefers fewer, larger review rounds over more, smaller ones — the a/b cut is
this file's default, not the only option.

### Chain Strategy — RESOLVED

Design recommended Option A (`feature-branch-chain`); overridden at the apply
gate with the release-model argument below.

**Decision:** `stacked-to-main` (Option B). Each slice merges to `main`
independently, in order.

**Rationale:** mobile ships to users only via a `mobile-v*` tag (ADR-030,
ADR-022) — there is no continuous-deploy path from `main` for mobile the way
there is for web/API. Intermediate merges to `main` are therefore
merged-but-unreleased: they exist in git history and in dev/EAS-internal
builds, but never reach a production user until a tag is cut.

**Known cost (accepted):** between PR1 and PR3 landing, any dev or
EAS-internal build made from `main` renders the raw 4-item ring through the
still-old 3-row legend/screen — visually, a grey "SinCategoria" wedge with no
matching legend row. This is real but user-invisible in production (no build
is released from that window).

**Mitigation (binding):** no `mobile-v*` tag may be cut until the full PR1–PR5b
chain has merged to `main`. The closing phase (Phase 6) must confirm this
before `sdd-archive`.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Ring + money parity (domain only, incl. D-09 fixture) | PR1 | Base: `main` |
| 2 | Period helpers + annual fetch + refresh fan-out | PR2 | Base: PR1 |
| 3 | View model (legend union + annual projection) | PR3 | Base: PR2 |
| 4a | Donut geometry + `DistribucionPie` | PR4a | Base: PR3; independently reviewable, under budget |
| 4b | Legend + `SemaforoTag` + `ResumenScreen` + `SemaforoBadge` removal | PR4b | Base: PR4a; ~412 lines, marginal `size:exception` candidate |
| 5a | `MiniDistribucionPie` + `ResumenAnual` | PR5a | Base: PR4b; ~455 lines, `size:exception` candidate |
| 5b | Route shell composition (`app/index.tsx`) | PR5b | Base: PR5a; wires everything together, under budget |

---

## Phase 0 — Pre-flight

- [x] **T0.1** Confirm Strict TDD Mode active for this session (test runner:
      `pnpm --filter @moneydiary/mobile test`, jest-expo + RNTL per
      `sdd-init/moneydiary`); every RED task below MUST fail before its
      paired GREEN task.
- [x] **T0.2** Baseline gate before any edit: `pnpm --filter @moneydiary/mobile test`
      and `pnpm --filter @moneydiary/mobile exec tsc --noEmit` both green —
      establishes the pre-change baseline so later diffs are attributable.

---

## Phase 1 — Domain: ring + money parity (`formatear-monto.ts`, `distribucion-gasto.ts`) [PR 1]

Requirements: MOB-05, MOB-08. Depends on nothing.

- [x] **T1.1 (RED)** In `apps/mobile/src/domain/formatear-monto.spec.ts`, add
      +9 cases: `esMontoStringValido` — `'100'` ok, `''`/`'abc'`/`'12.5'`/
      `'+100'`/`' 100'`/`'0x10'` rejected (6); `formatearMontoConSigno
      ('1000','+')` → `'+$1.000'` (1); `('400000','-')` → `'-$400.000'` (1);
      magnitude `0` carries no sign prefix (1). Leave the 7 existing cases
      untouched.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test formatear-monto.spec.ts`
- [x] **T1.2 (GREEN)** In `apps/mobile/src/domain/formatear-monto.ts`, add
      `esMontoStringValido`, `formatearMontoConSigno`, and tighten
      `formatearMontoCLP` with the `FORMATO_DECIMAL_VALIDO` regex (design
      §1.1) — a superset of the current behavior for well-formed strings.
      - Verify: `pnpm --filter @moneydiary/mobile test formatear-monto.spec.ts` — 7 existing + 9 new green.
- [x] **T1.3 (D-09 fixture, data only)** Create
      `apps/mobile/src/domain/__fixtures__/distribucion-anillo.fixture.ts`
      and its byte-identical twin
      `apps/web/src/domain/__fixtures__/distribucion-anillo.fixture.ts`,
      exporting `CASOS_PARIDAD_ANILLO` (7 named cases per design §2's "D-09
      in detail"). No test yet — this is the shared data both suites below
      run against.
- [x] **T1.4 (RED)** In `apps/mobile/src/domain/distribucion-gasto.spec.ts`:
      add `BUCKETS_ANILLO` ends in `SinCategoria` / `BUCKETS_5030` excludes
      it (1); four ring percentages always sum to 100 with a nonzero
      `SinCategoria` (1); `it.each(CASOS_PARIDAD_ANILLO)` against mobile's
      own `calcularDistribucionGasto` (7); a byte-equality guard reading
      both fixture files via `fs.readFileSync` (paths from `__dirname`) (1).
      **Invert** (do not delete) the pre-existing "excluye SinCategoria"
      case — the inversion is the semantic core of this change (US-047
      WG5-13 dilution).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test distribucion-gasto.spec.ts`
- [x] **T1.5 (GREEN)** In `apps/mobile/src/domain/distribucion-gasto.ts`:
      export `BUCKETS_5030` and `BUCKETS_ANILLO` (4 items, `SinCategoria`
      last); `montoSeguro(...)` degrades malformed totals to `0n` instead of
      throwing; apportion over `BUCKETS_ANILLO` so `SinCategoria` dilutes the
      other three (design §1.2). **Delete** `BUCKETS_GASTO` (do not alias)
      so `tsc` fails at every stale call site (design §1.8).
      - Verify: `pnpm --filter @moneydiary/mobile test distribucion-gasto.spec.ts` — ~10 cases green (design §3 total).
- [x] **T1.6 (D-09 parity gate, web side)** In
      `apps/web/src/domain/distribucion-gasto.test.ts`, adopt the shared
      `it.each(CASOS_PARIDAD_ANILLO)` against web's own
      `calcularDistribucionGasto`, re-expressed (not duplicated logic) —
      web's existing cases stay.
      - Verify: `pnpm web test distribucion-gasto.test.ts`
- [x] **T1.7** In `apps/mobile/src/theme/colors.ts`, add the `sinCategoria:
      '#8A8F9C'` token + `COLOR_BUCKET` entry (D-10). No dedicated test file
      — covered downstream by Phase 3/4b legend and ring assertions.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`
- [x] **T1.8 (REFACTOR + sweep)** Confirm zero remaining references to
      `BUCKETS_GASTO` anywhere in `apps/mobile` (design §1.8's point), and
      that `formatearMontoCLP`'s existing call sites
      (`resumen-view-model.ts:53,70`, `preview-cartola.ts:48,49`) still
      compile and behave identically for every well-formed decimal string
      (design §4 impact sweep).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR1 gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~390 lines, ~19 tests.

---

## Phase 2 — Domain + API: period helpers, annual fetch, refresh fan-out [PR 2]

Requirements: MOB-10, MOB-13. Depends on Phase 1 landing (chain order; no
direct code coupling).

- [x] **T2.1 (RED)** Create `apps/mobile/src/domain/periodo-anual.spec.ts`
      (11 cases): `mesAbreviado` for months 1/7/12 (3); unparseable →
      verbatim, one per exported function (2); `mesCompletoLabel('2026-07')`
      → `'julio 2026'` (1); `anioDePeriodo` (1) + its fallback (1);
      `periodoActualUTC` with an injected `Date` (1); **UTC, not local**: a
      `Date` whose local month differs from its UTC month resolves by UTC
      (1); month is zero-padded (1). `[P]` with T2.3 (disjoint files).
      - Verify (expect RED — module doesn't exist): `pnpm --filter @moneydiary/mobile test periodo-anual.spec.ts`
- [x] **T2.2 (GREEN)** Create `apps/mobile/src/domain/periodo-anual.ts`:
      `mesAbreviado`, `mesCompletoLabel`, `anioDePeriodo`,
      `periodoActualUTC(ahora: Date)` — `ahora` stays an injected argument,
      never `new Date()` internally (design §1.3).
      - Verify: `pnpm --filter @moneydiary/mobile test periodo-anual.spec.ts` — 11 green.
- [x] **T2.3 (RED)** In `apps/mobile/src/api/client.spec.ts`, add +13 cases
      for `fetchResumenAnual`: URL is `{base}/api/resumen/anual` with no
      query when `anio` omitted (1); `?anio=2026` when given (1); sends
      `x-api-key`/`Authorization` (1); 200 ok (1); 401→`unauthorized` (1);
      500→`http` (1); 400→`http` per D-03 (1); fetch rejection→`network`
      (1); missing base URL→`network`, no fetch performed (1); non-JSON→
      `parse` (1); wrong shape→`parse` (1); money guard (D-14): a
      `bucket.total` of `'12.5'`→`parse` on `/api/resumen` (1) and inside
      `meses[3]` on `/anual` (1). `[P]` with T2.1.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test client.spec.ts`
- [x] **T2.4 (GREEN)** In `apps/mobile/src/api/client.ts`, add
      `fetchResumenAnual(anio?)` mirroring `fetchResumen` byte-for-byte in
      shape (D-02): same `ApiResult`/`ApiError` tags, same
      `construirHeadersSesion`, never throws. Extend `esResumenMesDto`/add
      `esResumenAnualDto` (reusing `esResumenMesDto` over `meses`, DRY) with
      the money-format guard via `esMontoStringValido` on `totalIngreso` and
      every `bucket.total` (D-14).
      - Verify: `pnpm --filter @moneydiary/mobile test client.spec.ts` — 15 new cases green (design §3 "API — 15 cases").
- [x] **T2.5 (RED)** In `apps/mobile/src/api/resumen-refresh.spec.ts`, add +2
      cases: two registered listeners both fire on
      `solicitarRecargaResumen()` (1); unregistering one leaves the other
      subscribed (1). Existing cases must stay green.
      - Verify (expect RED for the 2 new cases): `pnpm --filter @moneydiary/mobile test resumen-refresh.spec.ts`
- [x] **T2.6 (GREEN)** In `apps/mobile/src/api/resumen-refresh.ts`, promote
      the single-listener slot to a `Set<() => void>` (D-13);
      `registrarRecargaResumen` returns an unregister that deletes only its
      own callback. Caller-facing API is unchanged — no edit needed in
      `app/index.tsx` or `app/subir.tsx` (design §4 impact sweep).
      - Verify: `pnpm --filter @moneydiary/mobile test resumen-refresh.spec.ts` full green.
- [x] **T2.7 (REFACTOR)** Confirm `periodo-anual.ts` never calls `new
      Date()` internally and mirrors `formatearPeriodoLabel`'s total/
      never-throw discipline.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR2 gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~395 lines, ~26 tests.

**PR2 real (post-lint):** 536 insertions / 26 deletions across 7 files (383/26
tracked-file diff + 153 lines for the two new `periodo-anual.*` files) vs
~395 forecast — over, same pattern PR1 flagged: docstring-heavy comments
(this codebase's convention) inflate `client.spec.ts` past a raw case-count
estimate (real 227 insertions for 13 new cases + 1 money-guard case on the
existing `fetchResumen` describe). Test count: 283 total (257 baseline + 26
new), exactly matching the ~26 forecast. **Deviation (T2.5/T2.6):** the
pre-existing `resumen-refresh.spec.ts` case "re-registering replaces the
previous listener" tested single-slot "last wins" semantics that are
structurally impossible under a genuine `Set<() => void>` (two distinct
listener identities registered without an intervening unregister now BOTH
fire — that is the entire point of D-13's promotion, letting `ResumenAnual`
coexist with `app/index.tsx`'s `cargar()`). Confirmed by running it RED
against the real Set implementation (not assumed). Inverted, not silently
deleted, into "registering two distinct listeners without unregistering the
first accumulates both (D-13)" — same discipline as PR1's D-09 fixture
tie-case inversion. No coverage lost: the stale-cleanup-safety guarantee
("desregistrarRecargaResumen does NOT clear a newer listener registered
after it") and the two new D-13 cases already cover real caller behavior
(React effect cleanup unregisters before re-registering).

---

## Phase 3 — Domain: view model (`resumen-view-model.ts`) [PR 3]

Requirements: MOB-08, MOB-10. Depends on Phase 1 (`BUCKETS_ANILLO`/
`BUCKETS_5030`, `montoSeguro`) and Phase 2 (`ResumenAnualDto` shape already
typed via `@moneydiary/api-client`).

- [ ] **T3.1 (RED)** In `apps/mobile/src/domain/resumen-view-model.spec.ts`,
      add ~12 cases: `leyendaPrincipal` is exactly 3 `kind:'gasto'` items in
      canonical order (1); its percentages equal the diluted ring values,
      not renormalized (1); `leyendaComplemento` is always `[ingreso,
      sinCategoria]` in that order (1); `cantidadSinCategoria: 0` yields a
      real `'0 tx'` row (1); ingreso `+`-prefixed, spend/sinCategoria
      `-`-prefixed (1); `leyendaPrincipal` empties with no spending while
      `leyendaComplemento` stays (1); `estadoGlobal` passes verbatim (1);
      `aResumenAnualViewModel`: 12 months, labels `ENE…DIC` (1); `tieneDatos
      === !sinIngreso` (1); tajadas per month use the 4-item ring (1);
      `sinDatosEnElAnio` true only when all 12 are `sinIngreso` (1); a month
      with no spend yields `tajadas: []` (1). **Delete** "propaga los
      targets" and "deriva periodoLabel" (design §1.8) — confirm they are
      gone, not just unedited.
      - Verify (expect RED for new cases): `pnpm --filter @moneydiary/mobile test resumen-view-model.spec.ts`
- [ ] **T3.2 (GREEN)** In `apps/mobile/src/domain/resumen-view-model.ts`:
      port `ItemLeyenda` (discriminated union `'gasto'`|`'sinCategoria'`|
      `'ingreso'`) verbatim; `leyendaPrincipal` (filtered, never
      renormalized) + `leyendaComplemento` (fixed order, always both) per
      design §1.4(a)(b); add `aResumenAnualViewModel(dto: ResumenAnualDto)`
      with `MesAnualViewModel`/`ResumenAnualViewModel` (design §1.4(c));
      drop `targets` and `periodoLabel`.
      - Verify: `pnpm --filter @moneydiary/mobile test resumen-view-model.spec.ts` — ~12 new + regression on unedited cases green.
- [ ] **T3.3 (REFACTOR)** Confirm `resumen-view-model.ts` imports only
      domain-tier modules (`distribucion-gasto`, `periodo-anual`,
      `formatear-monto`) — never `react-native-svg` or `theme/` (design §0
      dependency rule).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test resumen-view-model.spec.ts`

**PR3 gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~330 lines, ~12 tests.

---

## Phase 4a — Chart card, part 1: donut geometry + `DistribucionPie` [PR 4a]

Requirements: MOB-08, MOB-15 (IDEAL inset removal). Depends on Phase 1
(`TajadaGasto`/ring shape). Independently reviewable — under the 400-line
budget.

- [ ] **T4a.1 (RED)** In `apps/mobile/src/domain/pie-geometry.spec.ts`, add
      +4 cases: `rInterior = 0` returns the byte-identical legacy string for
      a normal wedge (1) and for the 360° branch (1) — the regression
      contract; `rInterior > 0` emits an annular wedge (outer arc, inward
      line, reversed inner arc) (1); `rInterior >= r` degrades to the
      filled wedge instead of throwing (1).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test pie-geometry.spec.ts`
- [ ] **T4a.2 (GREEN)** In `apps/mobile/src/domain/pie-geometry.ts`, port
      web's trailing-optional `rInterior` parameter to `arcoPath` (design
      §1.6), clamped to `[0, r)` — degrade, never throw. `radioEtiqueta` is
      **not** ported (D-07 — the ring is label-less).
      - Verify: `pnpm --filter @moneydiary/mobile test pie-geometry.spec.ts` — existing + 4 new green.
- [ ] **T4a.3 (RED)** Create
      `apps/mobile/src/components/DistribucionPie.spec.tsx` (5 cases): 4
      wedge paths for a 4-item ring (1); placeholder ring when `tajadas` is
      empty (1); no IDEAL inset and no `targets` prop in the public type
      (1); no on-wedge `%` text nodes, D-07 (1); keeps
      `accessibilityLabel="Distribución del gasto"` — the Maestro anchor
      (`.maestro/a11y-labels.yaml:46`) (1).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test DistribucionPie.spec.tsx`
- [ ] **T4a.4 (GREEN)** Rewrite `apps/mobile/src/components/DistribucionPie.tsx`:
      4-wedge donut (`RATIO_INTERIOR = 0.58`), white 2px wedge separator
      (WCAG 1.4.11), muted placeholder ring when `tajadas` is empty.
      **Removed**: the IDEAL inset, `slicesIdeales`, the `targets` prop,
      `centroidLabel`, on-wedge `%` labels (MOB-15).
      - Verify: `pnpm --filter @moneydiary/mobile test DistribucionPie.spec.tsx` — 5 green.
- [ ] **T4a.5 (REFACTOR + sweep)** Confirm `accessibilityLabel="Distribución
      del gasto"` is byte-identical to the Maestro anchor and every other
      reference (`.maestro/resumen-semaforo.yaml:20`,
      `test/auth-navigation.integration.spec.tsx` ×3) — do not "improve"
      this string (design §4).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test pie-geometry.spec.ts DistribucionPie.spec.tsx`

**PR4a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~270 lines, 9 tests. Under budget.

---

## Phase 4b — Chart card, part 2: legend + `SemaforoTag` + `ResumenScreen` [PR 4b]

Requirements: MOB-03, MOB-08, MOB-09, MOB-15 ("Ver detalles ›" removal).
Depends on Phase 4a (`DistribucionPie` in the new donut shape) and Phase 3
(`ItemLeyenda`, `leyendaPrincipal`/`leyendaComplemento`). ~412 lines —
marginal `size:exception` candidate (see forecast).

- [ ] **T4b.1 (RED)** Create `apps/mobile/src/theme/semaforo-estilos.spec.ts`
      (3 cases): the three known estados resolve to distinct labels (1);
      `null` → `SIN_DATOS` (1); an unknown string → `SIN_DATOS`, never a
      known colour (1). `[P]` with T4b.5 (disjoint files).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test semaforo-estilos.spec.ts`
- [ ] **T4b.2 (GREEN)** Create `apps/mobile/src/theme/semaforo-estilos.ts`:
      extract the `estado → {label, cara, icon, bg}` table out of
      `SemaforoBadge` (D-12, mirrors web's US-047 D-06 extraction). Unknown/
      `null` estado → `SIN_DATOS`, never coerced into a known colour.
      - Verify: `pnpm --filter @moneydiary/mobile test semaforo-estilos.spec.ts` — 3 green.
- [ ] **T4b.3 (RED)** Create `apps/mobile/src/components/SemaforoTag.spec.tsx`
      (5 cases): verde/amarillo/rojo render the Spanish word as visible text
      (1 parametrized block); `null` → `Sin datos`, never coerced into a
      colour (1); an unknown wire value → `Sin datos` (1); not a button, no
      press handler (1); the state word is real text, not colour-only,
      ADR-018 (1).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test SemaforoTag.spec.tsx`
- [ ] **T4b.4 (GREEN)** Create `apps/mobile/src/components/SemaforoTag.tsx`:
      static tinted pill, face + `Semáforo: {label}`. **No `Pressable`, no
      chevron, no `onPress`** (binding decision 1, MOB-09). `estadoGlobal`
      passes through verbatim (ADR-024, never recomputed). Preserve
      `testID="semaforo-global"` on the wrapper (Maestro anchor).
      - Verify: `pnpm --filter @moneydiary/mobile test SemaforoTag.spec.tsx` — 5 green.
- [ ] **T4b.5 (RED)** Create `apps/mobile/src/components/LeyendaGasto.spec.tsx`
      (8 cases): exactly 5 rows (1); labels `Necesidades`/`Gustos`/`Ahorro`/
      `Ingresos`/`Sin categoría` — never raw `Deseos`/`SinCategoria` (1);
      spend rows show the ring `%` (1); the sinCategoria row shows `N tx`
      and no `%` (1); amounts carry `+`/`−` per kind (1); zero rows are
      `role="button"`, zero chevrons — binding decision 2 (1); the
      sinCategoria row's accessible name spells out "transacciones sin
      categorizar" (1); `cantidadLabel: '0 tx'` still renders a row (1).
      `[P]` with T4b.1.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test LeyendaGasto.spec.tsx`
- [ ] **T4b.6 (GREEN)** Rewrite `apps/mobile/src/components/LeyendaGasto.tsx`:
      props `{ principales, complemento }: ReadonlyArray<ItemLeyenda>`; a
      vertical 5-row list, every row an inert `View`; dispatch by
      `item.kind`, never a boolean flag; the sinCategoria row's
      `accessibilityLabel` expands `'N tx'` → `'N transacciones sin
      categorizar'` via the same `.replace(/\s*tx$/, …)` as web.
      - Verify: `pnpm --filter @moneydiary/mobile test LeyendaGasto.spec.tsx` — 8 green.
- [ ] **T4b.7 (RED)** Rewrite `apps/mobile/src/components/ResumenScreen.spec.tsx`
      (7 cases): the `'Distribución del gasto'` heading anchor survives (1);
      it is an accessible `header` (1); `$1.000.000` income (1); the 5
      legend labels are present (1); `testID="semaforo-global"` present and
      **not** a button (1); no `'Ver detalles ›'` anywhere (1); no `'IDEAL'`
      anywhere (1). Delete the pre-existing "Ver detalles" case and the
      period-label case (moved to the route, Phase 5b).
      - Verify (expect RED against the still-old `ResumenScreen.tsx`): `pnpm --filter @moneydiary/mobile test ResumenScreen.spec.tsx`
- [ ] **T4b.8 (GREEN)** Rewrite `apps/mobile/src/components/ResumenScreen.tsx`:
      re-scope from "the whole screen" to "the month block" (name kept —
      D-06, three docstrings + a Maestro comment + the integration spec
      reference it); compose `IngresoCard` + chart card (heading,
      `SemaforoTag`, `DistribucionPie`, `LeyendaGasto`); **remove** the `Ver
      detalles ›` `Pressable` (MOB-15, no destination exists).
      - Verify: `pnpm --filter @moneydiary/mobile test ResumenScreen.spec.tsx` — 7 green.
- [ ] **T4b.9 (Removal)** Delete `apps/mobile/src/components/SemaforoBadge.tsx`
      and `SemaforoBadge.spec.tsx` (−103 lines, −5 test cases). Sole
      production consumer was `ResumenScreen.tsx:6,41` (ripgrep-verified,
      design §4) — now replaced by `SemaforoTag`. State-table coverage is
      re-expressed in T4b.1/T4b.3 (`semaforo-estilos.spec.ts` +
      `SemaforoTag.spec.tsx`) — confirm no coverage is lost before deleting.
      - Verify: `pnpm --filter @moneydiary/mobile test` — `SemaforoBadge.spec.tsx` no longer exists; the two new suites cover its former assertions.
- [ ] **T4b.10 (REFACTOR + sweep)** Confirm `targets`/`ResumenViewModel
      .targets` are fully unreferenced (Phase 3 removed the type; this
      confirms no component still imports it), and that
      `DistribucionPie`/`LeyendaGasto`/`SemaforoTag` reach theme colors only
      via `COLOR_BUCKET`/`semaforo-estilos.ts` (design §0 domain/
      presentation boundary).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR4b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~412 lines, 18 tests. Marginal over budget — `size:exception` or a further split candidate.

---

## Phase 5a — Annual grid, part 1: `MiniDistribucionPie` + `ResumenAnual` [PR 5a]

Requirements: MOB-10, MOB-11, MOB-12. Depends on Phase 2 (`fetchResumenAnual`,
`resumen-refresh` `Set`), Phase 3 (`aResumenAnualViewModel`), Phase 4a
(`arcoPath`'s `rInterior`, reused by the mini). ~455 lines — `size:exception`
candidate (see forecast).

- [ ] **T5a.1 (RED)** Create
      `apps/mobile/src/components/MiniDistribucionPie.spec.tsx` (3 cases):
      ≤4 paths for a 4-item ring (1); placeholder circle when empty (1); no
      text/label nodes rendered (1). `[P]` with T5a.3 (disjoint files).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test MiniDistribucionPie.spec.tsx`
- [ ] **T5a.2 (GREEN)** Create
      `apps/mobile/src/components/MiniDistribucionPie.tsx`: fixed
      `size = 44`, label-less, ≤4 `<Path>`, muted placeholder circle when
      `tajadas` is empty. No accessibility props — the parent `Pressable` is
      `accessible` and collapses the subtree.
      - Verify: `pnpm --filter @moneydiary/mobile test MiniDistribucionPie.spec.tsx` — 3 green.
- [ ] **T5a.3 (RED)** Create `apps/mobile/src/components/ResumenAnual.spec.tsx`
      (14 cases): loading → `'Cargando resumen anual…'` (1); error → retry
      affordance + retry re-fetches (2); all-12-`sinIngreso` →
      `'Todavía no hay datos este año'`, no grid (1); heading `Año 2026` (1);
      renders 12 cells (1); each cell exposes `accessibilityLabel="Ver julio
      2026"` (1); a month with data is pressable and calls
      `onSelectPeriodo` with its `YYYY-MM` (1); a month without data is
      `disabled` and pressing it does **not** call `onSelectPeriodo` (1);
      the disabled cell carries `accessibilityState.disabled` (1); the
      selected cell carries `accessibilityState.selected`, no other cell
      does (1); an annual failure does not affect what the parent renders
      (1); registers with `resumen-refresh` and reloads on
      `solicitarRecargaResumen()` — D-13 (1); calls `fetchResumenAnual` with
      **no arguments** — MOB-10 (1). `[P]` with T5a.1.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test ResumenAnual.spec.tsx`
- [ ] **T5a.4 (GREEN)** Create `apps/mobile/src/components/ResumenAnual.tsx`
      (+ `MesCelda` inside it): self-contained section, own `useEffect`/
      `useState` around `fetchResumenAnual()` called with no argument, own
      Loading/Error+retry/Empty/data states; `anio` prop labels the heading
      only, never the fetch; `useMemo(() => aResumenAnualViewModel(dto),
      [dto])`; renders `MesCelda` ×12 in a `flex-row flex-wrap` 4×3 grid.
      `MesCelda`: `React.memo`'d `Pressable`, `accessibilityRole="button"`,
      `accessibilityLabel={'Ver ' + nombreAccesible}`,
      `accessibilityState={{ selected, disabled: !tieneDatos }}`,
      `disabled={!tieneDatos}`; selected → 2px ring + bold label (D-17); min
      height 76 (WCAG 2.5.8 tap target ≥44×44). Registers/unregisters with
      `resumen-refresh` (D-13).
      - Verify: `pnpm --filter @moneydiary/mobile test ResumenAnual.spec.tsx MiniDistribucionPie.spec.tsx` — 17 green.
- [ ] **T5a.5 (REFACTOR)** Confirm the design §1.7 perf measures are in
      place by code inspection (D-15; not directly assertable by RNTL): the
      12-month ring math is computed once per fetch and memoized, `MesCelda`
      is `React.memo`'d with primitive + a referentially-stable per-month
      object and a `useCallback`'d `onSelectPeriodo`, plain `View` rows —
      not `FlatList`.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test`

**PR5a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~455 lines, 17 tests. Over budget — `size:exception` candidate.

---

## Phase 5b — Route shell composition (`app/index.tsx`) [PR 5b]

Requirements: MOB-03, MOB-12, MOB-13, MOB-14. Depends on ALL prior phases —
this is the wiring slice that composes the shell.

- [ ] **T5b.1** In `apps/mobile/src/components/states/Loading.tsx`, add an
      optional `mensaje` prop, default `'Cargando resumen…'` (existing spec
      stays green, unedited — `ResumenAnual`, T5a.4, already passes
      `'Cargando resumen anual…'`).
      - Verify: `pnpm --filter @moneydiary/mobile test Loading.spec.tsx` — existing cases green, no new cases required.
- [ ] **T5b.2 (RED)** In `apps/mobile/app/index.spec.tsx`, add +5 cases: the
      annual section renders **alongside** `Empty` when `sinIngreso` — CQ1/
      MOB-14 (1); it also renders alongside `loading` and `error` — D-05
      (1); tapping a month re-fetches `/api/resumen` with that `periodo`
      (1); the header label follows the selected month (1); the default
      mount fetches with `periodo === undefined` (1). The 12 existing cases
      (including the `'Distribución del gasto'` anchor) MUST stay green
      unedited.
      - Verify (expect RED for the 5 new cases against the pre-shell `app/index.tsx`): `pnpm --filter @moneydiary/mobile test app/index.spec.tsx`
- [ ] **T5b.3 (GREEN)** Rewrite `apps/mobile/app/index.tsx` into the shell
      (D-05/D-06, design §1.9): `SafeAreaView` > `ScrollView`
      (`contentContainerStyle={{ flexGrow: 1 }}` — **required** for
      `Loading`/`ErrorState`/`Empty` centering now that the SLOT sits one
      level deeper, design §0) > `Header` (`periodoLabel =
      formatearPeriodoLabel(periodoVista)`) > SLOT (`switch(estadoMes)`:
      `loading`→`Loading` / `error`→`ErrorState` / `data`+`sinIngreso`→
      `Empty` / `data`→`ResumenScreen`) > `ResumenAnual(anio,
      periodoSeleccionado, onSelectPeriodo)` as a **sibling** of the SLOT,
      always rendered. State: `periodo` (`useState<string | undefined>
      (undefined)`), `cargar` (`useCallback`, deps `[periodo]`, effect
      re-fires on month change); `periodoVista = periodo ??
      periodoActualUTC(new Date())`; `anio = anioDePeriodo(periodoVista,
      ...)`. Tapping a cell calls `setPeriodo(p)`.
      - Verify: `pnpm --filter @moneydiary/mobile test app/index.spec.tsx` — 12 existing + 5 new green.
- [ ] **T5b.4 (flexGrow shell requirement — manual verification, NOT a CI
      gate)** This task defines the requirement RNTL cannot assert (design
      §0: "a layout requirement no RNTL test can measure — RNTL does not lay
      out"): `Loading`/`ErrorState`/`Empty` must stay centered inside the
      `ScrollView` from T5b.3. The actual on-device check is executed and
      logged in Phase 6 (T6.3) via Maestro or the EAS internal build
      (ADR-022) — do not attempt to fake this with a unit/RNTL test.
- [ ] **T5b.5 (REFACTOR + sweep)** Confirm
      `registrarRecargaResumen`/`solicitarRecargaResumen`'s caller-facing
      API in `app/index.tsx` and `app/subir.tsx` is unchanged by the `Set`
      promotion (design §4), and that the 4 pinned anchor strings
      (`'Distribución del gasto'`, `testID="semaforo-global"`, `'Subir
      cartola'`, `'Cerrar sesión'`) are untouched.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green; `rg` confirms the 4 anchor strings unchanged.
- [ ] **T5b.6 (OPTIONAL)** Extend `.maestro/resumen-semaforo.yaml` with
      `assertVisible: "Sin categoría"` and `"Año 2026"`. Device-gated,
      manual, never CI — not a gate for this PR.

**PR5b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~195 lines, 5 tests. Under budget.

---

## Phase 6 — Closing tasks

Depends on all prior phases landing (on `main`, per whichever chain strategy
the user selects — see forecast above).

- [ ] **T6.1** Full mobile battery: `pnpm --filter @moneydiary/mobile test`
      (full suite — expect 112 new/changed cases green: 46 domain + 15 api +
      51 component/route, per design §3, plus ~25 existing unedited cases
      still green) · `pnpm --filter @moneydiary/mobile exec tsc --noEmit` ·
      `pnpm --filter @moneydiary/mobile lint`.
- [ ] **T6.2 (Wireframe conformance pass)** On the EAS internal build or
      Expo Go (ADR-022), compare the rendered dashboard against wireframe
      M1: donut + 5-row legend + static semáforo tag top-right (CA-01); `Año
      YYYY` 12-cell grid with the selected month highlighted (CA-02). Record
      pass/fail per CA in this task's completion note.
- [ ] **T6.3 (flexGrow manual check — executes T5b.4's requirement)** On the
      EAS internal build or via a Maestro run, confirm `Loading`/
      `ErrorState`/`Empty` remain centered under the shell `ScrollView`
      (`contentContainerStyle={{ flexGrow: 1 }}`). This is **not** a CI
      gate — log the device/build used and the result here.
- [ ] **T6.4 (Ledger reconciliation)** Record REAL final test counts vs.
      design §3's forecast (112 new/changed cases: 46 domain + 15 api + 51
      component/route, plus 5 deleted with their subject and ~25 existing
      unedited) and REAL final line counts vs. §5's forecast (~390 / ~395 /
      ~330 / ~682 split 270+412 / ~650 split 455+195, total ~2 447). Note
      any divergence here before archiving — do not silently let the ledger
      go stale (same discipline as US-049's T8.2).
- [ ] **T6.5** Confirm no backend/schema/contract change shipped: zero edits
      under `apps/api`; zero new dependencies added to `apps/mobile`
      (`package.json` diff-check, proposal success criterion); zero
      `packages/api-client` regen needed (design §4 — `ResumenAnualDto`/
      `ResumenMesDto` already exported); confirm no Prisma migration was
      introduced.
- [ ] **T6.6** Engram/OpenSpec artifact sync: after the last PR in the chain
      merges, update `sdd/us-050-mobile-dashboard/apply-progress` in Engram
      and confirm this file's checkboxes reflect the final state before
      `sdd-archive`.
- [ ] **T6.7** Close issue **#284**, linking the merged PR chain (or the
      tracker branch merge commit, per the chosen chain strategy).
