# Tasks: US-049 — Semáforo Detail Page

> Ordered implementation checklist for `design.md` (2-round adversarial judgment:
> APPROVED — decisions are NOT reopened here). Strict TDD is active (backend
> runner: Vitest/Oxc; web runner: Vitest/jsdom + Playwright). Order follows
> design §0/§5: **domain bands → domain arithmetic → domain copy+assembly →
> application → infrastructure+contract → web data layer → web UI → closing.**
> Backend lands first and stays dark (no consumer) until the web slice —
> the US-045 cross-workspace lesson applies at Phase 5: DTO, Zod schema,
> `openapi-document.ts`, route, `container.ts`, regenerated `openapi.json` +
> `types.gen.ts` + `api-client` alias + web type re-export land in ONE PR.
>
> Legend: `[P]` = parallel-safe with sibling `[P]` tasks (no file overlap).
> Unmarked tasks are sequential.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2 590 across 7 slices (design §5, real per-slice estimates below) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 bands → PR2a arithmetic → PR2b copy/assembly → PR3 use case → PR4 HTTP+contract → PR5 web data → PR6 web UI |
| Delivery strategy | ask-on-risk (session default) |
| Chain strategy | **fork — see "Chain Strategy Fork" below; user decides at the gate** |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (decided at the apply gate — 3 size:exceptions approved for PR2a/PR4/PR6; backend PRs 1-4 ship dark)
400-line budget risk: High
```

### Real per-PR line estimates (design §5, unedited)

| PR | Slice | Files | Tests | Est. lines | Over 400? |
|---|---|---|---|---|---|
| 1 | Bands on the table | `estado-semaforo.ts` + spec | +5 (39 must stay green) | ~130 | No |
| 2a | CLP-to-Verde arithmetic | `semaforo-detalle.ts` (helpers + `montoParaVerde`) + spec groups A/B/C | 81 | ~550 | **Yes** |
| 2b | Copy + assembly | `semaforo-detalle.ts` (diagnóstico, mensajes, `construirSemaforoDetalle`) + spec groups D/E/F/G | 21 | ~280 | No |
| 3 | Use case | `obtener-semaforo-detalle.use-case.ts` + spec | 6 | ~180 | No |
| 4 | HTTP + contract chain | DTO, Zod schema, `openapi-document.ts`, route, `container.ts`, `openapi.json`, `types.gen.ts`, `api-client/src/index.ts`, `web/src/api/types.ts` + 4 suites | 13 | ~600 | **Yes** (mostly generated) |
| 5 | Web data layer | `client.ts` (+guard), `use-semaforo-detalle.ts`, `porcentaje.ts`, `semaforo-detalle-view-model.ts` + specs | 25 | ~380 | No |
| 6 | Web UI | `ZonaBar`, `BucketSemaforoCard`, `SemaforoDetallePage`, `semaforo.tsx`, `eslint.config.js`, route test, e2e + fixture | 23 | ~470 | **Yes** |

Three of seven slices exceed the 400-line budget (2a and 6 by test volume, 4 by
generated artifacts that carry low review-judgment density despite the line
count). `size:exception` is the realistic outcome for PR 2a, 4, and 6
regardless of chain strategy — chaining controls WHEN reviewers see each
slice, not whether those three individually clear 400 lines.

### Chain Strategy Fork — the user decides

Two options exist for this change; they answer different questions.

**Option A — `feature-branch-chain`** (design's own §5 suggestion)
- PR #1 targets a tracker branch; PR #2..#6 each target the immediate
  previous PR's branch; only the tracker merges to `main`.
- Rationale in the design: "PRs 4–6 are only meaningful together (the
  endpoint has no consumer until PR 6)" — reviewers never see a
  half-integrated feature on `main`.
- Tradeoff for THIS change: the new domain/use case/HTTP surface (PRs 1–4)
  stays invisible on `main` until the tracker merges — safer for
  coordinated review, but delays any incremental value (e.g. someone
  wanting `GET /api/resumen/semaforo` live for manual QA before the web
  page exists) and means 6 sequential review rounds gate one merge event.

**Option B — `stacked-to-main`** (this session's convention default)
- Each PR merges to `main` independently, in order.
- Tradeoff for THIS change: backend slices 1–4 ship "dark" — additive,
  zero consumers, zero behavior change to `/api/resumen` or any existing
  route (confirmed by design §4's impact sweep: `calcularEstadoBucket`
  signature unchanged, `Container` interface addition is a no-op for
  every existing `app.*.spec.ts` fake). This is the same shape as every
  prior backend-first US in this repo (US-045, US-047, US-048) — each
  landed independently on `main` before its consumer. Faster iteration,
  each slice individually revertible without touching the others (per
  the proposal's Rollback Plan: "revert the PR(s)... partial rollback
  (web only) leaves an unused endpoint — harmless").

**Recommendation: Option B (`stacked-to-main`).** The design's own
rationale for feature-branch-chain ("PRs 4–6 are only meaningful together")
describes review COHERENCE, not deploy safety — and this repo's own Rollback
Plan (proposal.md) already states a dark, unconsumed endpoint is harmless on
`main`. Six sequential feature-branch rounds gating one tracker merge is a
heavier coordination cost than the risk being mitigated, especially given
the precedent (US-045/047/048 all stacked backend-first slices to `main`
successfully in this exact repo). If the user weighs review coherence over
iteration speed for this specific change, Option A is the documented
fallback — `sdd-apply` must not proceed until this choice is made.

---

## Phase 0 — Pre-flight

- [ ] **T0.1** Confirm local integration DB is up (needed for Phase 5's
      `app.resumen-semaforo.spec.ts` + `resumen-semaforo.e2e-spec.ts`):
      `pnpm api db:up && pnpm api test:db:setup` (ADR-028/029 pre-existing
      constraint).
      - Verify: both commands exit 0.
- [ ] **T0.2** Confirm Strict TDD Mode active for this session (test runner:
      `pnpm api test` / `pnpm web test`, per `sdd-init/moneydiary`); every
      RED task below MUST fail before its paired GREEN task.

---

## Phase 1 — Domain: `BANDAS_SEMAFORO` table (`estado-semaforo.ts`) [PR 1]

Requirements: SEM-02, D-02. Gate (design §1.1): **the 39 existing tests in
`estado-semaforo.spec.ts` must pass byte-unchanged** — if any needs editing,
revert and export a duplicated table instead.

- [x] **T1.1 (RED)** In
      `apps/api/src/domain/value-objects/estado-semaforo.spec.ts`, append
      the 5 new cases (do not touch the 39 existing ones):
      `BANDAS_SEMAFORO` has exactly 3 entries; per-bucket values match the 8
      documented constants (3 cases, one per bucket); `TARGETS_503020[b]*100
      === Number(BANDAS_SEMAFORO[b].metaBp)` for the 3 buckets.
      - Verify (expect RED — symbols don't exist yet):
        `pnpm api test estado-semaforo.spec.ts`
      - **Note (ledger discrepancy, recorded not silently patched):** the
        actual pre-existing suite has **33** `it` blocks, not 39 (verified
        via `pnpm api test estado-semaforo.spec.ts` on `origin/main` before
        any edit: `33 passed (33)`). The gate itself — pre-existing tests
        pass byte-unchanged — is unaffected; only the ledger's count is
        stale. Flagged for T8.2's reconciliation.
- [x] **T1.2 (GREEN)** In
      `apps/api/src/domain/value-objects/estado-semaforo.ts`, add
      `BandasBucket` interface + frozen `BANDAS_SEMAFORO` table (design
      §1.1's exact literal values) + `estadoDesdeBandas(bp, b)` +
      table-driven `calcularEstadoBucket`, replacing `estadoUnilateral`/
      `estadoAhorro`. Walk the equivalence table (design §1.1) case by case
      while writing this — it is the acceptance proof.
      - Verify: `pnpm api test estado-semaforo.spec.ts` — all **38** cases
        (33 pre-existing + 5 new) green, and `git diff origin/main` shows
        the spec file diff is a pure append (+53/-0) — the 33 pre-existing
        `it` blocks untouched (no assertion text changed).
- [x] **T1.3 (REFACTOR)** Confirm `estadoUnilateral`/`estadoAhorro` are
      fully removed (0 references); `calcularEstadoBucket`'s exported
      signature is unchanged (design §4 impact sweep: 1 production call
      site at `resumen-mes.ts:139`, unaffected).
      - Verify: `pnpm api exec tsc --noEmit`; `pnpm api test resumen-mes.spec.ts` (regression — `calcularEstadoBucket`'s only consumer).

---

## Phase 2 — Domain: CLP-to-Verde arithmetic (`semaforo-detalle.ts`, groups A/B/C) [PR 2a]

Requirements: SEM-03, SEM-04, SEM-07, D-04, D-09, D-11. Depends on Phase 1
(`BANDAS_SEMAFORO`). Highest-risk slice (R1, High severity) — 81 test cases.

- [x] **T2.1 (RED)** Create
      `apps/api/src/domain/value-objects/semaforo-detalle.spec.ts` with
      **group A** (17 cases, `montoMaximoConBpHasta`): the worked example
      `base=1_000_000n, bpMax=5000n → 500_049n`; `it.each` over the 8 bases
      `[1n, 2n, 3n, 7n, 10_000n, 999_999n, 1_000_000n, 1_234_567n]` asserting
      `bp(f(base)) ≤ bpMax` (8) and minimality `bp(f(base)+1n) > bpMax` (8).
      `[P]` with T2.2 (independent describe blocks, same file — commit
      together).
      - Verify (expect RED — module doesn't exist): `pnpm api test semaforo-detalle.spec.ts`
      - **Note (visibility discrepancy, recorded not silently patched):**
        design §1.2's public surface lists only `construirSemaforoDetalle`,
        `montoParaVerde`, `diagnosticar` as exported, and T3.7 (Phase 3)
        targets "helpers private". Groups A/B test `montoMaximoConBpHasta`/
        `montoMinimoConBpDesde` by direct import, which requires them
        exported NOW. Resolved pragmatically: both are `export function` in
        this PR; flagged for T3.7 to reconcile (keep exported, or migrate
        A/B to test exclusively through `montoParaVerde`).
- [x] **T2.2 (RED)** Same file, **group B** (17 cases,
      `montoMinimoConBpDesde`): worked example `base=1_000_000n, bpMin=2000n
      → 199_950n`; same 8-base `it.each` for `bp(f(base)) ≥ bpMin` (8) and
      minimality `bp(f(base)-1n) < bpMin` (8). `[P]` with T2.1.
- [x] **T2.3 (GREEN)** In
      `apps/api/src/domain/value-objects/semaforo-detalle.ts` (new file),
      implement `montoMaximoConBpHasta` and `montoMinimoConBpDesde` exactly
      per design §1.3's derivations (BigInt-only, no float).
      - Verify: `pnpm api test semaforo-detalle.spec.ts -t "montoMaximoConBpHasta|montoMinimoConBpDesde"` — 34 green.
- [x] **T2.4 (RED)** Add **group C** (47 cases, `montoParaVerde`) per
      design §3's ledger breakdown: Verde→null for Necesidades/Ahorro (2);
      exact `{direccion, monto}` for Necesidades/Deseos Amarillo/Rojo (4);
      Ahorro at bp 1500/500 → `{aumentar}` (2), bp 4500/6000 → `{reducir}`
      (2); SinCategoria/Ingreso → null (2); `base===0n` → null (1);
      pathological `base=1n` Ahorro → null via the D-11 guard (1); **R1
      re-apply, unilateral**: 8 bases × 2 buckets, total forced to
      `tMax+1`, assert re-applying the returned advice yields Verde (16);
      **R1 re-apply, Ahorro low**: 8 bases (8); **R1 re-apply, Ahorro
      high**: 8 bases (8); "non-Verde with realistic income always gets
      advice" — one `it.each` over 4 bases × 3 scenarios (1 test block, 12
      internal assertions).
      - Verify (expect RED): `pnpm api test semaforo-detalle.spec.ts -t montoParaVerde`
      - **Note (hand-verified degrade, recorded):** for the shared 8-base
        `Ahorro` re-apply groups (low/high), bases `1n` and `2n` provably
        degrade to `null` via the D-11 guard (band width 2000bp is smaller
        than the per-peso bp jump at those bases — verified by hand:
        `bp(objetivo,1n)=10000`, `bp(objetivo,2n)=5000`, both outside
        `[2000,4000]`). Implemented as explicit per-base expectations
        (`null` for 1n/2n, non-null + Verde re-apply for the other 6), not
        a blanket "always non-null" assumption — this is the honest,
        provable behavior of the D-11 fail-closed guard, consistent with
        item 14's own pathological-base test. Also: the "always gets
        advice" case was written as ONE `it()` with an internal `for` loop
        over the 4 bases (not `it.each`) to match the ledger's own table
        convention (1 block, not 4 vitest tests) — actual suite count is
        **81/81**, matching design §3 exactly.
- [x] **T2.5 (GREEN)** Implement `montoParaVerde(bucket, total, base)` per
      design §1.3's exact body: unilateral case (a), Ahorro-low case (b),
      Ahorro-high case (c), the D-11 runtime post-condition re-check before
      returning. Leave `mensajeConsejo(...)` as a stub returning `''` for
      now (Phase 3 implements it) so this compiles without pulling in copy.
      - Verify: `pnpm api test semaforo-detalle.spec.ts` — groups A/B/C (81) green.
- [x] **T2.6 (REFACTOR)** Confirm the D-11 post-condition guard is
      unconditional (not short-circuited for case (a) alone) and that no
      float arithmetic exists anywhere in the file (`grep -n '\.5\|Math\.'`
      returns nothing relevant).
      - Verify: `pnpm api exec tsc --noEmit`; full re-run of T2.4's suite.

---

## Phase 3 — Domain: copy + assembly (`semaforo-detalle.ts`, groups D/E/F/G) [PR 2b]

Requirements: SEM-01, SEM-05, SEM-06, SEM-10, D-05, D-07, D-08, D-10. Depends
on Phase 2 (`montoParaVerde` exists; this phase wires it into
`construirSemaforoDetalle` and replaces the `mensajeConsejo` stub).

- [x] **T3.1 (RED)** Add **group D** (9 cases, `diagnosticar`) to
      `semaforo-detalle.spec.ts`: D1 on `estadoGlobal===null` (1); D2 all
      Verde (1); one driving bucket → `'Tu mes está en rojo por
      Necesidades.'` (1); Deseos driving → uses `'Gustos'` **(the
      cross-workspace copy pin — see T3.2)** (1); two-way tie → `'…
      Necesidades y Gustos.'` (1); three-way → `'… Necesidades, Gustos y
      Ahorro.'` (1); Rojo+Amarillo → names only the Rojo (1); order fixed
      regardless of input array order (1); never contains `{monto}` (1).
      - Verify (expect RED): `pnpm api test semaforo-detalle.spec.ts -t diagnosticar`
      - **Note (order-independence test, adapted):** `ResumenMes.crear()` always
        assembles its `buckets` array in a fixed internal order (no public API
        shuffles it), so "order fixed regardless of input array order" is
        implemented as a tied-subset variant (Necesidades + Ahorro tied,
        skipping Deseos) rather than a literal array-reorder — it proves the
        listing order comes from the fixed product order, not from array
        position, which is the property the task actually protects.
