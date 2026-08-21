# Tasks: US-056 — Mobile: páginas de detalle MES con paridad (issue #290)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,470 total (PR1 ~150 · PR2 ~410 · PR3 ~290 · PR4 ~350 · PR5 ~300) |
| 400-line budget risk | Low per PR (PR2 ~410 requires `size:exception` — pure additive domain+component, low-risk) |
| Chained PRs recommended | Yes (5 sequential PRs, stacked-to-main) |
| Suggested split | PR1 navigation → PR2 plumbing+domain+SelectorPeriodoMes → PR3 M1 read-only → PR4 reclassify → PR5 M2 |
| Delivery strategy | stacked-to-main |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

**Resolved fork (previously open in design §7):** The design §7 presented a choice between 5 PRs (SelectorPeriodoMes in PR3) vs. 6/refolded (SelectorPeriodoMes folded into PR2). **DECISION: SelectorPeriodoMes folds into PR2.** Rationale: `SelectorPeriodoMes` depends only on the period helpers landing in PR2 (D-13), so shipping the component alongside its sole domain dependencies is cohesive. It drops PR3 from ~400 LOC (at budget) to ~290 LOC (comfortably under). PR2 goes from ~300 to ~410 LOC; because this is purely additive domain code + one new component, a `size:exception` on PR2 is lower risk than a `size:exception` on PR3 (which carries a denser screen+accordion+route slice). No further splitting needed — all other PRs are well under 400.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Legend pressability + navigation + stub routes | PR1 ~150 LOC | Additive; reverting makes routes unreachable while screen files stay inert |
| 2 | Plumbing (fetchers, reclassify wrapper, VMs, helpers) + SelectorPeriodoMes | PR2 ~410 LOC | Additive domain only; `size:exception` accepted (low-risk additive diff) |
| 3 | M1 read-only screen + accordion + real bucket route | PR3 ~290 LOC | Replaces PR1 stub; MDET-01..04 green |
| 4 | Reclassify control wired into M1 | PR4 ~350 LOC | Highest-effort; MDET-05 green |
| 5 | M2 ingresos screen + real ingresos route | PR5 ~300 LOC | Replaces PR1 stub; MDET-06/07 green |

---

## T-00 — Docs PR: commit planning artifacts (separate docs-only PR, before any code PR)

**Pattern**: US-054/US-055 precedent — planning docs go into a separate `docs(openspec):` PR before the code chain. All files under `openspec/changes/us-056-mobile-detalle-mes/` (proposal.md, specs/, design.md, tasks.md) are uncommitted on the worktree and must be committed and merged to `main` first so each code PR's merge base is clean.

- **Action**: stage and commit all files under `openspec/changes/us-056-mobile-detalle-mes/`.
- **Commit message**: `docs(openspec): us-056 planning artifacts post-design-gate`
- **PR title**: `docs(openspec): us-056 planning artifacts post-design-gate`
- **Deps**: none (docs-only, no source files touched)
- **AC**: PR merged to `main`; PR1 branches off `main` with planning docs in history.

---

## PR1 — Legend pressability + navigation (~150 LOC, CA-01)

Branch off `main` after T-00 merges. Goal: legend rows become pressable; stub routes resolve pushes. Independently revertible — reverts PR1, routes become unreachable, screen files inert.

### T-01 — RED: LeyendaGasto pressability + nav args + periodo threading ✅ (4090b23)

**Design refs**: D-10, D-11, D-19  
**Spec refs**: MOB-08 (pressable rows, exact path strings incl. `periodo`)  
**Files** (MODIFY):
- `apps/mobile/src/components/LeyendaGasto.spec.tsx` (T-C14 — extend existing file; file was inert-View, now Pressable)

**RED-first test list (exact case names, all must fail before GREEN)**:
- `"each spend-bucket row is a Pressable with accessibilityRole button"` — assert role=button on `leyenda-fila-Necesidades`, `leyenda-fila-Deseos`, `leyenda-fila-Ahorro`
- `"pressing Necesidades row calls onNavegar with /bucket/Necesidades?periodo=2026-07"` — pin FULL path template (falsifies missing `periodo`)
- `"pressing SinCategoria row calls onNavegar with /bucket/SinCategoria?destacar=sin-categoria&periodo=2026-07"` — pin `?destacar=` AND `&periodo=` in exact order
- `"pressing Ingresos row calls onNavegar with /ingresos?periodo=2026-07"` — pin full path
- `"testIDs resolve uniquely: leyenda-fila-Necesidades, -Deseos, -Ahorro, -ingreso, -SinCategoria"` — `getByTestId` for each (was shared `"leyenda-fila"` → must fail before unique IDs added)

Wiring pin: `"LeyendaGasto requires onNavegar prop (no optional default)"` — render without prop → tsc error (type-level, documented; confirmed via compile run before proceeding).

**Commit**: `test(mobile): RED legend rows pressable + nav args + periodo threading`  
**Deps**: none  
**AC**: `pnpm --filter @moneydiary/mobile test -- LeyendaGasto` fails on the 5 cases above. RED evidence recorded inline ✅.

---

### T-02 — GREEN: LeyendaGasto rows View→Pressable + ResumenScreen + index.tsx wiring ✅ (1813549)

**Design refs**: D-10, D-11, D-19  
**Spec refs**: MOB-08  
**Files** (MODIFY):
- M2 `apps/mobile/src/components/LeyendaGasto.tsx` — swap three `return` root `<View testID="leyenda-fila">` for `<Pressable testID={leyenda-fila-${key}} accessibilityRole="button" accessibilityLabel={…} onPress={() => onNavegar(path)}>`. Add required props `periodo: string | undefined` and `onNavegar: (path: string) => void`. Update the inert-row docstring (`:6-16`) to reflect pressability — `"non-interactive"` claim becomes false (D-11 truthful-comments obligation).
- M3 `apps/mobile/src/components/ResumenScreen.tsx` — thread `periodo` + `onNavegar` props; pass them to `<LeyendaGasto periodo onNavegar … />`.
- M4 `apps/mobile/app/index.tsx` — pass `periodo={periodoVista}` and `onNavegar={(path) => router.push(path)}` to `<ResumenScreen>`.

