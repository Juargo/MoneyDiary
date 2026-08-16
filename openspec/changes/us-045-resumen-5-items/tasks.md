# Tasks: US-045 — resumen mensual, 3 → 5 items

> Ordered implementation checklist for `design.md` (2-round adversarial judgment:
> APPROVED — design decisions are NOT reopened here). Strict TDD is active for
> this repo (backend runner: Vitest, Oxc transformer). Order follows the
> data-flow slicing the design specifies in §6.9: **port + domain → assembly →
> repositories (monthly, then annual) → DTO + schema → contract regen → client
> fixtures.**
>
> Legend: `[P]` = can run in parallel with sibling `[P]` tasks in the same
> phase (no file overlap). Unmarked tasks are sequential — they depend on the
> immediately preceding task(s) in the list.

---

## Phase 0 — Pre-flight checkpoints

- [ ] **T0.1** Confirm local integration DB is up before Phase 3/4/8/9 tasks
      run (`pnpm api db:up && pnpm api test:db:setup`, per
      `apps/api/docs/local-test-db.md` — ADR-028/029 pre-existing constraint,
      not new to this change).
      - Verify: `pnpm api db:up` exits 0, `pnpm api test:db:setup` exits 0.

---

## Phase 1 — Domain VO (`resumen-mes.ts`)

Requirements: RES-02, RES-03, RES-04, RES-06, D-04, D-08, D-09. No dependency
on any other phase — this is the innermost layer (ADR-005).

- [x] **T1.1 (RED)** Add failing unit cases to
      `apps/api/test/unit/domain/value-objects/resumen-mes.spec.ts` per
      design §6.3:
      - count carried verbatim (`crear({..., cantidadSinCategoria: 7})` →
        `.cantidadSinCategoria === 7`)
      - default zero → field present, not `undefined`
      - **0-income, count > 0 (D-08 degenerate case)**: `totalIngreso: 0n`,
        `sinCategoria: 90_000n`, `cantidadSinCategoria: 7` → `sinIngreso ===
        true`, `SinCategoria.porcentajeBp === null`,
        `cantidadSinCategoria === 7` (income-independent — the count must
        NOT be nulled alongside the percentage)
      - count does not perturb `estadoGlobal` or any per-slice
        `estadoSemaforo` (D-09 regression guard: two `ResumenMes` identical
        but for the count → identical semáforo output)
      - existing round-half-up `.5`-remainder case still rounds up (guard
        against float creeping in)
      - type-level ISP guard: `expectTypeOf<keyof BucketSlice>()
        .not.toMatchTypeOf<'cantidadCargos'>()` (D-04 — `BucketSlice` must
        never gain a count)
      - Verify (expect RED): `pnpm api test resumen-mes.spec.ts`