- [x] **T3.2 (RED) — "Gustos" cross-workspace copy pin** Add **group E** (1
      case): `ETIQUETA_BUCKET_COPY[Bucket.Deseos] === 'Gustos'` exact-value
      assertion (design's own copy-drift residual risk: `bucket-colors.ts`
      in `apps/web` and this new domain map can diverge with no automated
      cross-workspace gate — this test is the backend half of that pin).
      `[P]` with T3.1 (same file, disjoint describe blocks).
      - Verify: same command as T3.1, `-t "ETIQUETA_BUCKET_COPY"`.
- [x] **T3.3 (RED)** Add **group F** (4 cases, `mensajeConsejo`): `'excede'`
      exact template (1); `'ahorro-bajo'` exact (1); `'ahorro-alto'` exact
      (1); every case contains `{monto}` exactly once (1) — pin the D1/D2/D3
      diagnosis literals and A1/A2 advice templates verbatim from design
      §1.4 (tuteo, D-08; the ceiling-semantics A2 wording, D-08b).
- [x] **T3.4 (RED)** Add **group G** (7 cases, `construirSemaforoDetalle`):
      exactly 3 buckets fixed order (1); `bandas` carried per bucket (1);
      `metaBp` 5000/3000/2000 (1); `bucketsCriticos` `[]` when Verde (1);
      `bucketsCriticos` names the drivers (1); `sinCategoria`
      `{cantidad,total}` carried from `ResumenMes` (1); `sinIngreso` → all
      `consejo` null, all estados null, `diagnostico`=D1 (1).
      - Verify (expect RED, T3.1–T3.4 combined): `pnpm api test semaforo-detalle.spec.ts` — 102 total cases (Phase 2's 81 + this phase's 21) green only after T3.5.
      - Verified: 21 new cases RED before T3.5 (`construirSemaforoDetalle is
        not a function`), 81 pre-existing green.