**Commit**: `feat(mobile): legend rows Pressable + onNavegar thread + unique testIDs (D-10/D-11)`  
**Deps**: T-01  
**AC**: `pnpm --filter @moneydiary/mobile test -- LeyendaGasto` — all 5 RED cases green; full suite green. `tsc --noEmit` via `pnpm --filter @moneydiary/mobile exec tsc --noEmit` clean.

---

### T-03 — Register stub routes in _layout.tsx + stub screens ✅ (7a6f0bc)

**Design refs**: D-12  
**Spec refs**: MDET-01, MDET-06 (routes must resolve)  
**Files** (MODIFY/CREATE):
- M1 `apps/mobile/app/_layout.tsx` — add `<Stack.Screen name="bucket/[bucket]">` and `<Stack.Screen name="ingresos">` to the authenticated `<Stack.Protected>` block (`:42-47`). This is the ONLY `_layout.tsx` edit in the entire change.
- C1 stub `apps/mobile/app/bucket/[bucket].tsx` — placeholder screen: renders `<Text>M1 stub</Text>` + back `Pressable`; will be replaced in PR3 T-10.
- C2 stub `apps/mobile/app/ingresos.tsx` — placeholder screen: renders `<Text>M2 stub</Text>` + back `Pressable`; will be replaced in PR5 T-19.

**Commit**: `feat(mobile): register bucket/[bucket] and ingresos stub routes in _layout.tsx (D-12)`  
**Deps**: T-02  
**AC**: `pnpm --filter @moneydiary/mobile exec tsc --noEmit` clean. Pressing a legend row (manual) navigates without crashing. PR1 gates: MOB-08 spec scenarios green.

---

## PR2 — Plumbing + domain + SelectorPeriodoMes (~410 LOC, CA-02/03 foundation)

Branch off `main` after PR1 merges. Additive only — zero existing behavior changes. `size:exception` accepted (pure domain additive, low-risk diff).

### T-04 ✅ (1f09720) — RED: unit specs for VMs + helpers + fetchers + reclassify wrapper + period helpers

**Design refs**: D-13, D-14, D-15, D-16, D-21, D-22  
**Spec refs**: MDET-07  
**Files** (CREATE — all RED spec files with no production source yet):
- T-C1 `apps/mobile/src/domain/detalle-bucket-mes-view-model.spec.ts`
- T-C2 `apps/mobile/src/domain/ingresos-mes-view-model.spec.ts`
- T-C3 `apps/mobile/src/domain/fecha-corta.spec.ts`
- T-C4 `apps/mobile/src/domain/porcentaje.spec.ts`
- T-C5 `apps/mobile/src/domain/mensajes-reclasificar.spec.ts`
- T-C6 `apps/mobile/src/domain/periodo-anual.spec.ts` (extend existing file with new `mesAnterior`/`mesSiguiente`/`esMesActual` cases, OR create if absent — confirm at RED time)
- T-C7 `apps/mobile/src/api/detalle-fetchers.spec.ts`
- T-C8 `apps/mobile/src/api/reclasificar.spec.ts`

**RED-first test list (exact case names, counts per design §5)**:

`detalle-bucket-mes-view-model.spec.ts` (~10 cases):
- `"result.bucket equals the raw wire key — no etiquetaBucket field"` (MDET-07 first scenario — falsifies component-layer responsibility)
- `"totalLabel preserves digits beyond Number.MAX_SAFE_INTEGER"` (dto.total="9007199254740993" → no precision loss; falsifies parseFloat)
- `"porcentajeLabel is '—' when porcentajeBp is null (SIN_PORCENTAJE_LABEL)"` (sinPorcentaje: true)
- `"metaLabel is '—' (SIN_PORCENTAJE_LABEL) when metaBp is null (web parity; 'Sin meta' text is screen-layer per D-22)"` (sinMeta: true)
- `"sinMeta flag is true iff metaBp is null"` and `"sinPorcentaje flag is true iff porcentajeBp is null"`
- `"marcaPorcentajePct is clamped 0..100"` and `"marcaMetaPct is null when metaBp is null"` — pin VM field names exactly
- `"grupos array order and count match dto.grupos verbatim"`
- `"subtotalLabel and montoLabel are BigInt-exact CLP strings"`

`ingresos-mes-view-model.spec.ts` (~8 cases):
- `"conteoLabel is '0 ingresos' for conteo=0"`, `"'1 ingreso' for conteo=1"`, `"'N ingresos' for N>1"`
- `"totalLabel reads dto.total field (not totalIngreso — that field does not exist)"` — MDET-07 third scenario
- `"totalLabel for dto.total='1500000' equals '$1.500.000'"` 
- `"totalLabel for '0' has no sign (zero-no-sign)"` 
- `"mesLabel from periodo param"` and `"mesLabel falls back to periodoActualUTC when periodo undefined"`
- `"origen is verbatim from dto — no client normalization"`

`fecha-corta.spec.ts` (~2 cases): `"slices ISO string to YYYY-MM-DD"` and `"passthrough on short/malformed"`

`porcentaje.spec.ts` (~3 cases): `"null → '—'"` and `"0 → '0%'"` and `"N/100 format"`

`mensajes-reclasificar.spec.ts` (~6 cases):
- `"{ tag:'http', status:400 } (no code field — body absent) → invalid-category copy"` — inject REAL shape, not `{ code:'CATEGORIA_DESCONOCIDA' }` (that shape never arrives from the wire)
- `"{ tag:'http', status:404 } → tx-not-found copy"`
- `"network/unauthorized/parse → copiaPorApiError"` (×3 transport tags)

`periodo-anual.spec.ts` new cases (~6):
- `"mesAnterior('2026-07') returns '2026-06'"`
- `"mesAnterior('2026-01') returns '2025-12'"` (Jan→Dec year rollover — MDET-07 fourth scenario)
- `"mesSiguiente('2026-07') returns '2026-08'"`
- `"mesSiguiente('2026-12') returns '2027-01'"` (Dec→Jan year rollover — MDET-04 scenario)
- `"esMesActual returns true for current UTC month"` and `"false for prior month"`

`detalle-fetchers.spec.ts` (~14 cases, 7 per fetcher):
- Per fetcher: `"no API_BASE_URL → network error"`, `"fetch throws → network error"`, `"401 → unauthorized error"`, `"non-2xx → http error"`, `"bad JSON → parse error"`, `"bad shape → parse error"`, `"200 ok → ApiResult value with guarded DTO"`
- Money-guard: `"malformed monto/total in 200 body → parse error"` (falsifies omitting `esMontoStringValido`)