- [x] **T1.2 (GREEN)** Add `cantidadSinCategoria: number` (required, not
      optional — see D-04's `tsc`-forcing rationale) to `ResumenMesInput` and
      to the `ResumenMes` class in
      `apps/api/src/domain/value-objects/resumen-mes.ts`. Carry the value
      verbatim, no computation. **`BucketSlice` stays untouched** — do not
      add a count field there.
      - Verify: `pnpm api test resumen-mes.spec.ts` all green.
- [x] **T1.3 (REFACTOR)** Confirm no duplication introduced; `tsc` clean for
      this file in isolation.
      - Verify: `pnpm api exec tsc --noEmit`

---

## Phase 2 — Application layer: ports + assembly

Requirements: RES-02, D-04, D-07. Depends on Phase 1 (assembly constructs the
VO input).

- [x] **T2.1 (RED)** Add `cantidadCargos: number` (required) to
      `BucketSumRow` in
      `apps/api/src/application/ports/resumen-mes.port.ts`, with a doc
      comment stating the cargos-only rule (D-05): *"count of rows with
      `cargo > 0` in this bucket — never abono rows"*. This is a type-only
      change; it will fail `tsc` at every construction site until Phase 3/4
      wire it — that is the intended forcing function (D-04). `[P]` with
      T2.2 (different file).
      - Verify (expect RED, pre-existing test fixtures now fail to compile):
        `pnpm api exec tsc --noEmit`
- [x] **T2.2 (RED)** Add the same `cantidadCargos: number` field to
      `BucketSumRowAnual` in
      `apps/api/src/application/ports/resumen-anual.port.ts` — this
      preserves structural assignability to `BucketSumRow` so
      `CalcularResumenAnualUseCase` keeps compiling against the shared
      assembly (D-07, integration point #2 in design §4). `[P]` with T2.1.
      - Verify: same `tsc --noEmit` run as T2.1 (both files needed together
        before the compiler is satisfied).
- [x] **T2.3 (RED)** Add failing unit cases in
      `apps/api/test/unit/application/use-cases/calcular-resumen-mes.use-case.spec.ts`
      and `calcular-resumen-anual.use-case.spec.ts`: fake readers now return
      `cantidadCargos` on every row; assert the resulting VO carries
      `cantidadSinCategoria` through. **No destructuring change** — the
      use-case result shape (`{ periodo, resumen }` / `{ anio, resumenAnual
      }`) stays as-is.
      - Verify (expect RED): `pnpm api test calcular-resumen-mes.use-case.spec.ts calcular-resumen-anual.use-case.spec.ts`
- [x] **T2.4 (GREEN)** In
      `apps/api/src/application/use-cases/resumen-mes-assembly.ts`
      (`construirResumenMesDesdeFilas`), read
      `rowMap.get(Bucket.SinCategoria)?.cantidadCargos ?? 0` and pass it into
      `ResumenMesInput.cantidadSinCategoria`. Shared by both the monthly and
      annual use cases (proposal's Med-risk item — annual breaks if this
      assembly isn't additive-only).
      - Verify: `pnpm api test calcular-resumen-mes.use-case.spec.ts calcular-resumen-anual.use-case.spec.ts` green; `pnpm api exec tsc --noEmit` clean.
- [x] **T2.5 (REFACTOR)** Re-read `construirResumenMesDesdeFilas` for
      duplication with the existing `totalCargo`/`totalAbono` narrowing
      pattern — none expected, this follows the same shape.
      - Verify: `pnpm api test` (full unit suite) green.

---

## Phase 3 — Infrastructure: `prisma-resumen-mes.repository.ts` (highest risk)

Requirements: RES-02, RES-03, RNF-SEC-006 (ISO-02), D-05. Depends on Phase 2
(port shape). This is where R-1 and R-2 (both **High** severity in design §7)
live — treat the mitigations below as non-negotiable, not optional polish.

- [x] **T3.1 (RED)** Extend
      `apps/api/test/integration/persistence/prisma-resumen-mes.repository.spec.ts`
      with the new/extended scenarios from design §6.6 (all require
      `pnpm api test:integration`, gated by `ALLOW_DESTRUCTIVE_DB=1` per
      db-safety):
      - **SC-03 extended (HIGHEST RISK, R-1)**: seed 1 null-bucket cargo row
        **and** 1 explicit `SinCategoria` cargo row → assert
        `cantidadCargos === 2` **and** `totalCargo === 200_000n`. This is the
        "counts must ADD, never overwrite" proof — the same fold rule the
        sums already prove, now applied to counts.
      - **SC-10 NEW — cargos-only guard (R-2, THE test that catches the
        worst implementation mistake)**: seed an uncategorized **abono** row
        (`bucketId: null, cargo: 0n, abono: 50_000n`) alongside an
        uncategorized cargo row. Assert `cantidadCargos === 1` (abono not
        counted) **AND** `SinCategoria.totalAbono === 50_000n` — this second
        assert is what proves the `cargo: { gt: 0 }` filter on the count
        query did NOT leak into the sums query and corrupt `totalAbono` (the
        income base for the whole 50/30/20 calculation).
      - SC-01 extended: per-bucket counts match seeded cargo rows for
        Necesidades/Deseos/Ahorro/SinCategoria; `Ingreso.cantidadCargos ===
        0` (its rows are abonos, never cargos).
      - SC-05 extended: empty month → all 5 buckets return `cantidadCargos
        === 0`.
      - **SC-09 extended (RNF-SEC-006 / ISO-02, mandatory)**: seed user B's
        uncategorized cargos in the same period; querying as A returns
        **only A's** `cantidadCargos` — follow the existing SC-09 shape
        exactly (seed both, query as A, assert A's number, assert it is NOT
        the A+B sum).
      - Verify (expect RED): `pnpm api test:integration prisma-resumen-mes.repository.spec.ts`
- [x] **T3.2 (GREEN — extract)** Extract `resolverBucket` from its current
      inline expression into a single private/module-level helper in
      `prisma-resumen-mes.repository.ts` (design D-05):
      `null → Bucket.SinCategoria`; unrecognized non-null id →
      `Bucket.SinCategoria` (defensive). Both the existing sums fold and the
      new count fold MUST call this one function — this is the structural
      mitigation for R-1 (SC-03).
      - Verify: `pnpm api test:integration prisma-resumen-mes.repository.spec.ts -t SC-03` still green (no regression from the extraction alone, pre-second-query).
- [x] **T3.3 (GREEN — the shared `where`, R-2 mitigation)** Build the base
      `where` object (`{ account: { userId }, fecha: { gte, lt } }`) **once**
      and reuse it via spread for both queries:
      `{ ...where, cargo: { gt: 0 } }` for the count query only. Do **not**
      add `cargo: { gt: 0 }` to the sums query's `where` — this is the exact
      corruption path R-2 flags. Add a code comment at the shared `where`
      declaration stating both queries must reuse it, never diverge on user
      isolation or period bounds.
- [x] **T3.4 (GREEN — second scoped `groupBy`)** Add the second
      `prisma.transaccion.groupBy({ by: ['bucketId'], where: {...where,
      cargo: { gt: 0 } }, _count: { _all: true } })`, batched with the
      existing sums `groupBy` inside `this.prisma.$transaction([...])` (array
      form — one snapshot for both queries).
      - **Checkpoint (open assumption, design §7 "Assumptions to validate
        during apply")**: confirm `prisma.$transaction([groupBy, groupBy])`
        types cleanly under Prisma 7 with `@prisma/adapter-pg`. If `tsc`
        rejects the array-form typing, fall back to `Promise.all([...])` and
        add a code comment documenting why (the correctness cost is a
        same-user concurrent-ingest inconsistency window, not a correctness
        invariant — acceptable per D-05).
      - Verify: `pnpm api exec tsc --noEmit` clean either way.
- [x] **T3.5 (GREEN — fold)** Extend the accumulator (pre-seeded with all 5
      buckets at zero, per SC-05) to carry `cantidadCargos`, fed by
      `resolverBucket(g.bucketId)` for both loops, using the
      add-shape `accum.set(bucket, { ...current, X: current.X + delta })`
      — never an overwrite/assignment. Return `cantidadCargos` on every
      `BucketSumRow`.
      - Verify: `pnpm api test:integration prisma-resumen-mes.repository.spec.ts` — ALL scenarios from T3.1 green, including SC-03 extended and SC-10.
- [x] **T3.6 (REFACTOR)** Re-read the method for the "one `where`, reused"
      invariant and the "one `resolverBucket`, reused" invariant — both
      should be visually obvious from the diff, not just true by
      coincidence.
      - Verify: `pnpm api test:integration prisma-resumen-mes.repository.spec.ts` green; `pnpm api exec tsc --noEmit` clean.

---

## Phase 4 — Infrastructure: `prisma-resumen-anual.repository.ts`

Requirements: D-07 (annual field parity, NOT annual aggregation — out of
scope, US-046). Depends on Phase 2 (port shape). Independent of Phase 3's
runtime code (different repository, different query strategy — in-memory
reduce over an existing `findMany`, zero new queries) — `[P]` with Phase 3
at the task-planning level, but sequenced after here for reading clarity.

- [x] **T4.1 (RED)** Extend
      `apps/api/test/integration/persistence/prisma-resumen-anual.repository.spec.ts`
      — expected row objects gain `cantidadCargos`; add a case proving the
      in-memory reduce increments it correctly (`cargo > 0n → +1`,
      pre-seeded at `0`).
      - Verify (expect RED): `pnpm api test:integration prisma-resumen-anual.repository.spec.ts`
- [x] **T4.2 (GREEN)** Inside the existing `for (const t of transacciones)`
      reduce, add:
      `cantidadCargos: current.cantidadCargos + (t.cargo > 0n ? 1 : 0)`.
      No new query — this is a 3-token addition to code that already exists.
      - Verify: `pnpm api test:integration prisma-resumen-anual.repository.spec.ts` green.
- [x] **T4.3 (REFACTOR)** Confirm the annual repository still issues exactly
      one `findMany` (no query count regression).
      - Verify: `pnpm api exec tsc --noEmit` clean.

---

## Phase 5 — HTTP DTO (`resumen-mes.dto.ts`)

Requirements: RES-04, D-01, D-02. Depends on Phase 1 (VO) + Phase 2
(assembly wiring the value in).

- [x] **T5.1 (RED)** Add failing unit cases to
      `apps/api/test/unit/infrastructure/http/dto/resumen-mes.dto.spec.ts`
      per design §6.4:
      - `cantidadSinCategoria` is always present as a key, even when `0`
        (mirrors the existing `'estadoGlobal' in dto'` key-presence
        invariant test).
      - it is a JS `number`, never a string.
      - it equals the VO value.
      - `BucketResumenDto` entries still have exactly the 4 known keys (no
        drift into the buckets array — D-02's ISP boundary).
      - Verify (expect RED): `pnpm api test resumen-mes.dto.spec.ts`
- [x] **T5.2 (GREEN)** Add `ResumenMesDto.cantidadSinCategoria: number` and
      one mapper line (`cantidadSinCategoria:
      resumen.cantidadSinCategoria`) in
      `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts`.
      **`BucketResumenDto` stays untouched.**
      - Verify: `pnpm api test resumen-mes.dto.spec.ts` green.

---

## Phase 6 — Zod schema (`resumen.schema.ts`)

Requirements: RES-04, RES-06, D-06. Depends on Phase 5 (DTO shape the schema
mirrors).

- [x] **T6.1 (RED)** Add failing cases to
      `apps/api/test/unit/infrastructure/http-express/schemas/resumen.schema.spec.ts`
      per design §6.5:
      - rejects a payload where `cantidadSinCategoria` is a string
      - rejects a payload missing `cantidadSinCategoria` (proves required —
        D-06)
      - accepts `0`
      - Verify (expect RED): `pnpm api test resumen.schema.spec.ts`
- [x] **T6.2 (GREEN)** Add `cantidadSinCategoria: z.number().int()
      .nonnegative().describe(...)` to `resumenResponseSchema` in
      `apps/api/src/infrastructure/http-express/schemas/resumen.schema.ts`.
      - **Checkpoint (open assumption, design §5 schema-authoring note)**:
        run `pnpm api openapi:emit` and inspect the rendered property. If
        `.nonnegative()` does not render deterministically through the
        repo's `renderOpenApiJson`, drop to plain `.int()` — the constraint
        is documentation, not a runtime validation the server needs.
      - The existing "sync guarantee" tests (which parse the real
        `aResumenMesDto` output) now cover the happy path automatically once
        the mapper emits the field — no separate happy-path test needed.
      - Verify: `pnpm api test resumen.schema.spec.ts` green; existing sync-guarantee tests still green.
- [x] **T6.3 (RED→GREEN)** Extend the `makeResumen` test helper (or
      equivalent local fixture builder) used across `resumen-mes.spec.ts` /
      `resumen.schema.spec.ts` to default `cantidadSinCategoria` — fixes the
      remaining compiler-forced call sites listed in design §6.1 in one
      place rather than at each call site.
      - Verify: `pnpm api test` (full unit suite) green; `pnpm api exec tsc --noEmit` clean for `apps/api`.
- [x] **T6.4 (D-09 guard)** Confirm (do not edit — verification only) that
      `estado-semaforo.ts` needed zero changes: run its existing spec suite
      untouched and confirm the Phase 1 regression case (T1.1) passes.
      - Verify: `pnpm api test estado-semaforo.spec.ts`

---

## Phase 7 — Contract regeneration

Requirements: D-06, ADR-011, ADR-012. Depends on Phase 6 (schema is the
source of truth). **Sequential and blocking** — Phase 8/9/10/11 all consume
the regenerated artifacts.

- [x] **T7.1** Run `pnpm contract:sync` (== `pnpm api openapi:emit && pnpm
      api-client generate`) from the repo root. Commit
      `apps/api/openapi.json` and `packages/api-client/src/types.gen.ts`
      together with the schema change from Phase 6 — design §5 states these
      files "MUST be committed together; a partial commit fails CI."
      - Verify: `pnpm api openapi:check` (drift gate) exits 0.
      - Verify: `git diff --exit-code packages/api-client/src/types.gen.ts` after re-running `pnpm api-client generate` (client-type-drift gate — must be a no-op the second time).
- [x] **T7.2** Confirm `ResumenMesResponse` gained the property + a
      `required` entry, and that `ResumenAnualResponse` (`meses[]`) picked
      it up via its existing `$ref` to `ResumenMesResponse` (D-07's wire
      consequence) — spot check `openapi.json` by eye, no new test needed
      (this is generated, not authored).

---

## Phase 8 — HTTP-level isolation test (ISO-02)

Requirements: RNF-SEC-006, ISO-02 (spec delta at
`specs/user-data-isolation/spec.md`). Depends on Phase 7 (the field must
exist on the wire to assert on it at HTTP level).

- [x] **T8.1 (RED)** Extend the existing `GET /api/resumen` isolation test
      in `apps/api/test/integration/.../auth-isolation.int-spec.ts` (around
      the existing `res.body.totalIngreso` / bucket-total assertions) with
      `expect(res.body.cantidadSinCategoria).toBe(<A's count>)` — proves
      isolation at the endpoint boundary, not just the repository (Phase 3's
      SC-09 covers the repository; this covers the HTTP seam on top of it).
      - Verify (expect RED until Phase 3+7 land): `pnpm api test:integration auth-isolation.int-spec.ts`
- [x] **T8.2 (GREEN)** No production code change expected here — Phase 3
      (repository isolation) + Phase 5/6/7 (field on the wire) should make
      this pass without further edits. If it does not pass, that is a signal
      one of those phases has a gap — do not patch around it here.
      - Verify: `pnpm api test:integration auth-isolation.int-spec.ts` green.

---

## Phase 9 — E2E tests (`resumen.e2e-spec.ts`, `resumen-anual.e2e-spec.ts`)

Requirements: RES-02, RES-04, D-07, CA-01. Depends on Phase 7 (full stack
wired end to end). `[P]` between T9.1/T9.2 (monthly) and T9.3 (annual) —
different files.

- [x] **T9.1 (RED→GREEN)** Extend the SC-01 DTO-shape test (design §6.8,
      `resumen.e2e-spec.ts`) with
      `expect(typeof res.body.cantidadSinCategoria).toBe('number')`. `[P]`
- [x] **T9.2 (RED→GREEN)** Extend the empty-month test (which already
      asserts `totalIngreso === '0'`) with
      `expect(res.body.cantidadSinCategoria).toBe(0)` — this doubles as the
      CA-01 "Ingresos always present, 0 when empty" evidence (D-01). `[P]`
      with T9.1.
      - Verify (both): `pnpm api test:e2e resumen.e2e-spec.ts`
- [x] **T9.3 (RED→GREEN)** Extend `resumen-anual.e2e-spec.ts` per design
      §6.8b (D-07 coverage):
      - **DTO shape test**: seed at least one uncategorized cargo row in a
        known month FIRST — do not rely on the shared `loginAsSeededUser`
        fixture containing one for the current UTC year, per the design's
        explicit warning. Then add
        `expect(mes.cantidadSinCategoria).toBeGreaterThan(0)` for that
        month.
      - **CA-08 isolation test**: seed at least one uncategorized cargo row
        for user A distinct from user B's, add
        `expect(resA.body.meses[<march index>].cantidadSinCategoria).toBe(<A's count>)`
        — proves annual-endpoint isolation for the new field, not just
        `totalIngreso`/bucket totals.
      - Verify: `pnpm api test:e2e resumen-anual.e2e-spec.ts`

---

## Phase 10 — Full backend gate sweep

Sequential checkpoint before touching clients — confirms the backend is
fully green in isolation before the required-field churn propagates
outward.

- [ ] **T10.1** Full backend verification:
      - `pnpm api test` (unit)
      - `pnpm api test:integration` (integration, `ALLOW_DESTRUCTIVE_DB=1`)
      - `pnpm api test:e2e` (e2e, `ALLOW_DESTRUCTIVE_DB=1`)
      - `pnpm api exec tsc --noEmit`
      - `pnpm api openapi:check`
      - `pnpm api lint:ci`

---

## Phase 11 — `apps/web` fixture updates (D-06)

Requirements: D-06 (mechanical, compiler-enumerated). Depends on Phase 7
(regenerated `@moneydiary/api-client` type is what breaks `tsc` here).
`[P]` with Phase 12 (mobile) — disjoint workspaces, no shared files besides
the already-regenerated `packages/api-client`.

- [ ] **T11.1** Add `cantidadSinCategoria: 0` (or a meaningful non-zero test
      value where the test's intent benefits from it) to each object-literal
      construction site enumerated in design §D-06:
      - `apps/web/src/api/client.test.ts:24`
      - `apps/web/src/api/use-resumen.test.tsx:8`
      - `apps/web/src/api/use-resumen-anual.test.tsx:8`
      - `apps/web/src/components/ResumenPage.test.tsx:17`
      - `apps/web/src/components/ResumenAnual.test.tsx:21`
      - `apps/web/src/components/ResumenAnual.test.tsx:57`
      - `apps/web/src/domain/resumen-view-model.test.ts:5`
      - **Do NOT budget an edit** for the two spread-derived sites
        (`api/client.test.ts:223`, `components/ResumenPage.test.tsx:51`) —
        per design, they compile with zero edits once the source fixture
        (`validDto`, `dataDto`) carries the field. Confirm this by observing
        `tsc` goes clean without touching them.
      - Verify: `pnpm web typecheck` (== `tsr generate && tsc -b`) clean.
      - Verify: `pnpm web test` green.

---

## Phase 12 — `apps/mobile` fixture updates (D-06)

Requirements: D-06. Depends on Phase 7. `[P]` with Phase 11.

- [ ] **T12.1** Add `cantidadSinCategoria: 0` to the two object-literal
      construction sites:
      - `apps/mobile/src/domain/resumen-view-model.spec.ts:4`
      - `apps/mobile/src/api/client.spec.ts:4`
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit` clean.
      - Verify: `pnpm --filter @moneydiary/mobile test` green.

---

## Phase 13 — Final cross-workspace gate sweep

- [ ] **T13.1** Full-repo verification, mirroring CI:
      - `pnpm test` (all workspaces)
      - `pnpm build` (all workspaces — catches any residual `tsc` drift)
      - `pnpm api-client typecheck` (`packages/api-client` — `tsc --noEmit`)
      - Confirm no accidental edits to the explicitly-frozen files (design
        §4 "Not touched, by design"): `estado-semaforo.ts`, `bucket.ts`,
        `resumen.routes.ts`, `resumen-anual.schema.ts`,
        `calcular-resumen-anual.use-case.ts`, `prisma/schema.prisma`, any
        migration, both clients' runtime `esResumenMesDto` type guards, both
        clients' view-models.
      - Confirm `buckets[].length === 4` assertions were NOT edited anywhere
        (design §6.2 regression guard — if any needed editing, the additive
        constraint was violated; stop and re-read D-02).

---

## Review Workload Forecast

**Estimated changed lines (additions + deletions) by area:**

| Area | Files | Est. lines |
|---|---|---|
| Backend domain/application (Phases 1-2) | `resumen-mes.ts`, `resumen-mes.port.ts`, `resumen-anual.port.ts`, `resumen-mes-assembly.ts` + specs | ~120-160 |
| Backend infra — monthly repo (Phase 3) | `prisma-resumen-mes.repository.ts` + integration spec (5 scenarios, incl. 2 new) | ~160-220 |
| Backend infra — annual repo (Phase 4) | `prisma-resumen-anual.repository.ts` + integration spec | ~30-40 |
| Backend HTTP — DTO + schema (Phases 5-6) | `resumen-mes.dto.ts`, `resumen.schema.ts` + specs | ~70-100 |
| Contract regen (Phase 7) | `openapi.json`, `types.gen.ts` (generated, not hand-authored) | ~30-50 |
| HTTP isolation + e2e (Phases 8-9) | `auth-isolation.int-spec.ts`, `resumen.e2e-spec.ts`, `resumen-anual.e2e-spec.ts` | ~60-90 |
| `apps/web` fixtures (Phase 11) | 7 edited literals + 2 no-op spreads | ~15-20 |
| `apps/mobile` fixtures (Phase 12) | 2 literals | ~4-6 |
| **Total** | | **~490-690** |

**Chained PRs recommended: Yes**

**400-line budget risk: Medium** — the total change exceeds 400 lines, but
the design's own data-flow slicing (§6.9) already produces natural,
independently-reviewable boundaries that each land comfortably under 400
lines individually:

- **PR 1 — Domain + application** (Phases 1-2): VO, ports, assembly, unit
  tests. ~120-160 lines. Self-contained; compiles and tests green in
  isolation (the port's required field is added here, but nothing outside
  the spec files constructs it yet except through fakes).
- **PR 2 — Infrastructure persistence** (Phases 3-4): both repositories +
  their integration tests, including the two HIGH-risk mitigations (R-1,
  R-2) and their proving tests (SC-03 extended, SC-10). ~190-260 lines. This
  is the riskiest slice and benefits most from being reviewed alone.
- **PR 3 — HTTP boundary + contract regen + isolation/e2e** (Phases 5-9):
  DTO, Zod schema, `openapi.json`/`types.gen.ts` regen, ISO-02 HTTP test,
  e2e coverage. ~260-360 lines (largest slice — mostly generated JSON +
  test assertions, low review-judgment density despite the line count).
- **PR 4 — Client fixtures** (Phases 11-12): mechanical, compiler-enumerated
  edits in `apps/web`/`apps/mobile`, unblocked only once PR 3's
  `types.gen.ts` lands. ~20-30 lines, trivial review.

Each slice maps to a Phase boundary already defined above, so no additional
task restructuring is needed if chaining is chosen — the phases already ARE
the candidate PRs.

**Decision needed before apply: Yes** — per `delivery_strategy:
ask-on-risk`, this forecast should be surfaced to the user before `sdd-apply`
starts, to confirm: (a) proceed as 4 chained PRs along the phase boundaries
above, (b) accept a `size:exception` for a single larger PR, or (c) a
different split. This task list does not decide PR boundaries — it only
shows that the phases already align cleanly with the 400-line budget if
chaining is chosen.