- [x] **T3.5 (GREEN)** Implement `ETIQUETA_BUCKET_COPY`, `PALABRA_ESTADO`,
      `VERBO`, `diagnosticar(resumen)`, real `mensajeConsejo(bucket, caso,
      direccion)` (replacing T2.5's stub), and `construirSemaforoDetalle
      (resumen)` per design §1.2/§1.4 verbatim (the 15 pinned string
      literals: D1–D3, A1–A2, 3 labels, 3 estado words, 2 verbs, 2
      joiners). Add the cross-reference comment in this file pointing at
      `apps/web/src/lib/bucket-colors.ts` for the "Gustos" duplication
      (design's residual-risk note).
      - Verify: `pnpm api test semaforo-detalle.spec.ts` — full 102 cases green.
      - Verified: 102/102 green.
- [x] **T3.6** Add the matching cross-reference comment in
      `apps/web/src/lib/bucket-colors.ts` (the web side of the copy pin —
      no code change, comment only, pointing back at
      `semaforo-detalle.ts`'s `ETIQUETA_BUCKET_COPY`).
- [x] **T3.7 (REFACTOR)** Re-read `semaforo-detalle.ts` end to end: confirm
      it imports only `bucket.ts`, `estado-semaforo.ts`, `resumen-mes.ts`
      (ADR-005 — no infrastructure import), never throws, and the module's
      full public surface matches design §1.2 exactly (`construirSemaforo
      Detalle`, `montoParaVerde`, `diagnosticar` exported; helpers private).
      - Verify: `pnpm api exec tsc --noEmit`; `pnpm api test semaforo-detalle.spec.ts` full 102 green.
      - **Resolution (documented deviation, not silently applied):** imports
        confirmed limited to `bucket.ts`/`estado-semaforo.ts`/`resumen-mes.ts`
        (ADR-005 clean); the module never throws (verified by re-read, no
        `throw` statement anywhere in the file). Public surface DOES NOT match
        design §1.2 exactly: `montoMaximoConBpHasta`, `montoMinimoConBpDesde`,
        and `ETIQUETA_BUCKET_COPY` stay exported instead of becoming private.
        Rationale: (1) `montoMaximoConBpHasta`/`montoMinimoConBpDesde` are
        pinned by 34 already-merged (PR2a, `main`) boundary/minimality tests
        by direct import — making them private would require deleting those
        tests with no equivalent-precision replacement (Group C's re-apply
        tests prove correctness of the composed result, not strict minimality
        of the raw inverse formulas); (2) `ETIQUETA_BUCKET_COPY` stays
        exported as a DELIBERATE (but avoidable) choice for direct
        unit-testability of the label map in isolation from the diagnosis
        sentence — judgment-day round 1 noted the original "required by
        T3.2" framing was circular (T3.2 was authored in the same PR); the
        "Gustos" wording is independently pinned via `diagnosticar`'s Group D
        assertions, so the export is a testing convenience, not a hard
        constraint. Judgment-day also hardened the internal types: a
        3-member-union type predicate (`esBucketSemaforo`) now narrows at
        compile time so copy helpers can never render "undefined". No
        external module imports any of these three symbols — the export is a
        testability surface, not a new consumer-facing API. `tsc --noEmit`
        clean; `pnpm api test semaforo-detalle.spec.ts` 102/102 green.

---

## Phase 4 — Application: `ObtenerSemaforoDetalleUseCase` [PR 3]

Requirements: SEM-01, SEM-06, SEM-08, SEM-09, ADR-013/033 (log scrubbing).
Depends on Phase 3 (`construirSemaforoDetalle` exists).

- [x] **T4.1 (RED)** Create
      `apps/api/src/application/use-cases/obtener-semaforo-detalle.use-case.spec.ts`
      with the 6 cases from design §3's ledger: periodo absent →
      `PeriodoMes.actual()` (1); periodo válido → reader receives it (1);
      periodo inválido → `Result.fail(PeriodoInvalidoError)`, reader NOT
      called (1); mes sin ingresos → `Result.ok` with `sinIngreso: true` —
      a valid 200, not an error, mirroring `/api/resumen`'s SC-04 (1);
      `userId` flows verbatim to the reader (1); `logger.debug` receives
      counts only (`rows.length`, `periodo`, `estadoGlobal`,
      `bucketsCriticos.length`) — never montos, never the diagnosis
      sentence (1).
      - Verify (expect RED): `pnpm api test obtener-semaforo-detalle.use-case.spec.ts`
- [x] **T4.2 (GREEN)** Create
      `apps/api/src/application/use-cases/obtener-semaforo-detalle.use-case.ts`
      mirroring `CalcularResumenMesUseCase` step for step (design §1.5):
      reuses `IResumenMesReader` + `construirResumenMesDesdeFilas`;
      `PeriodoInvalidoError` is the ONLY error case; never throws; never
      imports infrastructure.
      - Verify: `pnpm api test obtener-semaforo-detalle.use-case.spec.ts` green.
- [x] **T4.3 (REFACTOR)** Confirm the use case does not duplicate any query
      — same `IResumenMesReader.sumarPorBucket` call shape as
      `CalcularResumenMesUseCase` (D-01 — no second query path).
      - Verify: `pnpm api exec tsc --noEmit`.
      - Verified: `ObtenerSemaforoDetalleUseCase.execute` calls
        `this.reader.sumarPorBucket(input.userId, periodoVO)` — the exact same
        single call shape as `CalcularResumenMesUseCase`, both feeding
        `construirResumenMesDesdeFilas`. No second query path introduced.
        `tsc --noEmit` clean.

---

## Phase 5 — Infrastructure + contract chain [PR 4]

Requirements: SEM-02, SEM-07, SEM-08, SEM-09, ISO-01, ISO-02, D-01, D-12,
ADR-011/012. Depends on Phase 4. **Sequential and blocking** — Phase 6/7
consume the regenerated contract.

### 5.1 DTO + Zod schema + OpenAPI

- [x] **T5.1 (RED)** Create
      `apps/api/src/infrastructure/http/dto/semaforo-detalle.dto.spec.ts`
      (5 cases): BigInt→string for `totalIngreso`/`consejo.monto`/
      `sinCategoria.total` (1); bp/meta/band edges → JS numbers (1);
      estados → lowercase wire via `aWire()` (1); `consejo: null` stays
      `null` (1); `bandas.verdeMin: null` preserved for unilateral buckets
      (1). `[P]` with T5.3 (different files).
      - Verify (expect RED): `pnpm api test semaforo-detalle.dto.spec.ts`
- [x] **T5.2 (GREEN)** Create
      `apps/api/src/infrastructure/http/dto/semaforo-detalle.dto.ts`
      (`SemaforoDetalleDto` + `aSemaforoDetalleDto(...)`) per design §1.6 —
      note `aWire()` is duplicated here (3 lines), NOT extracted from
      `resumen-mes.dto.ts` (design's explicit kiss.md call).
      - Verify: `pnpm api test semaforo-detalle.dto.spec.ts` green.
- [x] **T5.3 (RED)** Create
      `apps/api/src/infrastructure/http-express/schemas/semaforo-detalle.schema.spec.ts`
      (2 cases): a real `aSemaforoDetalleDto(...)` output parses against
      `semaforoDetalleResponseSchema` (sync guarantee, per
      `resumen.schema.spec.ts`) (1); schema rejects `consejo.monto` sent as
      a JSON number, not a string (1 — the money-guard-at-the-boundary
      lesson). `[P]` with T5.1.
      - Verify (expect RED): `pnpm api test semaforo-detalle.schema.spec.ts`
- [x] **T5.4 (GREEN)** Create
      `apps/api/src/infrastructure/http-express/schemas/semaforo-detalle.schema.ts`:
      `semaforoDetalleQuerySchema = { periodo: z.string().optional() }` +
      `semaforoDetalleResponseSchema` with `.meta({ id:
      'SemaforoDetalleResponse' })`.
      - Verify: `pnpm api test semaforo-detalle.schema.spec.ts` green.
- [x] **T5.5 (RED)** Extend
      `apps/api/src/infrastructure/http-express/schemas/openapi-document.spec.ts`
      (+1 case): registers `GET /api/resumen/semaforo` with a `periodo`
      query param and a 200 response schema.
      - Verify (expect RED): `pnpm api test openapi-document.spec.ts`
- [x] **T5.6 (GREEN)** In `openapi-document.ts`, add
      `semaforoDetalleOperation` and **append** (never reorder, per the
      file's own instruction at line ~1043) `'/api/resumen/semaforo': {
      get: semaforoDetalleOperation }`.
      - Verify: `pnpm api test openapi-document.spec.ts` green.

### 5.2 Route + container wiring

- [x] **T5.7 (RED)** Create
      `apps/api/src/infrastructure/http-express/app.resumen-semaforo.spec.ts`
      (5 cases, per `app.buckets.spec.ts`): 401 sin `x-api-key` (1); 401 con
      api-key sin sesión (1); 200 con ambos + **el `userId` de la sesión
      fluye al use case** (RNF-SEC-006/ISO-01) (1); 400 scrubbed en
      `PeriodoInvalidoError` (1); el body 200 real cumple
      `semaforoDetalleResponseSchema` (1).
      - Verify (expect RED): `pnpm api test app.resumen-semaforo.spec.ts`
- [x] **T5.8 (GREEN)** Add `registrarResumenSemaforo(router,
      obtenerSemaforoDetalle)` to
      `apps/api/src/infrastructure/http-express/routes/resumen.routes.ts`
      as a third `router.get`, same Result→HTTP translation (400 scrubbed,
      `next(err)` unexpected) as the existing two routes. Add
      `obtenerSemaforoDetalle: ObtenerSemaforoDetalleUseCase` to the
      `Container` interface and wire it in
      `apps/api/src/composition/container.ts` with **a second `new
      PrismaResumenMesRepository(prisma)` instance** (D-12 — no `crear-*`
      helper, matches the file's one-`new`-per-use-case style).
      - Verify: `pnpm api test app.resumen-semaforo.spec.ts` green; confirm the 11 existing `app.*.spec.ts` fakes still compile untouched (design §4 — `as unknown as Container` casts absorb the new optional-in-practice field).
- [x] **T5.9 (Function-call-site sweep)** `calcularEstadoBucket`'s signature
      is unchanged (Phase 1) and `Container` gained an additive field only
      — confirm via `tsc` that zero other call sites needed edits.
      - Verify: `pnpm api exec tsc --noEmit`.

### 5.3 Contract regeneration (D-01, ADR-011/012)

- [x] **T5.10** Run `pnpm contract:sync` (`pnpm api openapi:emit && pnpm
      api-client generate`) from the repo root. Commit `apps/api/openapi.json`
      and `packages/api-client/src/types.gen.ts` together with the schema
      change from 5.1–5.6 — a partial commit fails CI.
      - Verify: `pnpm api openapi:check` exits 0.
      - Verify: `git diff --exit-code packages/api-client/src/types.gen.ts` after re-running `pnpm api-client generate` (must be a no-op the second time).
- [x] **T5.11** Add `export type SemaforoDetalleDto = S['SemaforoDetalleResponse'];`
      (+ a `SemaforoBucketDetalleDto` indexed alias) to
      `packages/api-client/src/index.ts`, and re-export from
      `apps/web/src/api/types.ts` — **same PR, per the US-045 lesson**
      (`pnpm web typecheck` breaks on `main` otherwise).
      - Verify: `pnpm api-client exec tsc --noEmit`; `pnpm web typecheck`.

### 5.4 Isolation + e2e (ISO-01/ISO-02)

- [x] **T5.12 (RED)** Create
      `apps/api/test/resumen-semaforo.e2e-spec.ts` (5 cases, per
      `resumen.e2e-spec.ts`): sin `periodo` → 200 con el periodo UTC
      actual (1); `?periodo=not-a-date` → 400 scrubbed (1); DTO shape — 3
      buckets, `bandas` presentes, `diagnostico` no vacío (1); mes vacío →
      `sinIngreso: true`, todos los `consejo: null`, `diagnostico`=D1 (1);
      **aislamiento de dos usuarios** — datos del otro usuario no aparecen,
      per `app.buckets.spec.ts`'s two-user precedent (1).
      - Verify (expect RED, `ALLOW_DESTRUCTIVE_DB=1`): `pnpm api test:e2e resumen-semaforo.e2e-spec.ts`
- [x] **T5.13 (GREEN)** No production code expected beyond 5.1–5.11 — if
      T5.12 fails after those land, that is a signal one of those phases
      has a gap; do not patch around it here.
      - Verify: `pnpm api test:e2e resumen-semaforo.e2e-spec.ts` green.
- [x] **T5.14** Update the ISO-01/ISO-02 spec's canonical merge target
      staleness note is tracked in Phase 8 (archive step), not here — this
      task only confirms the delta's own scenarios (already written in
      T5.12) exercise both cookie and Bearer transport per ISO-01/ISO-02's
      "for both clients" requirement; if the e2e harness only covers
      cookie transport, extend T5.12 with a Bearer-session variant before
      marking this phase done.
      - Verify: `pnpm api test:e2e resumen-semaforo.e2e-spec.ts -t Bearer` (or confirm existing coverage is transport-agnostic by reading the shared test harness).

### 5.5 Backend gate sweep

- [x] **T5.15** Full backend verification: `pnpm api test` (unit) · `pnpm
      api test:integration` (`ALLOW_DESTRUCTIVE_DB=1`) · `pnpm api
      test:e2e` (`ALLOW_DESTRUCTIVE_DB=1`) · `pnpm api exec tsc --noEmit` ·
      `pnpm api openapi:check` · `pnpm api lint:ci`.

---

## Phase 6 — Web data layer [PR 5]

Requirements: WSEM-07 (data resolution), SEM-10 (client-side `{monto}`
substitution point), the WG5-05 money-guard lesson. Depends on Phase 5
(regenerated `types.gen.ts`/`api-client`/`web/src/api/types.ts`).

- [ ] **T6.1 (RED)** Extend `apps/web/src/api/client.test.ts` (+11 cases):
      `fetchSemaforoDetalle` 200 ok (1); 400→`invalid` (1); 401→
      `unauthorized` (1); 5xx→`server` (1); fetch rejection→`network` (1);
      non-JSON body→`parse` (1); **`consejo.monto: "12.5"` →`parse`**
      (money guard, WG5-05 lesson) (1); missing/non-string `diagnostico`→
      `parse` (1); non-array `buckets`→`parse` (1); malformed
      `sinCategoria.total`→`parse` (1); `periodo` URL-encoded into the
      query (1).
      - Verify (expect RED): `pnpm web test client.test.ts`
- [ ] **T6.2 (GREEN)** In `apps/web/src/api/client.ts`, add
      `fetchSemaforoDetalle(periodo?)` (same never-throw `ApiResult<T>`
      shape as `fetchResumen`) and `esSemaforoDetalleDto` — the DTO guard
      validating exactly what flows into money/render code: `totalIngreso`
      + `sinCategoria.total` via `esMontoStringValido`; `diagnostico` is a
      string; each `buckets[]` entry has `porcentajeBp: number|null`,
      `estadoSemaforo: string|null`, `metaBp: number`, a `bandas` object
      (`verdeMax`/`amarilloMax` numbers, `verdeMin`/`amarilloMin`
      `number|null`), and `consejo === null` **or** `{direccion, mensaje}`
      strings + `monto` passing `esMontoStringValido`.
      - Verify: `pnpm web test client.test.ts` — 11 new + existing green.
- [ ] **T6.3 (RED)** Create `apps/web/src/api/use-semaforo-detalle.test.ts`
      (2 cases): `queryKey` is `['semaforo-detalle', periodo ?? 'actual']`
      (1); a typed `ApiError` surfaces as the query error (1). `[P]` with
      T6.5.
      - Verify (expect RED): `pnpm web test use-semaforo-detalle.test.ts`
- [ ] **T6.4 (GREEN)** Create `apps/web/src/api/use-semaforo-detalle.ts`,
      verbatim `use-resumen.ts` shape.
      - Verify: `pnpm web test use-semaforo-detalle.test.ts` green.
- [ ] **T6.5 (RED, extraction)** Before writing the view-model, extract
      `aPorcentajeLabel` (currently private, `resumen-view-model.ts:101-106`)
      into a new `apps/web/src/domain/porcentaje.ts` alongside
      `SIN_PORCENTAJE_LABEL` (currently exported at line 19). Add a
      re-export of `SIN_PORCENTAJE_LABEL` from `resumen-view-model.ts` so
      its existing importers/tests are untouched — confirm with a
      regression run before adding any new test.
      - Verify (regression, no new test needed — pure move): `pnpm web test resumen-view-model.test.ts` still green.
- [ ] **T6.6 (RED)** Create
      `apps/web/src/domain/semaforo-detalle-view-model.test.ts` (12 cases):
      `{monto}` substituted with the formatted amount (1); no raw `{monto}`
      survives (1); a mensaje without the placeholder renders verbatim,
      defensive (1); `porcentajeLabel` via the shared `aPorcentajeLabel`
      helper (1); `consejo: null`→no advice row (1); marker position `=
      bp/100` (1); `bp > 10000` clamps to 100 (1); unilateral bands start
      at 0 (1); Ahorro→5 ordered contiguous segments (1); unilateral→3
      segments (1); widths sum to exactly 100 (1); `Meta: 50%` derived
      from `metaBp` (1). `[P]` with T6.3.
      - Verify (expect RED): `pnpm web test semaforo-detalle-view-model.test.ts`
- [ ] **T6.7 (GREEN)** Create
      `apps/web/src/domain/semaforo-detalle-view-model.ts` per design §1.7:
      `SegmentoZona` type, the pure mapping + zone-bar geometry
      (`0..10000bp → 0..100%`, unilateral 3 segments, Ahorro 5 segments,
      contiguous, widths sum to 100) — **every edge read from `bandas` on
      the wire, no threshold literal in this file** (R2 mitigation).
      - Verify: `pnpm web test semaforo-detalle-view-model.test.ts` — 12 green.
- [ ] **T6.8 (REFACTOR)** Confirm no threshold literal (`5000`, `6000`,
      `3000`, `4000`, `2000`, `1000` as classification constants) exists
      anywhere in `apps/web/src/domain/semaforo-detalle-view-model.ts`.
      - Verify: `rg "5000|6000|3000|4000|2000|1000" apps/web/src/domain/semaforo-detalle-view-model.ts` returns nothing outside comments/geometry math unrelated to bp thresholds; `pnpm web typecheck`.

---

## Phase 7 — Web UI [PR 6]

Requirements: WSEM-01..08, CA-01..08. Depends on Phase 6.

- [ ] **T7.1 (RED)** Create `apps/web/src/components/ZonaBar.test.tsx` (5
      cases): the coloured track is `aria-hidden` (1); bp/band edges/estado
      present as accessible text (1); each segment has a text label — never
      colour alone (1); the marker renders at the computed position (1);
      `porcentajeBp: null`→"Sin datos", no marker (1).
      - Verify (expect RED): `pnpm web test ZonaBar.test.tsx`
- [ ] **T7.2 (GREEN)** Create `apps/web/src/components/ZonaBar.tsx` per
      design §1.7's a11y contract (ADR-018, WCAG 2.2 AA): track+marker
      `aria-hidden="true"`; accessible content is real text nodes
      (percentage, estado word via `resolverEstiloSemaforo(...).label`,
      each band's numeric range); no `role="img"` synthesized sentence.
      - Verify: `pnpm web test ZonaBar.test.tsx` — 5 green.
- [ ] **T7.3 (RED)** Create
      `apps/web/src/components/SemaforoDetallePage.test.tsx` (14 cases, per
      design §3 ledger): loading→`Loading` (1); error→`ErrorState`+retry
      (1); header shows month+badge+diagnosis literal, CA-01/02 (1);
      worst-of-3 explainer present, CA-03 (1); three bucket cards with %
      vs meta and estado, CA-04 (1); Amarillo/Rojo card shows advice with
      formatted amount, CA-05 (1); Verde card shows no advice (1); Ahorro
      low shows "aumenta" framing (1); Ahorro high shows informational
      framing (1); Sin categoría notice shows count+total and links to
      `/buckets/SinCategoria` carrying `periodo`, CA-06 (1); `sinIngreso`→
      explanation, no empty percentages, CA-07 (1); header badge is the
      static `SemaforoBadge` (`role="img"`, not a link), D-06 (1); **no
      hardcoded threshold literal** — band edges come from the fixture,
      changing the fixture changes the render, R2 (1); exactly one `h1`
      (1). `[P]` with T7.1.
      - Verify (expect RED): `pnpm web test SemaforoDetallePage.test.tsx`
- [ ] **T7.4 (GREEN)** Create `apps/web/src/components/BucketSemaforoCard.tsx`
      (label from existing `ETIQUETA_BUCKET`, `porcentajeLabel`,
      `Meta: {metaBp/100}%`, estado badge, `ZonaBar`, advice line when
      `consejo !== null` with arrow icon from `direccion`, `lucide-react`
      per ADR-027) and `apps/web/src/components/SemaforoDetallePage.tsx`
      composing: header (`<h1>Semáforo</h1>`, month via `mesCompletoLabel`,
      static `SemaforoBadge` — D-06 adoption, closes #382 — verbatim
      `diagnostico`), the CA-03 explainer literal, 3 `BucketSemaforoCard`s,
      Sin categoría notice with `<Link to="/buckets/$bucket" params={{
      bucket: 'SinCategoria' }} search={{ periodo }}>`, and the `sinIngreso`
      branch (D1 + `<Empty>`, never renders cards with `—`).
      - Verify: `pnpm web test SemaforoDetallePage.test.tsx ZonaBar.test.tsx` — 19 green.
- [ ] **T7.5 (RED→GREEN, CA-08 fix)** In
      `apps/web/src/test/semaforo-route.test.tsx`: rewrite the existing
      "en construcción" case to assert the real page renders instead
      (replaces 1 case, does not add one); add "Volver al resumen"
      preserves `periodo` (1 new); add a deep link `?periodo=2026-07`
      reaches the hook with that period (1 new). Leave the
      unauthenticated-redirect case untouched.
      - Verify (expect RED before the fix): `pnpm web test semaforo-route.test.tsx`
- [ ] **T7.6 (GREEN)** In
      `apps/web/src/routes/_authenticated/semaforo.tsx`, replace the stub
      with the thin container from design §1.7 (`Route.useSearch()` →
      `useSemaforoDetalle(periodo)` → `<SemaforoDetallePage query periodo
      />`); `validateSearch` unchanged. Move the "Volver al resumen"
      `<Link to="/" search={{ periodo }}>` fix into `SemaforoDetallePage`
      (testable without a router harness) — the route-tree test (T7.5)
      covers the real-router assertion.
      - Verify: `pnpm web test semaforo-route.test.tsx` — 3 cases (1 rewritten + 2 new) green; unauthenticated-redirect case unchanged.
- [ ] **T7.7** Extend `apps/web/eslint.config.js`'s US-047 scoped-ERROR
      FILE-LIST block (same form, same rationale) to also cover
      `src/components/SemaforoDetallePage.tsx`,
      `src/components/BucketSemaforoCard.tsx`,
      `src/components/ZonaBar.tsx`.
      - Verify: `pnpm web lint:ci`.
- [ ] **T7.8 (Playwright, per design's own scenario labels)** Extend
      `apps/web/e2e/fixtures/api-stubs.ts` with `SEMAFORO_DETALLE_FIXTURE`
      + `page.route('**/api/resumen/semaforo*')`. Create
      `apps/web/e2e/semaforo-detalle.e2e.ts` (2 cases): deep link
      `/semaforo?periodo=2026-07` renders header + 3 cards + zone bar at a
      real viewport (1); "Volver al resumen" navigates to `/` keeping
      `?periodo=2026-07` (1). Confirm no route-ordering hazard against the
      existing `**/api/resumen*` stub (Playwright's `*` does not cross
      `/`, same precedent as `/api/resumen/anual`).
      - Verify: `pnpm web e2e semaforo-detalle.e2e.ts`.
- [ ] **T7.9 (Function-call-site sweep)** `SIN_PORCENTAJE_LABEL`'s
      re-export (T6.5) and `ETIQUETA_BUCKET`'s reuse (T7.4) are the only
      cross-file dependents of this phase's new code — confirm both
      existing consumers of `resumen-view-model.ts`'s exports still
      compile untouched.
      - Verify: `pnpm web typecheck`.
- [ ] **T7.10** Full web verification: `pnpm web test` (unit/jsdom) ·
      `pnpm web typecheck` · `pnpm web lint:ci` · `pnpm web build`.

---

## Phase 8 — Closing tasks

Depends on all prior phases landing (on `main`, per whichever chain strategy
the user selects — see forecast above).

- [ ] **T8.1** Post the issue **#382** closure comment: `SemaforoBadge`
      adopted as the static header badge in `SemaforoDetallePage.tsx`
      (T7.4) — link the PR that ships WSEM-01. Close #382.
- [ ] **T8.2 (Ledger reconciliation)** Confirm the actual test count
      matches design §3's ledger: 131 backend (5+102+6+5+2+1+5+5 per suite)
      + 48 web (11+2+12+5+14+2+2) = 179 new cases, plus 39 backend +
      unchanged and 1 web case rewritten (not net-new). If any suite's
      actual count diverges, note the delta here before archiving — do not
      silently let the ledger go stale.
      - **Correction (judgment-day round 1 finding, PR4):** two ledger
        deltas recorded here rather than silently patched:
        1. `semaforo-detalle.schema.spec.ts` grows from 3 to **4** `it`
           blocks file-level (the `semaforoDetalleResponseSchema` describe
           specifically: 2 → 3) — the new case is the D-11 combo:
           `estadoSemaforo=amarillo` AND `consejo=null` parses — the
           nullable holds for the fail-closed degenerate case, not just
           Verde. `semaforo-detalle.dto.spec.ts` grows from **5 to 7**
           cases (git-history-verified — judgment round 2 corrected this
           note's own first version, which mis-stated 4→6): the same D-11
           combo, plus an explicit SEM-10 mensaje passthrough assert of
           the literal `{monto}` template string.
        2. `resumen-semaforo.e2e-spec.ts`'s two ISO-01/ISO-02 isolation
           cases (T5.12 item 5) were rewritten in place — same case count,
           much stronger assertions. T5.12's note "per
           `app.buckets.spec.ts`'s two-user precedent" was the WRONG
           precedent to cite: that pattern only asserts
           totalIngreso/bucket-total inequalities and a near-tautological
           `not.toContain(alienUserId)`. The apply batch's implicit claim
           that no stronger two-user e2e pattern existed in this repo was
           **incorrect** — `resumen-anual.e2e-spec.ts`'s CA-08 test
           (authenticate AS a fresh credentialed user, assert EXACT values
           computed from a fully known seed) already shipped that stronger
           idiom. Both isolation cases now follow CA-08 instead: login as a
           fresh user with a known income/bucket-state/uncategorized-count,
           seed a second alien user with a DIFFERENT known state, and assert
           exact `diagnostico`/`bucketsCriticos`/`consejo`/`sinCategoria`
           values on the authenticated user's response only.
- [ ] **T8.3 (Spec Purpose-prose reminders for archive — do NOT skip)**
      When this change archives:
      - `openspec/specs/user-data-isolation/spec.md` Purpose section: "4
        data-bearing endpoints" → "5 data-bearing endpoints", listing
        `resumen/semaforo` alongside `resumen`, `movimientos`,
        `detalle-bucket`, `ingesta` (delta's own migration note — the
        delta cannot MODIFY prose directly, only the merge step can).
      - `openspec/specs/web-app/spec.md` ~line 1440, the
        `WG5-07`/`WG5-08`/`WG5-09` cross-reference summary row: the
        `/semaforo` stub mention becomes stale once `WG5-09` is removed
        and `WSEM-01..08` ship — replace it with a reference to the
        shipped `WSEM-*` page, or split the row so `WG5-07`/`WG5-08` keep
        their own text and the `WG5-09` stub clause drops.
      - This is NOT satisfied by merging the requirement blocks alone —
        both prose updates are separate edits the archive step must make.
- [ ] **T8.4** Final full-repo gate sweep: `pnpm test` (all workspaces) ·
      `pnpm build` (all workspaces) · `pnpm api-client exec tsc --noEmit` ·
      confirm `apps/mobile` has zero references to any new semáforo symbol
      (design §4 — zero mobile impact, out of scope) · confirm no Prisma
      migration was introduced.