`reclasificar.spec.ts` (~5 cases):
- `"request body is { categoria } only — no bucket field"`
- `"200 ok returns guarded ReclasificarCategoriaDto value"`
- `"non-2xx propagated from enviarMutacion"`
- `"bad shape → parse error"`
- `"URL encodes transaccionId via encodeURIComponent"`

**Commit**: `test(mobile): RED unit specs — VMs, helpers, fetchers, reclassify, period helpers`  
**Deps**: T-03  
**AC**: ALL 54 unit cases fail RED (imports resolve to non-existent modules). RED evidence recorded inline ✅ with output snippets.

---

### T-05 ✅ (81d997d) — GREEN: port period helpers into periodo-anual.ts (M7)

**Design refs**: D-13  
**Spec refs**: MDET-04  
**Files** (MODIFY):
- M7 `apps/mobile/src/domain/periodo-anual.ts` — port `partesDePeriodo`, `formatearPeriodo`, `mesAnterior`, `mesSiguiente`, `esMesActual` from `apps/web/src/domain/periodo-anual.ts:85-162`. **UPDATE the file's docstring or any comment claiming these helpers are "out of scope for mobile" or "web-only"** — those claims become false once M7 lands (D-13 truthful-comments obligation).

**Commit**: `feat(mobile): port mesAnterior/mesSiguiente/esMesActual into periodo-anual.ts (D-13)`  
**Deps**: T-04  
**AC**: `pnpm --filter @moneydiary/mobile test -- periodo-anual` — 6 new cases green; existing cases unchanged.

---

### T-06 ✅ (78550a9) — GREEN: domain helpers — fecha-corta, porcentaje, detalle.types, mensajes-reclasificar

**Design refs**: D-14, D-15, D-21  
**Spec refs**: MDET-07  
**Files** (CREATE + MODIFY):
- C11 `apps/mobile/src/domain/fecha-corta.ts` — port `aFechaCorta(fechaIso) = fechaIso.slice(0, 10)` verbatim from web `fecha.ts:34-36`.
- C12 `apps/mobile/src/domain/porcentaje.ts` — promote `SIN_PORCENTAJE_LABEL` and `aPorcentajeLabel` from `resumen-view-model.ts` into a standalone module (mirror web `porcentaje.ts`).
- M8 `apps/mobile/src/domain/resumen-view-model.ts` — import `aPorcentajeLabel` from `porcentaje.ts`; re-export `SIN_PORCENTAJE_LABEL` (zero call-site churn — same exported name, new source).
- C13 `apps/mobile/src/domain/detalle.types.ts` — type aliases for `DetalleBucketMesDto`, `IngresosMesDto`, `ReclasificarCategoriaDto` (mirror `resumen.types.ts` pattern).
- C14 `apps/mobile/src/domain/mensajes-reclasificar.ts` — closed error table: `mensajeDeErrorReclasificar(error: ApiError): string`; switch on `error.tag`; `{ tag:'http', status:400 }` (no code — body absent per `types.gen.ts:1754-1766`) → invalid-category copy; `status:404` → tx-not-found copy; transport tags → `copiaPorApiError`; closed with `const _exhaustive: never`.

**Commit**: `feat(mobile): fecha-corta, porcentaje module, detalle.types, mensajes-reclasificar (D-14/D-21)`  
**Deps**: T-05  
**AC**: `pnpm --filter @moneydiary/mobile test -- fecha-corta porcentaje mensajes-reclasificar` — 11 cases green. `tsc --noEmit` clean.

---

### T-07 ✅ (41d3a88) — GREEN: view-models — detalle-bucket-mes-view-model + ingresos-mes-view-model

