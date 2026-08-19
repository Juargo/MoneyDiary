# Tasks: US-044 — Mobile Configuración with parity (perfil + categorías)

> Ordered implementation checklist for `design.md` (judgment-approved — decisions are NOT reopened
> here). Strict TDD is active (mobile runner: jest-expo + RNTL, ADR-017). Order follows design §0's
> dependency tree and §5's 14-slice PR ledger: **error foundation + `me` guard fix → mutation
> transport + perfil client → catálogo client + DTO aliases → shared field components → route shell
> + tabs → perfil domain → perfil UI → catálogo domain helpers → categorías list → nueva categoría →
> edit route + identity → impact confirmations → patrones → gear (last, D-18) → closing.**
>
> Legend: `[P]` = parallel-safe with sibling `[P]` tasks (disjoint files, no shared dependency).
> Unmarked tasks are sequential. `MCFG-xx`/`MCTG-xx` = requirement in
> `specs/mobile-configuracion/spec.md`. `D-xx` = decision in `design.md` §2. `CQ-xx` = closed
> question in `proposal.md` §10.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~5 340 across 14 task-level slices (design §5's own pre-cut ledger) |
| 400-line budget risk | High — 6 of 14 slices sit at/above budget: PR3b (~444), PR4a (~505), PR4b (~405), PR5b (~425), PR6a (~585), PR7 (~535) |
| Chained PRs recommended | Yes — mandatory at this size |
| Delivery strategy | ask-on-risk (session default) — carried from the SDD orchestrator's cached choice |
| Chain strategy | stacked-to-main (decided at the apply gate — 6 size:exceptions pre-approved for PR3b/4a/4b/5b/6a/7; D-18 makes intermediate merges UI-unreachable until PR8 ships the gear) |
| Decision needed before apply | **Yes** |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (decided; 14 PRs, exceptions: 3b/4a/4b/5b/6a/7)
400-line budget risk: High
```

### Chain strategy — RESOLVED: stacked-to-main (apply gate, 2026-08-17)

Design §5 states explicitly: *"Either strategy is defensible; the choice belongs to the delivery
gate."* Both options are real, not a formality:

- **`feature-branch-chain`** — design's own default recommendation, matching US-050's precedent for
  a multi-slice client feature: PRs 2a–7 are only meaningful together, and a tracker branch keeps the
  intermediate states off `main`.
- **`stacked-to-main`** — made genuinely safe here by **D-18** (the gear lands in PR8, LAST): until
  PR8 merges, `/configuracion` and `/categoria/[id]` are registered but unreachable from the UI (no
  entry point exists), so every intermediate merge (PR1–PR7) is inert dead code, not a half-built
  visible feature — the same partial-rollback lever proposal §7 describes, used proactively.

**RESOLVED at the apply gate**: the user chose **stacked-to-main** with the 6 size:exceptions
below pre-approved (3b/4a/4b/5b/6a/7 shipped whole — no further splits). Decisive argument: D-18
(above) makes every intermediate merge UI-unreachable until PR8, so the tracker branch buys
nothing here. The design's feature-branch-chain leaning is recorded and overridden. Standing
mitigation carried from US-050: no `mobile-v*` tag until the full PR1–PR8 chain has merged.

### Over-400 slices — `size:exception` candidates (design §5, 6 of 14)

| Slice | Est. lines | Est. tests | Natural further cut (if wanted) |
|---|---:|---:|---|
| PR3b — Route shell + tabs + back control | ~444 | 17 | none obvious — the route + its two independent fetch phases are one unit |
| PR4a — Perfil domain (orchestration + copy) | ~505 | 23 | `guardar-perfil.*` / `mensajes-perfil.*` split (already two files; could ship as two PRs) |
| PR4b — Perfil tab UI | ~405 | 15 | marginal — ship whole under exception |
| PR5b — Categorías list | ~425 | 18 | `CategoriaFila` / `CategoriasPanel` split (already two files) |
| PR6a — Edit route + identity form | ~585 | 22 | route+states (`app/categoria/[id].tsx`) / identity form (`EditarCategoria.tsx`) — design §5's own suggested cut |
| PR7 — Patrones (section + per-row confirm) | ~535 | 22 | section+placeholder rows (`PatronesSection`) / the row state machine (`PatronFila`) — design §5's own suggested cut |

Every overrun is **test volume**, not production complexity (design §5's own note — specs are
55–60% of every slice). Confirm at the apply gate whether to ship these six under `size:exception`
as listed, or split PR6a/PR7 further along the cuts above (PR3b/PR4a/PR4b/PR5b have no clean further
split without fragmenting a single cohesive unit).

### Suggested Work Units

| Unit | Goal | PR | Base |
|---|---|---|---|
| 1 | ADR-038 + error foundation + `esMeDto` fix | PR1 | `main` |
| 2 | Mutation transport + perfil client | PR2a | PR1 |
| 3 | Catálogo client + DTO aliases | PR2b | PR2a |
| 4 | Shared field components | PR3a | PR2b (chain order; no code coupling) |
| 5 | Route shell + tabs + back control | PR3b | PR3a |
| 6 | Perfil domain (orchestration + copy) | PR4a | PR3b |
| 7 | Perfil tab UI | PR4b | PR4a |
| 8 | Catálogo domain helpers | PR5a | PR4b (chain order; no code coupling) |
| 9 | Categorías list | PR5b | PR5a |
| 10 | Nueva categoría (inline create) | PR5c | PR5b |
| 11 | Edit route + identity form | PR6a | PR5c |
| 12 | Impact confirmations (bucket change + delete) | PR6b | PR6a |
| 13 | Patrones (section + per-row confirm) | PR7 | PR6b |
| 14 | Entry point (gear) + icon dependency — makes PR1–PR7 reachable (D-18) | PR8 | PR7 |

### Judgment-anticipated test classes (baked into the tasks below, not left implicit)

1. **Per-field guard accept/reject** — `esMeDto` (PR1), `esPatronDto`/`esCategoriaDto`/
   `esCatalogoDto` (PR2b): one rejection case per field (missing + wrong-typed), never a single
   "malformed body" case standing in for all fields.
2. **List ORDER pinning** — `agruparPorBucket` (PR5a), `CategoriasPanel` row order (PR5b),
   `PatronesSection` existing-precede-new (PR7): array/DOM-order equality, never `toContain`.
3. **Non-tautological absence assertions** — `Eliminar categoría` absent on the list (PR5b) /
   present on the edit screen (PR6a), via the identical query; `Desvincular` absent on Perfil (PR4b)
   paired with `Vinculada`/`No vinculada` present; a pattern's delete asserts `Alert.alert` never
   called (PR7), paired with the categoría delete case that DOES call it (PR6b).
4. **No prop-identity probes through `Pressable`** — every interaction task below is explicit that
   assertions go through a mocked module call (`toHaveBeenCalledWith`) or a navigation-mock spy, never
   `getBy…(...).props.onPress === handler`.
5. **The refresh-on-bucket-change-only matrix (MCTG-07)** — positive (PR6b, bucket change) + 4
   negatives distributed at their real mutation sites: creation (PR5c), rename-only (PR6a),
   deletion (PR6b), pattern mutation (PR7). Each negative is asserted against the REAL
   `resumen-refresh` module, never mocked away.
6. **Per-fetcher suites do not duplicate the transport branch matrix** (design §3 point 5) —
   `perfil.spec.ts` (PR2a) and `categorias.spec.ts` (PR2b) test call-shape + fetcher-specific guards
   ONLY. `mutacion.spec.ts` owns the full branch matrix exactly once. Because `mutacion.ts`/
   `mutacion.spec.ts` land in the SAME PR as `perfil.spec.ts` (PR2a), there is no interim window
   where `perfil.spec.ts` duplicates the matrix and needs a later thinning pass — it is written thin
   from its first commit. PR2b's `categorias.spec.ts` follows the identical rule.

---

## Phase 0 — Pre-flight

- [x] **T0.1** Confirm Strict TDD Mode active for this session (test runner:
      `pnpm --filter @moneydiary/mobile test`, jest-expo + RNTL per `sdd-init/moneydiary`); every RED
      task below MUST fail before its paired GREEN task.
- [x] **T0.2** Baseline gate before any edit: `pnpm --filter @moneydiary/mobile test` and
      `pnpm --filter @moneydiary/mobile exec tsc --noEmit` both green — establishes the pre-change
      baseline so later diffs are attributable.

---

## Phase PR1 — ADR-038 + error foundation + the `me` guard fix

Requirements: CQ-1 (ADR-038 recording), CQ-3 (`ApiError.code`), proposal §5's blocking pre-existing
gap (`esMeDto`). Depends on nothing.

- [x] **T1.1** Reorder `docs/adr/ADR-038-mobile-write-scope-configuracion.md`: move
      `## Alternativas consideradas` to AFTER `## Decisión`, matching the sibling-ADR convention
      (verified against ADR-036/ADR-026: `Estado → Contexto → Decisión → Alternativas consideradas →
      …`). One INFO-severity finding from the design-phase judgment-day round.
      - Verify: `rg "^## " docs/adr/ADR-038-mobile-write-scope-configuracion.md` shows `Decisión`
        before `Alternativas consideradas`.
- [x] **T1.2** Confirm `docs/adr/README.md`'s ADR-038 index row and ADR-026's superseded-rule
      annotation (both already drafted in the design phase) land in this PR's commit — no further
      edit expected unless drifted since design.
      - Verify: `rg "ADR-038" docs/adr/README.md`
- [x] **T1.3** Add the ADR-038 row to `CLAUDE.md`'s ADR table, matching the existing one-line format
      (🔵 Propuesto status, note it supersedes ADR-026's scope rule only).
      - Verify: `rg "ADR-038" CLAUDE.md`
- [x] **T1.4 (Move, no behavior change)** Create `apps/mobile/src/domain/api-error.ts`: move
      `ApiError` (add `code?: string` to the `http` variant, CQ-3/D-05), `ApiResult<T>`, and
      `copiaPorApiError` verbatim out of `src/api/client.ts` (design §1.1). In `src/api/client.ts`,
      replace the removed declarations with
      `export type { ApiError, ApiResult } from '../domain/api-error'; export { copiaPorApiError }
      from '../domain/api-error';` — zero import-path churn at every call site (design §4:
      `states/Error.tsx`, `app/index.tsx`, `app/subir.tsx`, `app/login.tsx`, 4 specs).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green (the move's only regression guard).
- [x] **T1.5 (RED)** In `apps/mobile/src/api/client.spec.ts`, add the per-field `esMeDto` cases
      (design §3 point 1, +7): `email: null` → **accepted** (the regression this change exists to
      fix); `nombre` missing → rejected; `nombre` wrong-typed → rejected; `esDemo` missing →
      rejected; `esDemo` wrong-typed → rejected; `googleVinculado` missing → rejected;
      `googleVinculado` wrong-typed → rejected. One case per field — never a single "malformed body"
      case standing in for all of them (judgment-anticipated class 1).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test client.spec.ts`
- [x] **T1.6 (GREEN)** In `apps/mobile/src/api/client.ts`, widen `esMeDto` per design §1.2: accept
      `email: string | null`; require `nombre: string`, `esDemo: boolean`, `googleVinculado:
      boolean`. State in a code comment (not smuggled) that `esDemo` is validated as the
      discriminator making `email: null` legitimate — the one deliberate exception to
      `post-ingesta.ts`'s "validate only what flows to render" rule.
      - Verify: `pnpm --filter @moneydiary/mobile test client.spec.ts` — existing + 7 new green.
- [x] **T1.7 (REFACTOR + sweep)** Confirm zero import-path churn: `states/Error.tsx`,
      `app/index.tsx`, `app/subir.tsx`, `app/login.tsx` and all 4 existing specs still import
      `ApiError`/`ApiResult`/`copiaPorApiError` from `./client` unchanged (design §4 impact sweep).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR1 gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~319 lines, 7 new tests.

**PR1 real:** 439 ledger-scope changed lines (forecast 319; ADR-038 body 221 vs ~140 forecast = +81,
`client.spec.ts` 104 vs ~80 forecast = +24, remainder minor drift across the rest). Final new-test
count after the judgment-day fix (4 more `esMeDto` reject cases): 7 + 4 = 11.

---

## Phase PR2a — Mutation transport + perfil client

Requirements: CQ-3 dependency (the `code` field a real fetcher populates), proposal §4.2, D-06
(extract `enviarMutacion` on occurrence two). Depends on PR1 (`ApiError.code`).

- [x] **T2a.1 (RED)** Create `apps/mobile/src/api/mutacion.spec.ts` (design §3 "HTTP — transport"
      row, ~9 cases — the FULL branch matrix, asserted **exactly once** in this file per
      judgment-anticipated class 6): success (2xx) returns the raw `Response` unparsed; `content-
      type: application/json` set only when a body is present, absent on a bodyless call; headers
      reuse `construirHeadersSesion()` verbatim (`x-api-key` + `Authorization: Bearer`); `401` →
      `{tag:'unauthorized'}`; non-2xx with a parseable `{code}` body → `{tag:'http',status,code}`;
      non-2xx with an unparseable/non-JSON body → `{tag:'http',status,code:undefined}` (never
      throws); `fetch` rejection → `{tag:'network'}`; missing `API_BASE_URL` → `{tag:'network'}`
      **with zero `fetch` calls performed**.
      **Note on design §3's literal "malformed 2xx → parse" row:** design §1.3 states
      `enviarMutacion`'s success path returns the raw `Response` and never parses it — so a
      malformed-2xx-body case cannot produce a `parse` tag from THIS function. At implementation
      time, confirm which behavior is intended: if success genuinely never parses, write this case
      as "a non-JSON 2xx body still resolves `ok:true`, unparsed" instead of a `parse` tag. Do not
      add body-parsing logic to `enviarMutacion`'s success path just to manufacture a `parse` case —
      that would contradict §1.3's stated discipline.
      - Verify (expect RED — module doesn't exist): `pnpm --filter @moneydiary/mobile test mutacion.spec.ts`
- [x] **T2a.2 (GREEN)** Create `apps/mobile/src/api/mutacion.ts`: `enviarMutacion(url, method, body?):
      Promise<ApiResult<Response>>` per design §1.3 — `API_BASE_URL` guard → `network`;
      `construirHeadersSesion()` reused verbatim + conditional `content-type`; `401` → `unauthorized`;
      other non-2xx → `errorConCodigo(res)` (`try/catch` around `res.json()`, `typeof code ===
      'string'` or `undefined`); success returns the raw `Response`; never throws.
      - Verify: `pnpm --filter @moneydiary/mobile test mutacion.spec.ts` — 9 green.
- [x] **T2a.3 (RED)** Create `apps/mobile/src/api/perfil.spec.ts` (~8 cases — call-shape + fetcher-
      specific guards ONLY, judgment-anticipated class 6): `patchPerfil` call shape (URL
      `/api/perfil`, method `PATCH`, body = the given patch, via a `jest.mock('./mutacion')` spy);
      `patchPassword` call shape (URL `/api/perfil/password`, method `PATCH`, body); both delegate to
      `enviarMutacion` — assert the spy was called correctly, never re-test its branches; success
      discards the raw `Response` and resolves `{ok:true, value: undefined}` without reading the
      body.
      **Thinning note (in-PR, not deferred):** because `mutacion.ts`/`mutacion.spec.ts` (T2a.1/T2a.2)
      land in this SAME PR ahead of this task, `perfil.spec.ts` is written thin from its FIRST
      commit — there is no interim window where it duplicates the transport matrix and needs a later
      thinning pass. This is the PR2a-specific instance of the general per-fetcher directive; PR2b's
      `categorias.spec.ts` follows the identical rule under the same reasoning.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test perfil.spec.ts`
- [x] **T2a.4 (GREEN)** Create `apps/mobile/src/api/perfil.ts`: `patchPerfil(patch: PerfilPatch):
      ApiResult<void>`, `patchPassword(patch: PasswordPatch): ApiResult<void>`, both delegating to
      `enviarMutacion`, mirroring `apps/web/src/api/perfil.ts:29-38` (design §1.4). Types
      `PerfilPatch = {nombre?, email?, passwordActual?}`, `PasswordPatch = {passwordActual,
      passwordNueva}`.
      - Verify: `pnpm --filter @moneydiary/mobile test perfil.spec.ts` — 8 green.
- [x] **T2a.5 (REFACTOR + sweep)** Confirm `perfil.ts` imports `ApiError`/`ApiResult` from
      `../domain/api-error` (not a fresh local declaration), and that `mutacion.ts` is the ONLY
      module in this PR that touches `fetch` directly for a write request.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR2a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~385 lines, 17 new tests.

**PR2a real:** 463 lines (forecast ~385; overrun is test volume as usual — `mutacion.spec.ts` 200 vs.
~150 forecast, `perfil.spec.ts` 136 vs. ~110 forecast, both driven by writing every branch/call-shape
case as its own `it()` per judgment-anticipated class 6 rather than parameterized tables).
17 new tests exactly as forecast (9 `mutacion.spec.ts` + 8 `perfil.spec.ts`). Full mobile suite:
382/382 passed (365 baseline + 17 new), `tsc --noEmit` clean, `eslint` clean on all 4 touched files.
T2a.1's design §3-vs-§1.3 judgment call resolved per §1.3's stated discipline: `enviarMutacion`'s
success path never calls `res.json()`, so there is no `parse`-tag case in `mutacion.spec.ts` — the
first test asserts the 2xx path returns the raw `Response` with `json()` never invoked, documented
in both `mutacion.spec.ts`'s file docblock and `mutacion.ts`'s own docblock (not silently resolved).

---

## Phase PR2b — Catálogo client + DTO aliases

Requirements: data-layer half of MCTG-01/02/03/04/05/06, D-07 (read `string`, write closed unions).
Depends on PR2a (`enviarMutacion`).

- [x] **T2b.1** In `packages/api-client/src/index.ts`, add three indexed-access type aliases
      (`CatalogoDto`, `CategoriaDto`, `PatronDto`) over the already-generated `CatalogoResponse`/
      `CategoriaResponse`/`PatronResponse` in `types.gen.ts` (design §1.5 — additive, type-only, no
      runtime, no build step, ~9 lines).
      - Verify: `pnpm --filter @moneydiary/api-client exec tsc --noEmit` (or the package's own typecheck script).
- [x] **T2b.2** Create `apps/mobile/src/domain/catalogo.types.ts` re-exporting the three aliases, the
      same way `resumen.types.ts` re-exports `MeDto` (design §1.5).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`
- [x] **T2b.3** Create `apps/mobile/src/domain/catalogo-constantes.ts`, porting
      `apps/web/src/api/catalogo-constantes.ts:11-18` verbatim: `BUCKETS_ASIGNABLES =
      ['Necesidades','Deseos','Ahorro'] as const` (which **is** the group order — no separate
      `ORDEN_BUCKETS`) and `MATCH_TYPES = ['CONTAINS','STARTS_WITH','REGEX'] as const`. Non-test
      constants file — covered downstream by PR5a's `agrupar-categorias-por-bucket.spec.ts` ORDER
      pinning.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`
- [x] **T2b.4 (RED)** Create `apps/mobile/src/api/categorias.spec.ts` (~10 cases — call shape for the
      7 endpoints + fetcher-specific guards ONLY, judgment-anticipated class 6):
      - `fetchCatalogo()` call shape: URL `/api/categorias`, `GET`, headers — it has its OWN `fetch`
        (not `enviarMutacion`), it is the only call in this module that reads a body.
      - `esPatronDto`/`esCategoriaDto`/`esCatalogoDto`: per-field accept/reject, one case per field
        (missing + wrong-typed) — judgment-anticipated class 1, same discipline as `esMeDto`. `bucket`/
        `matchType` accepted as plain `string`, including an **unrecognised** value (D-07,
        MCFG-MCTG-08's "server-unknown bucket still lists" scenario — the read path never rejects).
      - `transaccionesCount` missing/wrong-typed → parse failure (design §1.4 — never `undefined`
        interpolated into the impact sentence).
      - Each of the six mutations (`crearCategoria`, `actualizarCategoria`, `eliminarCategoria`,
        `crearPatron`, `actualizarPatron`, `eliminarPatron`): URL + method + body via a
        `jest.mock('./mutacion')` spy — never the branch matrix.
      - `prioridad` is asserted **absent** from every pattern payload (`POST`/`PATCH /api/patrones`)
        — binding decision 3.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test categorias.spec.ts`
- [x] **T2b.5 (GREEN)** Create `apps/mobile/src/api/categorias.ts`: `fetchCatalogo():
      ApiResult<CatalogoDto>` (own fetch + `esCatalogoDto`) + the six mutations delegating to
      `enviarMutacion` (design §1.4). Write payload types (`BucketAsignable`, `MatchType`) use the
      closed literal unions from `catalogo-constantes.ts`; read guards keep `bucket`/`matchType` as
      `string` (D-07). `prioridad` absent from `PatronInput`/`PatronPatch`.
      - Verify: `pnpm --filter @moneydiary/mobile test categorias.spec.ts` — 10 green.
- [x] **T2b.6 (REFACTOR + sweep)** Confirm `esCatalogoDto`'s per-element guards (`esPatronDto`,
      `esCategoriaDto`) degrade gracefully on a `null`/non-object array element (the
      `esBucketResumenDto` judgment-day lesson design §1.4 cites) — add the missing reject case now
      if not already covered by T2b.4.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR2b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~366 lines, 10 new tests.

**PR2b real:** (branch `feat/us-044-config-pr2b-catalogo-api`, base `origin/main` 174ba61f):
`packages/api-client/src/index.ts` +9 (`git diff --numstat`), `apps/mobile/src/domain/catalogo.types.ts`
14 (new, `wc -l`), `apps/mobile/src/domain/catalogo-constantes.ts` 24 (new), `apps/mobile/src/api/categorias.ts`
225 (new), `apps/mobile/src/api/categorias.spec.ts` 389 (new) = **661 ledger-scope changed lines**
(forecast ~366, +295 overrun). Overrun driver: the per-field guard matrix (judgment-anticipated class 1)
was implemented as a 23-row `it.each` table (one row per missing/wrong-typed field across
`esCatalogoDto`/`esCategoriaDto`/`esPatronDto`, plus 2 null-element-degrade rows for T2b.6) rather than
collapsed into fewer cases — same test-volume pattern PR1/PR2a already showed (specs are the majority of
every slice's real line count). `categorias.ts` itself (225 lines incl. docblocks) is also above the
~180 design estimate, mostly documentation mirroring `mutacion.ts`'s density.
Test counts: RED T2b.4 — module-not-found failure (categorias.ts didn't exist yet). GREEN T2b.5 —
**31/31 passed** (1 fetchCatalogo call-shape/parse + 1 D-07 unrecognised-value-accepted + 23
`it.each` reject rows + 3 categoria mutations + 3 patron mutations, forecast was 10). Full mobile
suite after T2b.6 sweep: **413/413 passed** (382 baseline + 31 new), `tsc --noEmit` clean on both
`apps/mobile` and `packages/api-client`, `eslint --fix` clean on all 4 touched/new files (0
errors/warnings after collapsing `categorias.spec.ts`'s 6 duplicate `./categorias` import lines into
one — an `import/no-duplicates` warning the auto-fix pass did not resolve on its own).

**Deviation from design (documented, not silent):** `fetchCatalogo`'s non-2xx branch does NOT reuse
`mutacion.ts`'s `errorConCodigo` (which would populate `ApiError.code`) — it mirrors `client.ts`'s
existing `fetchMe`/`fetchResumen` GET skeleton instead, returning `{tag:'http',status}` with no
`code`. Rationale: (1) tasks.md T2b.4's bullet for `fetchCatalogo` asks only for call-shape + guard
coverage, not a `code`-bearing error branch; (2) exporting `mutacion.ts`'s private `errorConCodigo`
just for this one GET caller would create a second cross-cutting dependency between the read and
write transports for a field (`code`) nothing in the catálogo read path consumes; (3) it keeps
`fetchCatalogo` a same-shape sibling of `fetchMe` (both GETs, same file family, same never-throw
discipline) rather than a hybrid of two different transport styles. If a future task needs `code` on
a catálogo GET failure, `errorConCodigo` can be exported from `mutacion.ts` then — no code here
blocks that.

---

## Phase PR3a — Shared field components

Requirements: MCFG-MCTG-08 (RNTL coverage for every new component), D-17 (`SelectorChips` serves
both `Bucket` and `Tipo de coincidencia`). Depends on nothing beyond React Native primitives —
independently reviewable, under budget.

- [x] **T3a.1 (RED)** Create `apps/mobile/src/components/configuracion/CampoTexto.spec.tsx`
      (5 cases): renders label + value; `onChangeText` fires on input; `secureTextEntry` toggles for
      password fields; an error message renders under the field when provided (`role="alert"`); the
      accessible name matches the visible label. `[P]` with T3a.3 (disjoint files).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test CampoTexto.spec.tsx`
- [x] **T3a.2 (GREEN)** Create `apps/mobile/src/components/configuracion/CampoTexto.tsx` — controlled
      text input wrapper (`label`, `value`, `onChangeText`, optional `secureTextEntry`, optional
      `error`).
      - Verify: `pnpm --filter @moneydiary/mobile test CampoTexto.spec.tsx` — 5 green.
- [x] **T3a.3 (RED)** Create `apps/mobile/src/components/configuracion/SelectorChips.spec.tsx`
      (6 cases): `radiogroup`/`radio` `accessibilityRole`s (mirrors `subir.tsx:327-360`'s 10/25/50
      idiom, D-17); `accessibilityState.checked` on the selected chip only; tapping a chip calls
      `onChange` with its value; renders N chips for N options; label renders above the group; works
      for both a 3-bucket option set and a 3-matchType option set (parametrized — proving the
      one-component-two-call-sites contract D-17 names). `[P]` with T3a.1.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test SelectorChips.spec.tsx`
- [x] **T3a.4 (GREEN)** Create `apps/mobile/src/components/configuracion/SelectorChips.tsx` — generic
      `radiogroup` of `options: readonly string[]`, `value`, `onChange`, `label`.
      - Verify: `pnpm --filter @moneydiary/mobile test SelectorChips.spec.tsx` — 7 green.
- [x] **T3a.5 (REFACTOR)** Confirm both components import only `src/theme` tokens, never `src/api`/
      `src/domain` (design §0 dependency rule: `domain ← components ← app`).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test CampoTexto.spec.tsx SelectorChips.spec.tsx`

**PR3a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~260 lines, 11 new tests. Under budget.

**PR3a real:** 324 lines (CampoTexto.tsx 48, CampoTexto.spec.tsx 84, SelectorChips.tsx 76, SelectorChips.spec.tsx 116). 12 new tests (5 CampoTexto + 7 SelectorChips). Full mobile suite: 38 suites / 425 tests passing, `tsc --noEmit` clean. Zero api/domain imports.

---

## Phase PR3b — Route shell + tabs + back control

Requirements: MCFG-01. Depends on PR2a/PR2b's clients (`fetchMe`, `fetchCatalogo`) and PR3a's field
components (not directly imported here, but chain-ordered ahead for review simplicity).

- [x] **T3b.1** In `apps/mobile/app/_layout.tsx`, add two `<Stack.Screen>` entries
      (`name="configuracion"`, `name="categoria/[id]"`) inside the existing
      `<Stack.Protected guard={estado === 'authenticated'}>` block (design §1.14, D-01). The guard
      itself is untouched. Non-test, mechanical, ~4 lines.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`
- [x] **T3b.2 (RED)** Create `apps/mobile/src/components/configuracion/TabsConfiguracion.spec.tsx`
      (5 cases): renders `Perfil`/`Categorías` as a `tablist`/`tab` pair; the active tab has
      `accessibilityState.selected`; tapping the inactive tab calls `onChange` with its key; tab
      switch does NOT trigger any navigation call (assert the `expo-router` mock's `push`/`replace`
      spies are never called — paired with T3b.5's positive back-navigation assertion, same file
      family); local `useState`, not `expo-router` `Link`/`useSegments` (D-01).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test TabsConfiguracion.spec.tsx`
- [x] **T3b.3 (GREEN)** Create `apps/mobile/src/components/configuracion/TabsConfiguracion.tsx` —
      local-state segmented control (D-01).
      - Verify: `pnpm --filter @moneydiary/mobile test TabsConfiguracion.spec.tsx` — 5 green.
- [x] **T3b.4 (RED)** Create `apps/mobile/app/configuracion.spec.tsx` (~12 cases): the `me` fetch's
      3 phases (loading/error/data) gate the Perfil tab's readiness independently of the catálogo
      tab's own 3 phases (design §0 — "Neither can blank the other": assert Perfil's error state
      does not affect what Categorías renders, and vice versa); default tab is `Perfil`; tapping
      `Categorías` switches tab without re-triggering either fetch; «Volver al resumen» renders
      (D-03, on-screen back — `_layout.tsx` hides the native header) and calls `router.back()`;
      `useFocusEffect` re-fires the catálogo load on mount (design §3 seam 1, via the `expo-router`
      mock's `useFocusEffect: (cb) => React.useEffect(cb, [cb])`, mirroring
      `app/index.spec.tsx:75-77` — this seam is declared here, reused by every later screen spec that
      needs it). This task's Perfil/Categorías tab bodies assert ONLY the phase-switch shell — the
      real `PerfilPanel`/`CategoriasPanel` land in PR4b/PR5b and replace a minimal placeholder here
      (KISS — this PR's scope is routing + tabs, not the panels).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test app/configuracion.spec.tsx`
- [x] **T3b.5 (GREEN)** Create `apps/mobile/app/configuracion.tsx` — route owning the `me` fetch (via
      `fetchMe`) + the catálogo fetch (via `fetchCatalogo`) + `TabsConfiguracion` local state;
      `useFocusEffect` on the catálogo load (D-10); on-screen «Volver al resumen» (D-03); renders a
      minimal placeholder for each tab body until PR4b/PR5b's own GREEN steps replace it with the
      real panel.
      - Verify: `pnpm --filter @moneydiary/mobile test app/configuracion.spec.tsx` — 11 green.
- [x] **T3b.6 (REFACTOR + sweep)** Confirm the two independent `{loading|error|data}` phases never
      share state (design §0); confirm the seam-1 `expo-router` mock extension does not regress
      `app/index.spec.tsx` (which shares the same mock module).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR3b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~444 lines, 17 new tests. **Over 400-line budget** — `size:exception` candidate (Review Workload Forecast).

**PR3b real:** 549 lines (`_layout.tsx` +2, `TabsConfiguracion.tsx` 57, `TabsConfiguracion.spec.tsx` 84, `configuracion.tsx` 124, `configuracion.spec.tsx` 282). 16 new tests (5 TabsConfiguracion + 11 configuracion). Full mobile suite: 40 suites / 441 tests passing, `tsc --noEmit` clean.

---

## Phase PR4a — Perfil domain (orchestration + copy)

Requirements: MCFG-03, MCFG-04. Depends on PR2a's `PerfilPatch`/`PasswordPatch` types (type-only) and
PR1's `ApiError`/`copiaPorApiError` (from `src/domain/api-error`).

- [ ] **T4a.1 (RED)** Create `apps/mobile/src/domain/guardar-perfil.spec.ts` (~12 cases): nombre-only
      ⇒ **one** call, `passwordActual` absent from the payload; email change ⇒ `passwordActual`
      present; empty `passwordActual` + email dirty ⇒ `falta-password-actual`, **zero** calls; a
      profile failure ⇒ `patchPassword` **never called** — the abort-order guarantee (MCFG-03's own
      scenario); a password failure after a profile success ⇒ `password-fallo` +
      `perfilGuardado:true`; a full success ⇒ `ok` + `passwordCambiada`; no changes at all ⇒
      `sin-cambios`, zero calls; "what counts as a change" is computed against the freshly-read `me`,
      not a stale draft (retry-after-partial-failure idempotency case).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test guardar-perfil.spec.ts`
- [ ] **T4a.2 (GREEN)** Create `apps/mobile/src/domain/guardar-perfil.ts` — `construirPerfilPatch` +
      `guardarPerfil(draft, me, io)` per design §1.8, the body ported from
      `use-guardar-perfil.ts:90-127` verbatim; `io` (`patchPerfil`, `patchPassword`) is **injected**
      so `domain/` never imports `src/api` at runtime. A type-only import of `PerfilPatch`/
      `PasswordPatch` from `src/api/perfil` is the accepted exception, symmetric with D-04's
      `ApiError` carve-out — if it reads as a violation at review time, move the two type aliases
      into this file and have `api/perfil.ts` re-export them instead.
      - Verify: `pnpm --filter @moneydiary/mobile test guardar-perfil.spec.ts` — 12 green.
- [ ] **T4a.3 (RED)** Create `apps/mobile/src/domain/mensajes-perfil.spec.ts` (~11 cases): one case
      per `status+code` row in the ported table (`PERFIL_RECHAZADO`, `NOMBRE_INVALIDO`,
      `EMAIL_INVALIDO`, `PASSWORD_INVALIDA`, `DEMO_SOLO_LECTURA`, …) plus the unknown-code fallback
      (`GENERICO`) plus the three transport tags (`network`/`unauthorized`/`parse` →
      `copiaPorApiError(e)`, D-08); **wrong-password and taken-email `403 PERFIL_RECHAZADO` render
      the byte-identical string** — anti-enumeration, MCFG-04's own scenario, assert `toBe` not
      `toMatch`; `mensajeDeResultado`'s `ok`+`passwordCambiada` success renders «Cambios guardados.
      Se cerraron tus otras sesiones.» verbatim (R6); the three Google-only rows
      (`VINCULO_REQUIERE_PASSWORD`, `GOOGLE_YA_VINCULADO`, `GOOGLE_NO_DISPONIBLE`) are confirmed
      **absent** from the mobile `CodigoPerfil` union — non-tautological, paired with a positive case
      proving a real code IS present (judgment-anticipated class 3; design §1.9).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test mensajes-perfil.spec.ts`
- [ ] **T4a.4 (GREEN)** Create `apps/mobile/src/domain/mensajes-perfil.ts` —
      `mensajeDeApiError(e, origen)` + `mensajeDeResultado(r)` per design §1.7/§1.9, ported from
      `apps/web/.../perfil/mensajes.ts:25-149` minus the three Google rows; `origen` narrows to
      `'perfil' | 'password'`; `mensajeDeResultado` keeps web's `const _exhaustive: never = r`
      totality guard (tsc-enforced).
      - Verify: `pnpm --filter @moneydiary/mobile test mensajes-perfil.spec.ts` — 11 green.
- [ ] **T4a.5 (REFACTOR + sweep)** Confirm `mensajes-perfil.ts` names `ApiError`/`copiaPorApiError`
      from `src/domain/api-error` (not `src/api/client`) — this is what D-04's dependency-direction
      fix makes possible without a `domain → api` runtime edge. Confirm `MENSAJE_DEMO_SOLO_LECTURA`
      is a named constant with one home (design §1.9).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR4a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~505 lines, 23 new tests. **Over 400-line budget** — `size:exception` candidate.

---

## Phase PR4b — Perfil tab UI

Requirements: MCFG-02, MCFG-03, MCFG-04. Depends on PR3b (route shell + `TabsConfiguracion`), PR4a
(`guardarPerfil`/`mensajeDe*`), PR2a (`patchPerfil`/`patchPassword` — the real `io` pair), PR3a
(`CampoTexto`).

- [ ] **T4b.1 (RED)** Create `apps/mobile/src/components/configuracion/PerfilPanel.spec.tsx`
      (~15 cases): renders `Nombre`/`Email`/`Password actual`/`Password nueva` (4× `CampoTexto`); a
      `null` email renders empty/placeholder without crashing (MCFG-02's own scenario); the Google
      block renders exactly one of `Vinculada: {email}` / `Vinculada` / `No vinculada`, **no**
      `Vincular`/`Desvincular` control — non-tautological, `Desvincular` absent AND
      `Vinculada`/`No vinculada` present via the identical query style (judgment-anticipated class 3);
      `Guardar cambios` submit paths, each asserted via `jest.mock('../../api/perfil')` spies, never
      a `Pressable` prop-identity probe (judgment-anticipated class 4): nombre-only sends one
      request; email change requires + sends `passwordActual`; a profile failure renders
      `mensajeDeApiError` and never calls `patchPassword`; a password failure after a profile success
      renders the partial-success copy and leaves `Nombre`/`Email` showing the saved values; a full
      success renders «Cambios guardados. Se cerraron tus otras sesiones.»; message regions use
      `liveRegion` (ok) / `role="alert"` (error) per design §0's composition tree.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test PerfilPanel.spec.tsx`
- [ ] **T4b.2 (GREEN)** Create `apps/mobile/src/components/configuracion/PerfilPanel.tsx` — form
      (4× `CampoTexto`) + `GoogleEstado` read-only pill + 2 message regions, wired to `guardarPerfil`
      with the real `{patchPerfil, patchPassword}` io pair.
      - Verify: `pnpm --filter @moneydiary/mobile test PerfilPanel.spec.tsx` — 15 green.
- [ ] **T4b.3** In `apps/mobile/app/configuracion.tsx`, replace PR3b's Perfil-tab placeholder with the
      real `<PerfilPanel me={...} />` (mechanical wiring, no new test file — covered by re-running
      `app/configuracion.spec.tsx`'s existing phase-switch cases).
      - Verify: `pnpm --filter @moneydiary/mobile test app/configuracion.spec.tsx` — still green, no regressions.
- [ ] **T4b.4 (REFACTOR + sweep)** Confirm `PerfilPanel` never imports `fetchMe`/`esMeDto` — it only
      consumes the already-resolved `me` prop (design §0: route owns fetch, components are pure
      presentation). Confirm no server `message` string is ever rendered — grep for
      `error.message`/`body.message` usage in this file; expect zero matches.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR4b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~405 lines, 15 new tests. Marginally over 400 — `size:exception` candidate.

---

## Phase PR5a — Catálogo domain helpers

Requirements: MCTG-01, MCTG-06, MCFG-MCTG-08. Depends on PR2b (`catalogo-constantes.ts`,
`CatalogoDto`/`CategoriaDto` types).

- [ ] **T5a.1 (RED)** Create `apps/mobile/src/domain/agrupar-categorias-por-bucket.spec.ts`
      (~7 cases): the exact group sequence `['Necesidades','Deseos','Ahorro']` (+`'Otros'` last for
      unrecognised buckets) via **array equality**, never `toContain` — judgment-anticipated class 2;
      empty groups dropped; unrecognised bucket values collected into a trailing `'Otros'` group
      rather than rejected (MCFG-MCTG-08's "server-unknown bucket still lists" scenario). `[P]` with
      T5a.3 (disjoint files).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test agrupar-categorias-por-bucket.spec.ts`
- [ ] **T5a.2 (GREEN)** Create `apps/mobile/src/domain/agrupar-categorias-por-bucket.ts`, ported
      verbatim from `apps/web/src/domain/agrupar-categorias-por-bucket.ts:32-47` (design §1.6): fixed
      `BUCKETS_ASIGNABLES` order, empty groups dropped, trailing `'Otros'`.
      - Verify: `pnpm --filter @moneydiary/mobile test agrupar-categorias-por-bucket.spec.ts` — 7 green.
- [ ] **T5a.3 (RED)** Create `apps/mobile/src/domain/plural.spec.ts` (~6 cases): `etiquetaPatrones` —
      3 forms (`sin patrones`/`1 patrón`/`N patrones`); `etiquetaTransacciones` — 2 forms. `[P]` with
      T5a.1.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test plural.spec.ts`
- [ ] **T5a.4 (GREEN)** Create `apps/mobile/src/domain/plural.ts`, ported verbatim from
      `apps/web/.../categorias/plural.ts:12-26`.
      - Verify: `pnpm --filter @moneydiary/mobile test plural.spec.ts` — 6 green.
- [ ] **T5a.5 (RED)** Create `apps/mobile/src/domain/mensajes-catalogo.spec.ts` (~9 cases): one
      runtime case per `CodigoCatalogo` member in `COPY` where meaningfully distinguishable, plus a
      **compile-time** totality assertion that an unmapped `CodigoCatalogo` member fails `tsc`
      (MCTG-06's own scenario — state explicitly in the test file which cases are runtime vs. a
      type-level `// @ts-expect-error`-style check, do not conflate the two); `403
      DEMO_SOLO_LECTURA` maps to the same copy row **defensively** (CQ-4, MCTG-06's second scenario)
      — not a generic fallback; an unmapped/unknown code → the generic fallback string.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test mensajes-catalogo.spec.ts`
- [ ] **T5a.6 (GREEN)** Create `apps/mobile/src/domain/mensajes-catalogo.ts` — `CodigoCatalogo`
      (12 members) + `COPY: Record<CodigoCatalogo, string>` (verbatim web strings) +
      `ETIQUETA_MATCH_TYPE`, ported from `apps/web/.../categorias/mensajes-catalogo.ts:33-163`;
      `mensajeDeErrorCatalogo(e)` resolves by axis (D-08 — same rule as PR4a's `mensajeDeApiError`).
      - Verify: `pnpm --filter @moneydiary/mobile test mensajes-catalogo.spec.ts` — 9 green.
- [ ] **T5a.7 (REFACTOR + sweep)** Confirm `mensajes-catalogo.ts` reuses `copiaPorApiError` for the
      three transport tags (D-08, DRY with PR4a's `mensajes-perfil.ts` — same resolution rule,
      different code table). Confirm `MATCH_TYPES`/`BUCKETS_ASIGNABLES` from PR2b's
      `catalogo-constantes.ts` are the single source for both this file and `categorias.ts`'s
      write-payload unions (no duplicate literal array).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR5a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~390 lines, 22 new tests. Under budget.

---

## Phase PR5b — Categorías list

Requirements: MCTG-01, MCFG-MCTG-08. Depends on PR5a (grouping + plural helpers), PR2b
(`fetchCatalogo`), PR3b (route shell's Categorías-tab placeholder).

- [ ] **T5b.1 (RED)** Create `apps/mobile/src/components/configuracion/CategoriaFila.spec.tsx`
      (~6 cases): renders `nombre` + `etiquetaPatrones(n)` tag; is a `Pressable` calling
      `router.push('/categoria/{id}')` on tap (assert via the `expo-router` mock's `push` spy, never
      a prop-identity probe); **no delete icon, no row-level `Alert`** (D-12) — non-tautological:
      `Eliminar` absent on this row, cross-referenced with PR6a's positive case on the edit screen
      via the identical query (judgment-anticipated class 3); accessible name includes the category
      name.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test CategoriaFila.spec.tsx`
- [ ] **T5b.2 (GREEN)** Create `apps/mobile/src/components/configuracion/CategoriaFila.tsx` —
      `Pressable` row (name + `etiquetaPatrones`), `router.push` only, per design §1.10/D-12.
      - Verify: `pnpm --filter @moneydiary/mobile test CategoriaFila.spec.tsx` — 6 green.
- [ ] **T5b.3 (RED)** Create `apps/mobile/src/components/configuracion/CategoriasPanel.spec.tsx`
      (~12 cases): groups render in fixed order `Necesidades → Gustos → Ahorro` with the display
      label (`ETIQUETA_BUCKET`, never the raw wire value `Deseos`) — MCTG-01's own scenario; ORDER
      pinning within a group via array/DOM-order assertion, never `toContain` (judgment-anticipated
      class 2); pattern-count tags render the 3 grammatical forms; hint line «Toca una categoría
      para editarla o eliminarla.» renders (D-13, mobile string variant); the empty state («Todavía
      no tienes categorías» / «Crea tu primera categoría…») renders when the catalog has zero
      categories, reusing `states/Empty`; a `Nueva categoría` toggle button renders (the inline form
      itself ships PR5c — this task asserts only that the toggle exists, KISS scope discipline).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test CategoriasPanel.spec.tsx`
- [ ] **T5b.4 (GREEN)** Create `apps/mobile/src/components/configuracion/CategoriasPanel.tsx` —
      groups via `agruparPorBucket`, `CategoriaFila` per row, empty state, `Nueva categoría` toggle
      revealing a placeholder until PR5c's real form lands.
      - Verify: `pnpm --filter @moneydiary/mobile test CategoriasPanel.spec.tsx` — 12 green.
- [ ] **T5b.5** In `apps/mobile/app/configuracion.tsx`, replace PR3b's Categorías-tab placeholder with
      the real `<CategoriasPanel catalogo={...} />` (mechanical wiring).
      - Verify: `pnpm --filter @moneydiary/mobile test app/configuracion.spec.tsx` — still green.
- [ ] **T5b.6 (REFACTOR + sweep)** Confirm `CategoriasPanel` never fetches on its own — the catálogo
      `{loading|error|data}` phase stays owned by `app/configuracion.tsx` (design §0 dependency
      rule). Confirm D-13's `movil` string variant is used everywhere web ships an
      `EtiquetaResponsiva`.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR5b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~425 lines, 18 new tests. **Over 400-line budget** — `size:exception` candidate.

---

## Phase PR5c — Nueva categoría (inline create)

Requirements: MCTG-02, MCTG-07 (negative: creation does not refresh the dashboard). Depends on PR5b
(`CategoriasPanel`'s toggle placeholder), PR2b (`crearCategoria`), PR3a (`CampoTexto`/
`SelectorChips`).

- [ ] **T5c.1 (RED)** Create `apps/mobile/src/components/configuracion/NuevaCategoriaForm.spec.tsx`
      (~9 cases): renders `nombre` (`CampoTexto`) + `bucket` (`SelectorChips`), both required — submit
      is disabled/no-op with either empty; a valid submit calls `crearCategoria({nombre, bucket})`
      (spy via `jest.mock`, never a prop-identity probe); success closes the form and triggers the
      catálogo re-fetch (assert via a passed `onCreada` callback, not a global re-mount); a failure
      renders `mensajeDeErrorCatalogo` and keeps the form open/retryable; **`solicitarRecargaResumen()`
      is NOT called on a successful creation** — MCTG-07's negative-1 scenario (judgment-anticipated
      class 5), asserted against the REAL `resumen-refresh` module, never mocked away.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test NuevaCategoriaForm.spec.tsx`
- [ ] **T5c.2 (GREEN)** Create `apps/mobile/src/components/configuracion/NuevaCategoriaForm.tsx` —
      inline form at the top of the list (design §1.10, not a route — a not-yet-created categoría
      has no id and cannot own patterns).
      - Verify: `pnpm --filter @moneydiary/mobile test NuevaCategoriaForm.spec.tsx` — 9 green.
- [ ] **T5c.3** In `apps/mobile/src/components/configuracion/CategoriasPanel.tsx`, replace PR5b's
      toggle placeholder with the real `NuevaCategoriaForm` (mechanical wiring; extend
      `CategoriasPanel.spec.tsx` with 1 integration case: the toggle reveals the real form, not the
      placeholder).
      - Verify: `pnpm --filter @moneydiary/mobile test CategoriasPanel.spec.tsx NuevaCategoriaForm.spec.tsx`
- [ ] **T5c.4 (REFACTOR + sweep)** Confirm the creation path never imports `solicitarRecargaResumen`
      at all — D-11's rule is "consumer-only, called after a bucket change", and zero-import is a
      stronger, more mechanically-checkable guarantee than "calls it and it happens to be a no-op".
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR5c gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~210 lines, 9 new tests. Under budget.

---

## Phase PR6a — Edit route + identity form

Requirements: MCTG-03 (identity-commit half), MCTG-07 (negative: rename-only does not refresh).
Depends on PR3b's route registration, PR2b (`fetchCatalogo`, `actualizarCategoria`), PR3a (field
components).

- [ ] **T6a.1 (RED)** Create `apps/mobile/app/categoria/[id].spec.tsx` (~13 cases): the route's own
      `GET /api/categorias` fetch (D-09, no shared cache) + resolve-by-id; the 4 states from design
      §1.11 — loading · error(+back link) · **id absent** → «Esa categoría ya no existe.» rendered
      as a `status`, **not** `role="alert"` (a stale deep link is not a failure of the action just
      taken) · loaded; «Volver a Categorías» renders and navigates back (D-03).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test app/categoria/[id].spec.tsx`
- [ ] **T6a.2 (GREEN)** Create `apps/mobile/app/categoria/[id].tsx` — own fetch, resolve-by-id, the 4
      states, on-screen back.
      - Verify: `pnpm --filter @moneydiary/mobile test app/categoria/[id].spec.tsx` — 13 green.
- [ ] **T6a.3 (RED)** Create `apps/mobile/src/components/configuracion/EditarCategoria.spec.tsx`
      (~9 cases — identity form + footer ONLY; both `Alert.alert` flows are stubbed to PR6b): identity
      draft (`nombre`, `bucket`) seeds from the resolved row; `Nombre` field edits stay local until
      `Guardar`; **`Eliminar categoría` control is present** on this screen — non-tautological,
      paired with PR5b's "absent on the list" case via the identical query (D-12,
      judgment-anticipated class 3); `Bucket` clean + `Guardar` → `actualizarCategoria({nombre,
      bucket})` sent directly, no confirmation (design §1.11's "bucket clean" branch — the
      bucket-dirty branch is PR6b's `Alert` flow, a stub/no-op here); `Cancelar` discards the identity
      draft **and navigates back** (WCTG-04's shipped fix); **a rename-only save does NOT call
      `solicitarRecargaResumen()`** — MCTG-07's negative-2 scenario (judgment-anticipated class 5),
      asserted against the REAL `resumen-refresh` module — this is the first point in the chain
      where a real bucket-clean `PATCH` ships, so this is where the negative belongs.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test EditarCategoria.spec.tsx`
- [ ] **T6a.4 (GREEN)** Create `apps/mobile/src/components/configuracion/EditarCategoria.tsx` —
      identity form (`CampoTexto` "Nombre", `SelectorChips` "Bucket (obligatorio)") + footer
      (`Guardar`/`Cancelar`/`Eliminar categoría`, both confirms stubbed to PR6b);
      `PatronesSection` renders a placeholder until PR7.
      - Verify: `pnpm --filter @moneydiary/mobile test EditarCategoria.spec.tsx` — 9 green.
- [ ] **T6a.5 (REFACTOR + sweep)** Confirm the route's own fetch (D-09) never imports a shared
      catalog cache/query library (explicitly out of scope, proposal §2). Confirm the "id absent"
      state renders a `status`, not `role="alert"` (design §1.11's own distinction).
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR6a gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~585 lines, 22 new tests. **Over 400-line budget** — `size:exception` candidate, OR split further per design §5's own cut (route+states / identity form) if the reviewer prefers.

---

## Phase PR6b — Impact confirmations (bucket change + delete)

Requirements: MCTG-03 (bucket-change confirmation half), MCTG-05, MCTG-07 (positive + negative-3:
delete does not refresh). Depends on PR6a (`EditarCategoria`'s stubbed confirm hooks), PR5a
(`mensajes-catalogo.ts` for a failed-confirm error).

- [ ] **T6b.1 (RED)** Create `apps/mobile/src/domain/impacto-catalogo.spec.ts` (~10 cases): both
      `tipo`s (`eliminar-categoria`, `cambiar-bucket`) × `count>0`/`count===0` — three distinct frozen
      bodies (delete-with-transactions, delete-zero, bucket-change), asserting the **exact frozen
      lines** from proposal §3 verbatim; the zero case **softens the sentence, never skips the
      confirmation** (the union always returns a full `{titulo,lineas,textoConfirmar}`, never an
      early-exit); closed by a `const _exhaustive: never` guard (tsc-enforced totality, same
      discipline as `mensajeDeResultado`).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test impacto-catalogo.spec.ts`
- [ ] **T6b.2 (GREEN)** Create `apps/mobile/src/domain/impacto-catalogo.ts` — `ImpactoCatalogo` union
      + `fraseDeImpacto`, ported verbatim from `apps/web/.../categorias/mensajes-catalogo.ts:180-247`
      (design §1.6).
      - Verify: `pnpm --filter @moneydiary/mobile test impacto-catalogo.spec.ts` — 10 green.
- [ ] **T6b.3 (RED)** In `apps/mobile/src/components/configuracion/EditarCategoria.spec.tsx`, add +11
      cases (both `Alert.alert` flows, `jest.spyOn(Alert, 'alert')` per design §3): a dirty `Bucket`
      + `Guardar` opens the impact `Alert.alert` with the exact `{titulo, lineas.join('\n')}` and a
      `style:'destructive'` confirm + `style:'cancel'` cancel (design §1.11) BEFORE any `PATCH` fires
      (MCTG-03's own scenario); dismissing without confirming issues **zero** requests; confirming
      calls `actualizarCategoria` then **`solicitarRecargaResumen()`** — MCTG-07's positive scenario
      (D-11), asserted against the REAL `resumen-refresh` module; `Eliminar categoría` opens the
      delete `Alert.alert` sourced from the already-loaded `transaccionesCount` (never a fresh
      fetch — MCTG-05); the zero-transaction case still opens the confirm, softened wording;
      confirming calls `eliminarCategoria` and treats every response as `204`-successful (no branch
      on a `409`); **a successful delete does NOT call `solicitarRecargaResumen()`** — MCTG-07's
      negative-3 scenario (D-11); a post-confirm failure (either flow) renders in the screen's own
      `role="alert"` region, not inside the dismissed `Alert` (R5, design §1.11's residual).
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test EditarCategoria.spec.tsx`
- [ ] **T6b.4 (GREEN)** In `apps/mobile/src/components/configuracion/EditarCategoria.tsx`, wire both
      `Alert.alert` flows per design §1.11's exact shape; `solicitarRecargaResumen()` called only
      from the bucket-change confirm's success path (D-11); post-confirm failures render in an
      `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` region (the
      `subir.tsx:230-238` idiom).
      - Verify: `pnpm --filter @moneydiary/mobile test EditarCategoria.spec.tsx` — 20 green (9 from PR6a + 11 new).
- [ ] **T6b.5 (REFACTOR + sweep)** Confirm neither the `snapshotAlAbrirDialogo` freeze nor a
      `disabled`/focus-restore matrix was ported (D-15 — `Alert.alert`'s own modality IS the
      freeze). Confirm `transaccionesCount` is read from the already-loaded DTO in both call sites,
      never re-fetched.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR6b gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~395 lines, 21 new tests. Under budget.

---

## Phase PR7 — Patrones (section + per-row confirm)

Requirements: MCTG-04, MCTG-07 (negative-4: pattern mutations do not refresh), MCFG-MCTG-08. Depends
on PR6a/PR6b (`EditarCategoria`'s `PatronesSection` placeholder), PR2b (`crearPatron`/
`actualizarPatron`/`eliminarPatron`), PR3a (`SelectorChips` for `matchType`).

- [ ] **T7.1 (RED)** Create `apps/mobile/src/components/configuracion/PatronesSection.spec.tsx`
      (~8 cases): existing rows render BEFORE new placeholder rows — ORDER pinning
      (judgment-anticipated class 2, the `PatronesSection` half); «Sin patrones: solo asignación
      manual.» renders **always**, identical whether the category has 0 or 3 patterns (MCTG-04's own
      scenario, non-tautological — assert the identical string in both renders); the `Agregar`
      button (accessible name `Agregar patrón`) appends a new placeholder row with **zero** requests
      until its own confirm; `matchType` chips use `ETIQUETA_MATCH_TYPE` labels (`CONTIENE`/`EMPIEZA
      CON`/`REGEX`), not the raw wire values.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test PatronesSection.spec.tsx`
- [ ] **T7.2 (GREEN)** Create `apps/mobile/src/components/configuracion/PatronesSection.tsx` —
      existing rows + append-only placeholder rows, «Sin patrones…» note always rendered.
      - Verify: `pnpm --filter @moneydiary/mobile test PatronesSection.spec.tsx` — 8 green.
- [ ] **T7.3 (RED)** Create `apps/mobile/src/components/configuracion/PatronFila.spec.tsx`
      (~14 cases — the 4-state row machine from design §1.12): `limpio` state hides the confirm
      control; editing → `sucio`, confirm control shows "Guardar patrón"; **new row** (no `id`):
      confirm → `crearPatron` (`prioridad` never in the payload — binding decision 3); delete on a
      new/uncommitted row = discard, **zero requests** (structural, stronger than "no confirmation
      needed"); **existing row**: confirm → `actualizarPatron`, the committed baseline advances
      **only on success** (a failed patch stays `sucio`/retryable — reject the mock, then retry with
      a resolved mock); delete on an existing row → `eliminarPatron` with **no confirmation dialog**
      — assert `Alert.alert` is never called for this path, non-tautological, paired with PR6b's
      delete-categoría case which DOES call it (judgment-anticipated class 3); `enviando` disables
      both fields and controls while the mutation is in flight; `error` renders inline `role="alert"`
      under the row, row stays `sucio`/retryable; the REGEX hint («Esa expresión regular podría no
      ser válida.») is a hint, never a gate — a REGEX pattern the device's `RegExp` engine flags
      still submits (D-12); **adding, editing, or deleting a pattern does NOT call
      `solicitarRecargaResumen()`** — MCTG-07's negative-4 scenario (judgment-anticipated class 5),
      asserted against the REAL `resumen-refresh` module for at least the add and the delete path.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test PatronFila.spec.tsx`
- [ ] **T7.4 (GREEN)** Create `apps/mobile/src/components/configuracion/PatronFila.tsx` — the
      `limpio|sucio|enviando|error` state machine per design §1.12; `SelectorChips` for `matchType`
      (3 chips, D-17); REGEX hint as advisory text only.
      - Verify: `pnpm --filter @moneydiary/mobile test PatronFila.spec.tsx` — 14 green.
- [ ] **T7.5** In `apps/mobile/src/components/configuracion/EditarCategoria.tsx`, replace PR6a's
      `PatronesSection` placeholder with the real component (mechanical wiring; extend
      `EditarCategoria.spec.tsx` with 1 integration case: pattern commits are independent of the
      categoría's own `Guardar`, and `Cancelar` discards only the identity draft — MCTG-03's own
      "already-committed pattern survives Cancelar" scenario).
      - Verify: `pnpm --filter @moneydiary/mobile test EditarCategoria.spec.tsx PatronesSection.spec.tsx PatronFila.spec.tsx`
- [ ] **T7.6 (REFACTOR + sweep)** Confirm none of web's blur machinery (pointer-intent refs, deferred
      `setTimeout` replay, focus-restore ref/effect) exists anywhere in `PatronFila.tsx` (D-14 — the
      removal is the point, not an oversight). Confirm `prioridad` is grep-absent from every pattern
      payload across `categorias.ts` and `PatronFila.tsx`.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR7 gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~535 lines, 22 new tests. **Over 400-line budget** — `size:exception` candidate, OR split further (section+placeholder rows / the row state machine) per design §5.

---

## Phase PR8 — Entry point (gear) + icon dependency

Requirements: MCFG-01 (gear), CQ-2. Depends on ALL prior phases — **D-18: the gear lands LAST**, so
every intermediate slice (PR1–PR7) stays unreachable/inert from the UI until this PR merges.

- [ ] **T8.1** `apps/mobile/package.json` — run `npx expo install lucide-react-native` (CQ-2,
      ADR-027) so Expo resolves the SDK-57-compatible line; `react-native-svg` is already a direct
      dep. Non-test, 1 line.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`
- [ ] **T8.2** `apps/mobile/jest.config.js` — extend `transformIgnorePatterns` for
      `lucide-react-native` (ESM), in the **same slice as the gear** (design §3 seam 2, §5 cross-slice
      ordering constraint) — otherwise every spec rendering `Header` breaks, including
      `app/index.spec.tsx` and `test/auth-navigation.integration.spec.tsx`. Land T8.1/T8.2 together,
      before T8.3/T8.4.
      - Verify: (re-checked by T8.5 once the real import lands)
- [ ] **T8.3 (RED)** Create `apps/mobile/src/components/Header.spec.tsx` (~6 cases — **first spec for
      this file**, ripgrep-verified none exists today): the gear renders with
      `accessibilityRole="button"`, `accessibilityLabel="Configuración"`; tapping it calls
      `router.push('/configuracion')`; the `☰`/`'Abrir menú'` stub is gone (grep-verify in this task
      that `'Abrir menú'` appears in no `.maestro` file, per design §4, before removing it); the
      avatar stays an inert `image`, untouched (D-02); the `Settings` icon is imported per-icon, not
      via a barrel import.
      - Verify (expect RED): `pnpm --filter @moneydiary/mobile test Header.spec.tsx`
- [ ] **T8.4 (GREEN)** `src/components/Header.tsx` — replace the inert `☰` with a lucide `Settings`
      gear doing `router.push('/configuracion')` (design §1.14/D-02); avatar untouched.
      - Verify: `pnpm --filter @moneydiary/mobile test Header.spec.tsx` — 6 green.
- [ ] **T8.5 (REFACTOR + sweep)** Full-suite regression: confirm `app/index.spec.tsx` and
      `test/auth-navigation.integration.spec.tsx` (both render `Header` in their tree) still pass
      with the real `lucide-react-native` import + the widened `transformIgnorePatterns` (design §3
      seam 2's stated risk). Confirm the two new routes (`configuracion`, `categoria/[id]`) are now
      reachable from the UI for the first time in the chain — the D-18 milestone: every PR1–PR7 slice
      was inert dead code on `main` until this task.
      - Verify: `pnpm --filter @moneydiary/mobile exec tsc --noEmit`; `pnpm --filter @moneydiary/mobile test` full suite green.

**PR8 gate:** `pnpm --filter @moneydiary/mobile test && pnpm --filter @moneydiary/mobile exec tsc --noEmit` — ~116 lines, 6 new tests. Under budget.

---

## Phase 9 — Closing tasks

Depends on all 14 prior slices landing (on `main`, per whichever chain strategy is resolved at the
apply gate — resolved: stacked-to-main, see Review Workload Forecast).

- [ ] **T9.1** Full mobile battery: `pnpm --filter @moneydiary/mobile test` (full suite) ·
      `pnpm --filter @moneydiary/mobile exec tsc --noEmit` · `pnpm --filter @moneydiary/mobile lint`.
      Do not pipe test output through `rg`/`grep` in a way that masks the exit code — run each
      command standalone and read its own exit status.
- [ ] **T9.2 (Wireframe conformance pass)** On the EAS internal build or Expo Go (ADR-022), compare
      the rendered screens against wireframes M1 (Perfil), M2 (Categorías), M3 (Editar categoría).
      Record pass/fail per acceptance criterion (CA-01..CA-05, proposal §1) in this task's completion
      note.
- [ ] **T9.3 (Manual/EAS checklist — NOT a CI gate)**
      - `useFocusEffect`'s re-focus refetch is Maestro/manual ONLY (design §3 seam 1 — RNTL cannot
        simulate a real re-focus without a navigator; the mount-fire path is what T3b.4's mock
        covers — do not attempt to fake the re-focus itself with a unit/RNTL test).
      - Confirm both `Alert.alert` confirmation flows (bucket change, delete categoría) read
        correctly on-device — native modal chrome differs between iOS/Android and the mocked
        assertions.
      - Confirm the `lucide-react-native` `Settings`/`Trash2` icons render correctly on both
        platforms.
      - Log the device/build used and the result here.
- [ ] **T9.4 (Ledger reconciliation)** Record REAL final line/test counts per slice vs. design §5's
      forecast (~5 340 lines / 14 slices) — same discipline as US-050's closing phase. Note any
      divergence before archiving; do not let the ledger go stale.
- [ ] **T9.5** Confirm no backend/schema/contract change shipped: zero edits under `apps/api`, zero
      `openapi.json` change, zero edits under `apps/web` (proposal §5/§9's explicit boundary); zero
      Prisma migration introduced.
- [ ] **T9.6** Confirm ADR-038's status flips from `🔵 Propuesto` to `✅ Decidido` once PR1 merges
      (per its own "Fecha de decisión: pendiente" note) — update `docs/adr/README.md`'s ADR-038 row
      status accordingly.
- [ ] **T9.7** Engram/OpenSpec artifact sync: after the last PR in the chain merges, update
      `sdd/us-044-mobile-configuracion/apply-progress` in Engram and confirm this file's checkboxes
      reflect the final state before `sdd-archive`.
- [ ] **T9.8** Close issue **#278**, linking the merged PR chain (or the tracker-branch merge commit,
      per the chosen chain strategy).