**Design refs**: D-22  
**Spec refs**: MDET-07  
**Files** (CREATE):
- C9 `apps/mobile/src/domain/detalle-bucket-mes-view-model.ts` — port `aDetalleBucketMesViewModel(dto: DetalleBucketMesDto): DetalleBucketMesViewModel` from web `detalle-bucket-mes-view-model.ts:9-112`. VM produces `bucket` (raw wire key, NOT `etiquetaBucket` — display-label resolution is the component layer's job). Uses mobile's `formatearMontoCLP`, `aPorcentajeLabel` from new `porcentaje.ts`, `clampBp`. Stub shapes in tests MUST satisfy `esDetalleBucketMesDto` guard (real DTO from `types.gen.ts:1839-1871`).
- C10 `apps/mobile/src/domain/ingresos-mes-view-model.ts` — port `aIngresosMesViewModel(dto, periodo?): IngresosMesViewModel` from web. Uses `aFechaCorta`, `formatearMontoConSigno(monto, '+')`, `mesCompletoLabel`. Mobile substitution: `periodoActualUTC(new Date())` where web uses `periodoActual()` (documented as mobile equivalent). Reads `dto.total` — **not** `totalIngreso` (that field does not exist in `IngresosMesResponse`; `types.gen.ts:1962-1976`).

**Commit**: `feat(mobile): port aDetalleBucketMesViewModel + aIngresosMesViewModel (D-22)`  
**Deps**: T-06  
**AC**: `pnpm --filter @moneydiary/mobile test -- detalle-bucket-mes-view-model ingresos-mes-view-model` — ~18 cases green. `tsc --noEmit` clean.

---

### T-08 ✅ (1da3149) — GREEN: fetchers + shape guards in client.ts + reclasificar wrapper in categorias.ts

**Design refs**: D-15, D-16  
**Spec refs**: MDET-07  
**Files** (MODIFY):
- M5 `apps/mobile/src/api/client.ts` — add `fetchDetalleBucketMes(bucket: string, periodo?: string): Promise<ApiResult<DetalleBucketMesDto>>` (URL `${API_BASE_URL}/api/buckets/${encodeURIComponent(bucket)}/detalle${periodo ? '?periodo='+encodeURIComponent(periodo) : ''}` — CONTRACT path from `types.gen.ts:487`); add `fetchIngresosMes(periodo?: string)` (URL `${API_BASE_URL}/api/ingresos/mes${…}`). Both copy `fetchResumen`'s never-throw skeleton exactly. Add `esDetalleBucketMesDto` and `esIngresosMesDto` shape guards (`esMontoStringValido` on all money fields; `bucket`/`origen` as plain `string` — never validated against `BUCKETS_ASIGNABLES`).
- M6 `apps/mobile/src/api/categorias.ts` — add `reclasificarCategoria(transaccionId: string, categoria: string): Promise<ApiResult<ReclasificarCategoriaDto>>`. Wraps `enviarMutacion`; sends body `{ categoria }` ONLY (no bucket). Reads+guards the response body (this is the one mutation whose success body IS consumed — for the destination bucket label needed in the announcement). Add `esReclasificarDto` guard (`{id:string, bucket:string, categoria:{id:string, nombre:string}}` per `types.gen.ts:2121-2129`).

**Commit**: `feat(mobile): fetchDetalleBucketMes/fetchIngresosMes + reclasificarCategoria wrapper (D-15/D-16)`  
**Deps**: T-07  
**AC**: `pnpm --filter @moneydiary/mobile test -- detalle-fetchers reclasificar` — ~19 cases green. `tsc --noEmit` clean.

---

### T-09 ✅ (1832bdb) — GREEN: SelectorPeriodoMes component + spec

**Design refs**: D-13  
**Spec refs**: MDET-04  
**Files** (CREATE):
- C8 `apps/mobile/src/components/SelectorPeriodoMes.tsx` — `{ periodo: string | undefined; onChange: (periodo: string) => void }`. Layout: `‹` `Pressable` (`accessibilityRole="button"`, `accessibilityLabel="Mes anterior"`, always enabled) + `mesCompletoLabel(efectivo)` `Text` (`accessibilityRole="header"`, NOT pressable) + `›` `Pressable` (`accessibilityLabel="Mes siguiente"`, `disabled={esMesActual(efectivo, ahora)}`, `accessibilityState={{ disabled: true }}` when disabled). `efectivo = periodo ?? periodoActualUTC(new Date())`. No "Hoy" button (D-13 deliberate scope trim vs web `PeriodoSelector.tsx:94-103` — documented).
- T-C9 `apps/mobile/src/components/SelectorPeriodoMes.spec.tsx` (~6 cases per design §5):
  - `"pressing ‹ calls onChange with mesAnterior result"` — MDET-04 first scenario
  - `"pressing ‹ on 2026-01 calls onChange with '2025-12'"` — Jan→Dec wrap
  - `"pressing › on 2026-12 calls onChange with '2027-01'"` — Dec→Jan wrap
  - `"label text matches mesCompletoLabel for periodo='2026-07'"` — e.g. `"julio 2026"`
  - `"› Pressable has accessibilityState.disabled true at current calendar month and pressing it does NOT call onChange"` — MDET-04 fifth scenario (falsifies wiring the disabled state but not making it inert)
  - `"periodo=undefined renders current-month label and disables › arrow"` — MDET-04 sixth scenario

**Commit**: `feat(mobile): SelectorPeriodoMes component + spec (D-13/MDET-04)`  
**Deps**: T-08 (depends on period helpers from T-05)  
**AC**: `pnpm --filter @moneydiary/mobile test -- SelectorPeriodoMes` — 6 cases green. `tsc --noEmit` clean. PR2 gate: all ~54 unit + 6 component cases green.

---

## PR3 — M1 read-only screen + accordion (~290 LOC, CA-02)

Branch off `main` after PR2 merges. Replaces the PR1 stub for `bucket/[bucket].tsx`. Gate: MDET-01..04 spec scenarios green.

### T-10 ✅ (66a7a0e) — RED: BucketDetalleScreen + GrupoMovimientosMobile + bucket route specs

**Design refs**: D-12, D-19, D-04 (accordion), MDET-03 (destacado dual mechanics)  
**Spec refs**: MDET-01, MDET-02, MDET-03  
**Files** (CREATE):
- T-C10 `apps/mobile/src/components/detalle/BucketDetalleScreen.spec.tsx` (~7 cases per design §5):
  - `"shows loading indicator and no content while fetchDetalleBucketMes is in flight"` — MDET-01 loading scenario
  - `"shows error copy and no stale data on failure"` — MDET-01 error scenario
  - `"shows empty-state message when grupos.length === 0"` — MDET-01 empty scenario (derived from data tag, NOT a fourth state tag)
  - `"renders M1 header and group list when data has groups"` — MDET-01 data scenario
  - `"header shows ETIQUETA_BUCKET display label, not raw key (Deseos → 'Gustos')"` — MDET-02 first scenario (raw-key implementation fails this)
  - `"sinMeta bucket shows 'Sin meta' text not 'null' or '%'"` — MDET-02 second scenario
  - `"sinPorcentaje bucket shows '—' not '0%'"` — MDET-02 third scenario (SIN_PORCENTAJE_LABEL)
  - `"status-reclasificar region is a stable sibling OUTSIDE every group element (ancestry assertion)"` + `"status-reclasificar region is present when grupos is empty (independent of group list)"` — MDET-05 structural placement (rewritten by the PR3 judgment gate, commit 07af81d: the original "outlives a moved row" case was vacuous in PR3 — the full moved-row content-survival scenario is exercised in PR4 T-13/T-15 when the real trigger exists)
- T-C11 `apps/mobile/src/components/detalle/GrupoMovimientosMobile.spec.tsx` (~6 cases):
  - `"group with 5 rows shows exactly 3 rows and 'Ver 2 más' collapsed (accessibilityState.expanded false)"` — MDET-03 first scenario
  - `"pressing 'Ver N más' reveals all 5 rows and changes text to 'Ver menos' (accessibilityState.expanded true)"` — MDET-03 second scenario
  - `"group with ≤3 rows shows no 'Ver N más' toggle"`
  - `"SinCategoria group root always carries testID='grupo-movimientos-sin-categoria'"`
  - `"inner testID='grupo-sin-categoria-destacado' is present inside SinCategoria root ONLY when destacar='sin-categoria'"` — MDET-03 third scenario (dual mechanics: root stable + inner conditional)
  - `"no element with testID='grupo-sin-categoria-destacado' when destacar is absent"` — MDET-03 fourth scenario
- T-C15a `apps/mobile/app/bucket/[bucket].spec.tsx` (~3 cases from the route machine suite):
  - `"useLocalSearchParams drives fetchDetalleBucketMes with bucket and periodo"`
  - `"periodo state steps on SelectorPeriodoMes arrow press → re-fetch fires"`
  - `"back Pressable calls router.back"`

**Commit**: `test(mobile): RED BucketDetalleScreen + GrupoMovimientosMobile + bucket route specs`  
**Deps**: T-09 (SelectorPeriodoMes must exist as import)  
**AC**: all ~16 cases fail RED (production source absent). RED evidence recorded inline ✅.

**Result**: Throwing stubs created to satisfy ESLint import/no-unresolved; all 17 cases failed RED. Committed `66a7a0e`.

---

### T-11 ✅ (098403d) — GREEN: GrupoMovimientosMobile accordion + SinCategoria destacado

**Design refs**: D-04 (3 visible + "ver N más"), D-19 (testID uniqueness), MDET-03 (destacado dual mechanics)  
**Spec refs**: MDET-03  
**Files** (CREATE):
- C4 `apps/mobile/src/components/detalle/GrupoMovimientosMobile.tsx` — accordion component. Props: `grupo`, `destacar?: string` ONLY — no callback props in PR3 (the PR3 judgment gate removed the premature optional `onReclasificado?`/`onMovida?` as a banned silent-noop variant, commit 07af81d; T-15 adds them as REQUIRED props when the real control lands). Root container: `testID={`grupo-movimientos-${categoriaId ?? 'sin-categoria'}`}`. Accordion: first 3 rows always visible; toggle pressable `testID={`grupo-toggle-${categoriaId ?? 'sin-categoria'}`}`; `"Ver N más"` / `"Ver menos"` toggle text with `accessibilityState={{ expanded }}`. SinCategoria destacado: when `destacar === 'sin-categoria'`, render an INNER wrapper `testID="grupo-sin-categoria-destacado"` with distinct style INSIDE the root — this wrapper is ONLY rendered when `destacar` is active. Movement rows: `testID={`movimiento-${tx.id}`}`. Reclassify trigger: no-op `Pressable` placeholder in PR3 (wired in PR4 T-14). `aFechaCorta(tx.fecha)` for date display.

**Commit**: `feat(mobile): GrupoMovimientosMobile accordion + SinCategoria destacado dual mechanics (D-04/D-19)`  
**Deps**: T-10  
**AC**: `pnpm --filter @moneydiary/mobile test -- GrupoMovimientosMobile` — 6 cases green.

**Result**: 6/6 green. Committed `098403d`. Patterns: imports must be at file top before component; `await act(async () => { fireEvent.press(...) })` for stateful toggle; commitlint rejects PascalCase subjects.

---

### T-12 ✅ (22536d5) — GREEN: BucketDetalleScreen + real bucket/[bucket].tsx route

**Design refs**: D-12, D-20  
**Spec refs**: MDET-01, MDET-02  
**Files** (CREATE + MODIFY):
- C3 `apps/mobile/src/components/detalle/BucketDetalleScreen.tsx` — header renders `ETIQUETA_BUCKET[viewModel.bucket]` (display label, NOT `viewModel.bucket` raw); `SelectorPeriodoMes`; usage bar; `porcentajeLabel` (null→`'—'` via `SIN_PORCENTAJE_LABEL`); `metaLabel` is always `'—'` when `metaBp` is null (web parity via `aPorcentajeLabel`); screen renders the 'Sin meta' display text from the `sinMeta` flag (D-22 MDET-02 — this is a screen-layer decision, not the VM's); `totalLabel`; `conteoLabel`. Screen-owned `anuncio` state: `const [anuncio, setAnuncio] = useState('')`; `<Text testID="status-reclasificar" accessibilityRole="alert" accessibilityLiveRegion="polite">{anuncio}</Text>` OUTSIDE the groups map (stable sibling). Period change clears `anuncio` via `useEffect([periodo])`. Note: passing `onReclasificado`/`onMovida` down to `GrupoMovimientosMobile` moved to T-15 (PR4) after the judgment gate removed the premature optional props from GrupoMovimientosMobile (us-044 PR7 banned-pattern); T-15 adds them as required props when the real trigger lands.
- C1 (replace stub) `apps/mobile/app/bucket/[bucket].tsx` — `useLocalSearchParams<{bucket?; destacar?; periodo?}>()`. State machine: `{ fase:'loading' } | { fase:'error'; error:ApiError } | { fase:'data'; dto:DetalleBucketMesDto }` — NO `empty` fourth tag (empty = `viewModel.grupos.length === 0`, derived INSIDE data tag). `cargar = useCallback([periodo])` → `fetchDetalleBucketMes(bucket, periodo)`. `useEffect([cargar])`. On-screen back `Pressable` `accessibilityLabel="Volver al resumen"`. **No `useFocusEffect`** for initial load (`categoria/[id].tsx:55-58` reasoning).

**Commit**: `feat(mobile): BucketDetalleScreen + real bucket/[bucket].tsx replacing PR1 stub (D-12/D-20)`  
**Deps**: T-11  
**AC**: `pnpm --filter @moneydiary/mobile test -- BucketDetalleScreen bucket` — all ~10 cases green. `tsc --noEmit` clean. MDET-01/02/03/04 gate green.

**Result**: 745/745 green (+17 from 728 baseline). Committed `22536d5`. BucketDetalleScreen owns fetch (not thin presenter — spec mocks fetchDetalleBucketMes at module boundary). Falsifiability: inverted destacado→2 fail; raw key header→Gustos pin fails. Key fix: `react-hooks/set-state-in-effect` disable comment needed for EACH setState() in useEffect body.

---

## PR4 — Reclassify control wired into M1 (~350 LOC, CA-04)

Branch off `main` after PR3 merges. Highest-effort PR. Gate: MDET-05 spec scenarios green.

### T-13 ✅ (2be46b2) — RED: ReclasificarMobileControl spec

**Design refs**: D-16, D-17, D-20  
**Spec refs**: MDET-05  
**Files** (CREATE):
- T-C12 `apps/mobile/src/components/detalle/ReclasificarMobileControl.spec.tsx` (~10 cases per design §5):
  - `"trigger Pressable testID='reclasificar-trigger-{id}' opens Modal"` — MDET-05 first scenario (unique testID per row)
  - `"Modal renders exactly 3 section headers: Necesidades, Gustos, Ahorro — no Otros"` — MDET-05 Modal structure; assert `BUCKETS_ASIGNABLES` filter dropped Otros/Ingresos
  - `"same-bucket selection commits without Alert.alert"` — MDET-05 second scenario (spy `Alert.alert`; count=0)
  - `"cross-bucket Alert.alert carries money-move body using ETIQUETA_BUCKET display labels on BOTH source and destination"` — MDET-05 third scenario; exact message `"Esto mueve $X de Gustos a Necesidades."` (trailing period; raw-key impl fails: `"de Deseos a Necesidades."`)
  - `"confirming cross-bucket fires reclasificarCategoria, then cargar (onReclasificado), then solicitarRecargaResumen"` — MDET-05 fourth scenario; all 3 spied
  - `"cross-bucket success calls onMovida with ETIQUETA_BUCKET display label (e.g. 'Gustos')"` — wiring pin; falsifies raw-key `'Deseos'`
  - `"AccessibilityInfo.announceForAccessibility called with 'Movida a Gustos.' ONLY after PATCH ok (settled)"` — MDET-05 announcement; spy on `AccessibilityInfo`; assert NOT called before PATCH resolves (settled-announcement, us-055 D-04 lesson)
  - `"failed PATCH does NOT call onReclasificado or solicitarRecargaResumen"` — MDET-05 ninth scenario (falsifies optimistic refresh)
  - `"cancelling cross-bucket Alert leaves UI unchanged — no API call"` — MDET-05 eighth scenario
  - `"Alert.alert guard (mostrandoAlerta ref) blocks double-open"` — us-044 guard

**Commit**: `test(mobile): RED ReclasificarMobileControl spec (D-16/D-17/D-20/MDET-05)`  
**Deps**: T-12  
**AC**: all ~10 cases fail RED (control absent). RED evidence recorded inline ✅.

---

### T-14 ✅ (aab463a) — GREEN: ReclasificarMobileControl component

**Design refs**: D-16, D-17  
**Spec refs**: MDET-05  
**Files** (CREATE):
- C5 `apps/mobile/src/components/detalle/ReclasificarMobileControl.tsx` — anatomy per D-17:
  1. **Trigger**: `Pressable testID={`reclasificar-trigger-${tx.id}`}` `accessibilityRole="button"` `accessibilityLabel={`Cambiar categoría de ${tx.descripcion}`}`.
  2. **Modal**: body = `ScrollView` of `BUCKETS_ASIGNABLES`-filtered `agruparPorBucket` sections. Section headers: `ETIQUETA_BUCKET[bucket]` display labels. Each categoria row `testID={`reclasificar-opcion-${categoria.nombre}`}`; current categoria marked (`accessibilityState={{ selected:true }}`). «Cancelar» closes with no mutation.
  3. **Selection logic**: derive `bucketNuevo`. Same bucket → `commit(nombre)` directly. Different bucket → `Alert.alert` with us-044 guard (`mostrandoAlerta = useRef(false)`, `{cancelable:false}`, cleared in EVERY `onPress`). Alert message: title `"Confirmar cambio de categoría"`; body `Esto mueve ${montoLabel} de ${ETIQUETA_BUCKET[bucketActual]} a ${ETIQUETA_BUCKET[bucketNuevo]}.` (trailing period).
  4. **`commit(nombre, bucketNuevo?)`**: call `reclasificarCategoria(tx.id, nombre)`. On `ok`: close modal → `onReclasificado()` → `solicitarRecargaResumen()` → if cross-bucket, call `onMovida(ETIQUETA_BUCKET[bucketNuevo])`. **The control NEVER calls `AccessibilityInfo` itself** — `onMovida` is the screen's handler. On `!ok`: `setErrorMensaje(mensajeDeErrorReclasificar(error))`.

**Commit**: `feat(mobile): ReclasificarMobileControl — Modal + Alert guard + settled announce (D-16/D-17)`  
**Deps**: T-13  
**AC**: `pnpm --filter @moneydiary/mobile test -- ReclasificarMobileControl` — ~10 cases green. `tsc --noEmit` clean.

---

### T-15 ✅ (fcd8dd8 + 0283eb7) — Wire reclassify trigger into GrupoMovimientosMobile + BucketDetalleScreen

**Design refs**: D-17, D-18, D-20  
**Spec refs**: MDET-05  
**Files** (MODIFY):
- C4 (modify) `apps/mobile/src/components/detalle/GrupoMovimientosMobile.tsx` — replace no-op trigger placeholder with real `<ReclasificarMobileControl>` per row. Accept and thread `onReclasificado` and `onMovida` props down to the control.
- C3 (modify) `apps/mobile/src/components/detalle/BucketDetalleScreen.tsx` — connect `onReclasificado={cargar}` and `onMovida` handler: `(bucketLabel) => { setAnuncio(`Movida a ${bucketLabel}.`); AccessibilityInfo.announceForAccessibility(`Movida a ${bucketLabel}.`); }`. Clears `anuncio` on `periodo` change via `useEffect([periodo])`.

**Commit**: `feat(mobile): wire ReclasificarMobileControl into GrupoMovimientosMobile + BucketDetalleScreen (D-17/D-18/D-20)`  
**Deps**: T-14  
**AC**: `pnpm --filter @moneydiary/mobile test -- BucketDetalleScreen GrupoMovimientosMobile ReclasificarMobileControl` — full test suite green. MDET-05 gate: announcement + refresh contract asserts pass. `tsc --noEmit` clean.

---

## PR5 — M2 ingresos screen (~300 LOC, CA-03)

Branch off `main` after PR4 merges. Replaces the PR1 stub for `ingresos.tsx`. Gate: MDET-06/07 green.

### T-16 — RED: IngresosMesScreen + ingresos route specs

**Design refs**: D-12, D-18 (focus guard), D-08 (read-only)  
**Spec refs**: MDET-06  
**Files** (CREATE):
- T-C13 `apps/mobile/src/components/detalle/IngresosMesScreen.spec.tsx` (~6 cases per design §5):
  - `"shows loading, error, empty, and data states (three-tag machine; empty = filas.length===0)"` — MDET-06 implicit (mirrors MDET-01 pattern)
  - `"header shows 'Ingresos' title, SelectorPeriodoMes with julio 2026, and formatted total $1.500.000"` — MDET-06 first scenario
  - `"each income row shows Origen badge text (Banco de Chile) verbatim"` — MDET-06 second scenario (no normalization)
  - `"no element with testID matching 'reclasificar-*' exists"` — MDET-06 third scenario (read-only contract)
  - `"pressing ‹ on SelectorPeriodoMes calls fetchIngresosMes with periodo='2026-06'"` — MDET-06 fourth scenario
  - `"useFocusEffect triggers cargar on focus (stale-guard)"` — D-18 M2 focus guard
- T-C15b `apps/mobile/app/ingresos.spec.tsx` (~3 cases from route machine suite):
  - `"useLocalSearchParams seeds periodo state from query param"`
  - `"periodo state steps on SelectorPeriodoMes arrow press → re-fetch fires"`
  - `"back Pressable calls router.back"`

**Commit**: `test(mobile): RED IngresosMesScreen + ingresos route specs (D-12/D-18/MDET-06)`  
**Deps**: T-15  
**AC**: all ~9 cases fail RED. RED evidence recorded inline ✅.

---

### T-17 — GREEN: IngresosMesLista + IngresosMesScreen + real ingresos.tsx route

**Design refs**: D-08, D-12, D-18  
**Spec refs**: MDET-06  
**Files** (CREATE + MODIFY):
- C7 `apps/mobile/src/components/detalle/IngresosMesLista.tsx` — read-only rows: `Fecha · Descripción · Origen · Monto`. `Origen` rendered as a small badge/`Text`. Row `testID={`ingreso-fila-${tx.id}`}`. `aFechaCorta(tx.fecha)` for date. NO reclassify trigger, NO mutation (D-08 / WDI-06 parity).
- C6 `apps/mobile/src/components/detalle/IngresosMesScreen.tsx` — header: `SelectorPeriodoMes`, title `"Ingresos"`, `conteoLabel`, `totalLabel` (`dto.total`), static note ("Sin meta ni semáforo"). Empty = `viewModel.filas.length === 0`. NO reclassify, NO refresh signal.
- C2 (replace stub) `apps/mobile/app/ingresos.tsx` — `useLocalSearchParams<{periodo?}>()`. Three-tag machine (`loading|error|data`). `cargar = useCallback([periodo])` → `fetchIngresosMes(periodo)`. `useEffect([cargar])`. **`useFocusEffect(useCallback(() => { cargar(); }, [cargar]))`** — the ONE `useFocusEffect` in this change; only for M2 stale-guard (D-18), NOT M1. On-screen back `Pressable`.

**Commit**: `feat(mobile): IngresosMesLista + IngresosMesScreen + real ingresos.tsx with focus guard (D-08/D-12/D-18)`  
**Deps**: T-16  
**AC**: `pnpm --filter @moneydiary/mobile test -- IngresosMesScreen ingresos` — ~9 cases green. `tsc --noEmit` clean. MDET-06/07 gate green.

---

### T-18 — DEFERRED TO ARCHIVE: living-spec delta (placeholder marker only)

**Design refs**: design §3 (spec impact)  
**Spec refs**: MDET-01..07 (new spec), MOB-08 delta  
**Files** (AT ARCHIVE TIME — do NOT touch during apply):
- `openspec/specs/mobile-detalle-mes/spec.md` (ADD new capability — from `changes/us-056-mobile-detalle-mes/specs/mobile-detalle-mes/spec.md`)
- `openspec/specs/mobile-resumen-screen/spec.md` (MODIFY MOB-08 — from `changes/us-056-mobile-detalle-mes/specs/mobile-resumen-screen/spec.md`)

**Note**: the living-spec delta is applied by the ARCHIVE phase, not during any code PR — this is the actual US-054/US-055 precedent (us-054's delta landed in archive PR #437; us-055's delta went to archive PR). The two delta files are fully authored in `openspec/changes/us-056-mobile-detalle-mes/specs/` and remain there until archive. Do NOT touch `openspec/specs/` during apply.

**Commit (archive-time)**: `docs(spec): merge MDET-01..07 new capability + MOB-08 delta into living specs`  
**Deps**: T-17 (last code commit; spec delta is the final action in the archive PR)  
**AC**: `openspec/specs/mobile-detalle-mes/spec.md` created; `openspec/specs/mobile-resumen-screen/spec.md` MOB-08 updated to reflect pressable rows.

---

## Scheduling

```
T-00 (docs PR) → merged to main → branch PR1

PR1 (sequential):
  T-01 RED legend → T-02 GREEN legend → T-03 stub routes
  PR1 merges → branch PR2

PR2 (sequential):
  T-04 RED all unit specs
  → T-05 GREEN period helpers
  → T-06 GREEN date-corta/porcentaje/types/error
  → T-07 GREEN view-models
  → T-08 GREEN fetchers + reclassify wrapper
  → T-09 GREEN SelectorPeriodoMes + spec
  PR2 merges → branch PR3

PR3 (sequential):
  T-10 RED BucketDetalleScreen + GrupoMovimientosMobile + route specs
  → T-11 GREEN GrupoMovimientosMobile accordion
  → T-12 GREEN BucketDetalleScreen + real bucket route
  PR3 merges → branch PR4

PR4 (sequential):
  T-13 RED ReclasificarMobileControl spec
  → T-14 GREEN ReclasificarMobileControl
  → T-15 wire reclassify into M1 screens
  PR4 merges → branch PR5

PR5 (sequential):
  T-16 RED IngresosMesScreen + ingresos route specs
  → T-17 GREEN IngresosMesLista + IngresosMesScreen + ingresos route
  → T-18 DEFERRED (archive-time placeholder)
  PR5 merges → ARCHIVE
```

Maestro-only (manual, not CI, ADR-017): native `Modal` present/dismiss animation; `announceForAccessibility` reaching a real screen reader (RNTL only spies the call); `ScrollView` scroll on a long picker list; back-gesture navigation; `useFocusEffect` triggering on actual screen re-focus.

---

## Ledger cross-check (design §4 file + §5 test ledgers)

### Production files

| File | Task | D-ref |
|------|------|-------|
| M1 `_layout.tsx` | T-03 | D-12 |
| M2 `LeyendaGasto.tsx` | T-02 | D-10/D-11/D-19 |
| M3 `ResumenScreen.tsx` | T-02 | D-10 |
| M4 `app/index.tsx` | T-02 | D-10 |
| M5 `api/client.ts` | T-08 | D-15 |
| M6 `api/categorias.ts` | T-08 | D-16 |
| M7 `domain/periodo-anual.ts` | T-05 | D-13 |
| M8 `domain/resumen-view-model.ts` | T-06 | D-14 |
| C1 `app/bucket/[bucket].tsx` | T-03 (stub) + T-12 (real) | D-12 |
| C2 `app/ingresos.tsx` | T-03 (stub) + T-17 (real) | D-12/D-18 |
| C3 `components/detalle/BucketDetalleScreen.tsx` | T-12, T-15 | D-12/D-20 |
| C4 `components/detalle/GrupoMovimientosMobile.tsx` | T-11, T-15 | D-04/D-19 |
| C5 `components/detalle/ReclasificarMobileControl.tsx` | T-14 | D-16/D-17/D-20 |
| C6 `components/detalle/IngresosMesScreen.tsx` | T-17 | D-12 |
| C7 `components/detalle/IngresosMesLista.tsx` | T-17 | D-08 |
| C8 `components/SelectorPeriodoMes.tsx` | T-09 | D-13 |
| C9 `domain/detalle-bucket-mes-view-model.ts` | T-07 | D-22 |
| C10 `domain/ingresos-mes-view-model.ts` | T-07 | D-22 |
| C11 `domain/fecha-corta.ts` | T-06 | D-14 |
| C12 `domain/porcentaje.ts` | T-06 | D-14 |
| C13 `domain/detalle.types.ts` | T-06 | D-15/D-16 |
| C14 `domain/mensajes-reclasificar.ts` | T-06 | D-21 |

### Test files

| File | Task | Asserts |
|------|------|---------|
| T-C1 `detalle-bucket-mes-view-model.spec.ts` | T-04 (RED) / T-07 (GREEN) | ~10 |
| T-C2 `ingresos-mes-view-model.spec.ts` | T-04 (RED) / T-07 (GREEN) | ~8 |
| T-C3 `fecha-corta.spec.ts` | T-04 (RED) / T-06 (GREEN) | ~2 |
| T-C4 `porcentaje.spec.ts` | T-04 (RED) / T-06 (GREEN) | ~3 |
| T-C5 `mensajes-reclasificar.spec.ts` | T-04 (RED) / T-06 (GREEN) | ~6 |
| T-C6 `periodo-anual.spec.ts` (new cases) | T-04 (RED) / T-05 (GREEN) | ~6 |
| T-C7 `detalle-fetchers.spec.ts` | T-04 (RED) / T-08 (GREEN) | ~14 |
| T-C8 `reclasificar.spec.ts` | T-04 (RED) / T-08 (GREEN) | ~5 |
| T-C9 `SelectorPeriodoMes.spec.tsx` | T-09 (RED+GREEN together) | ~6 |
| T-C10 `BucketDetalleScreen.spec.tsx` | T-10 (RED) / T-12+T-15 (GREEN) | ~7+1 |
| T-C11 `GrupoMovimientosMobile.spec.tsx` | T-10 (RED) / T-11+T-15 (GREEN) | ~6 |
| T-C12 `ReclasificarMobileControl.spec.tsx` | T-13 (RED) / T-14+T-15 (GREEN) | ~10 |
| T-C13 `IngresosMesScreen.spec.tsx` | T-16 (RED) / T-17 (GREEN) | ~6 |
| T-C14 `LeyendaGasto.spec.tsx` (extend) | T-01 (RED) / T-02 (GREEN) | ~5 |
| T-C15 `bucket/[bucket].spec.tsx` + `ingresos.spec.tsx` | T-10+T-16 (RED) / T-12+T-17 (GREEN) | ~6 |

**Total: ~100 asserts / 15 test files** (54 unit + 46 component). Requirements traced: MDET-01 (T-10/T-12); MDET-02 (T-10/T-12); MDET-03 (T-10/T-11/T-15); MDET-04 (T-09); MDET-05 (T-13/T-14/T-15); MDET-06 (T-16/T-17); MDET-07 (T-04/T-06/T-07); MOB-08 (T-01/T-02).

### Case-law constraints verified

- **Falsifiability on ETIQUETA_BUCKET label**: T-10 MDET-02 header pin (`'Gustos'` not `'Deseos'`); T-13 Alert message pin; T-13 `onMovida` label pin; T-13 announcement string `'Movida a Gustos.'` with period.
- **Raw key in VM / label at component layer**: T-04/T-07 assert `result.bucket === "Deseos"` (no `etiquetaBucket` field).
- **Settled announcement (us-055 D-04 lesson)**: T-13 asserts `announceForAccessibility` is NOT called until PATCH settles ok.
- **failed-PATCH does not trigger refresh contract**: T-13 explicitly asserted.
- **Alert guard (us-044)**: T-13 double-open guard case; T-14 `{cancelable:false}`, cleared in every `onPress`.
- **Control never calls AccessibilityInfo**: T-14 — `onMovida` is screen-owned; T-15 wires the screen handler.
- **Status region outlives the moved row**: T-10 `'status-reclasificar'` ancestry assertion (region is NOT inside any group element).
- **testID uniqueness on repeated rows**: T-01/T-10/T-11 — unique per-bucket testIDs for legend; `grupo-movimientos-${id}`, `movimiento-${id}`, `reclasificar-trigger-${id}` (design D-19).
- **SinCategoria destacado dual mechanics**: T-10 cases 5+6 assert root AND inner testIDs independently (design D-19 / MDET-03).
- **`onNavegar` non-optional prop**: T-01 mechanical — compile fails without it (no `?` default).
- **Mensajes reclassify injects real error shape (no `code` field)**: T-04/T-06 — body absent on 400/404 per `types.gen.ts:1754-1766`.
- **T-00 docs PR separate, before code PRs**: US-054/US-055 precedent.
- **M7 docstring update obligation**: T-05 — any "web-only" or "out of scope for mobile" claim in `periodo-anual.ts` is updated (D-13 truthful-comments rule).
- **LeyendaGasto docstring update**: T-02 — the inert-row "non-interactive" docstring (`:6-16`) is updated to reflect pressability (D-11).
