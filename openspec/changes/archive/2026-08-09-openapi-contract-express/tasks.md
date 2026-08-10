# Tasks: OpenAPI Contract on Express (openapi-contract-express)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Slice 0: ~250-330 · Slice 1: ~300-400 · ADR docs: ~60-100 |
| 400-line budget risk | Slice 0: Medium · Slice 1: Medium-High · ADR docs: Low |
| Chained PRs recommended | Yes — design pre-slices this; not re-litigated here |
| Suggested split | PR 1 (Slice 0) → PR 2 (Slice 1) → PR 3 (ADR docs) → PR 4+ (rollout, future) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (each PR → `main`, per ADR-031) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Chain strategy and slicing were already fixed by the design (Slice 0 / Slice 1 / rollout) and the launch prompt; `ask-on-risk` does not require re-asking when the split is already resolved.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Registry + emit + CI + `GET /version` | PR 1 (stacked → main) | Near-zero money risk, proves toolchain end-to-end |
| 2 | `GET /api/resumen` query + response contract | PR 2 (stacked → main) | Go/no-go gate for the pattern; extra ADR-015 care |
| 3 | ADR-011 amendment + ADR-012 note | PR 3 (stacked → main) | Docs-only, lands once the mechanism is proven by PR 1+2 |
| 4+ | Rollout: remaining reads, then writes/auth | future PRs | One route file per slice, out of current scope |

## Phase 1: Slice 0 — Foundation

- [x] 1.1 Confirm exact `createDocument()`/`.meta()` call syntax for `zod-openapi@5.4.2` (Context7/npm docs) before writing any schema.
- [x] 1.2 Add `zod-openapi@5.4.2` (exact pin, no `^`) to `apps/api/package.json` dependencies.
- [x] 1.3 Create root `.prettierignore` with an entry for `apps/api/openapi.json` (prevents lint-staged/Prettier reformatting the emitted JSON and causing false drift).
- [x] 1.4 RED: write `apps/api/src/infrastructure/http-express/schemas/sort-keys-deep.spec.ts` — asserts `sortKeysDeep()` sorts object keys alphabetically recursively and preserves array element order.
- [x] 1.5 GREEN: implement `schemas/sort-keys-deep.ts`.

## Phase 2: Slice 0 — Schema + document builder

- [x] 2.1 RED: write `schemas/version.schema.spec.ts` — `versionResponseSchema.parse(buildInfo)` succeeds; rejects a shape missing a field.
- [x] 2.2 GREEN: create `schemas/version.schema.ts` (`{ version, commit, ref, builtAt }`, all strings).
- [x] 2.3 RED: write `schemas/openapi-document.spec.ts` — `buildOpenApiDocument()` is pure (no container/env/DB import), returns `openapi: '3.1.0'`, and registers `GET /version` with no auth/params.
- [x] 2.4 GREEN: create `schemas/openapi-document.ts` — `createDocument({ openapi: '3.1.0', info, paths })` via explicit, fixed-order route registration array (never iterate a mutable map).

## Phase 3: Slice 0 — Emit script + CI

- [x] 3.1 Create `apps/api/scripts/emit-openapi.ts` (mirrors `scripts/gen-env-example.ts`): imports `buildOpenApiDocument` + `sortKeysDeep`, writes `JSON.stringify(sorted, null, 2) + '\n'` to `apps/api/openapi.json`; `--check` mode regenerates in memory and diffs against the committed file, exits 1 on drift.
- [x] 3.2 Add `openapi:emit` and `openapi:check` scripts to `apps/api/package.json`.
- [x] 3.3 Run `pnpm api openapi:emit`, commit the generated `apps/api/openapi.json`.
- [x] 3.4 Add a step to the `api` job in `.github/workflows/ci.yml`, right after `Check .env.example is up to date`: `pnpm api openapi:check`.

## Phase 4: Slice 0 — Verification

- [x] 4.1 Run `pnpm api test`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check` — all green.
- [x] 4.2 Re-run `pnpm api openapi:emit` twice with no code changes and confirm byte-identical output (determinism check).

## Phase 5: Slice 1 — Schema (RED)

- [x] 5.1 Write `schemas/resumen.schema.spec.ts`: `resumenQuerySchema` accepts `{ periodo: undefined }` and a string, rejects an array/object; asserts it does NOT encode the `YYYY-MM` regex (transport shape only, not the domain rule).
- [x] 5.2 Same file: `resumenResponseSchema.parse()` succeeds on a real `aResumenMesDto(...)` fixture (money as string, `porcentajeBp: number|null`, lowercase `estadoSemaforo`/`estadoGlobal` enums, 4-entry `buckets`, `targets`); rejects a fixture with `totalIngreso` as a JSON number.

## Phase 6: Slice 1 — Boundary wiring (GREEN)

- [x] 6.1 Create `schemas/resumen.schema.ts` (query + response schemas per 5.1/5.2).
- [x] 6.2 In `resumen.routes.ts`, replace `queryString(req.query.periodo)` with `resumenQuerySchema.safeParse(req.query)`; on `!success` respond `res.status(400).json({ message: '<fixed message>' })` — never serialize `error.issues` (preserves the scrubbed-400 contract; existing `PeriodoInvalidoError` 400 path for malformed `YYYY-MM` stays unchanged).
- [x] 6.3 Register `GET /api/resumen` in `openapi-document.ts` with `resumenQuerySchema`/`resumenResponseSchema`.

## Phase 7: Slice 1 — Response sync guarantee

- [x] 7.1 Add a unit assertion (in `resumen.schema.spec.ts` or `resumen-mes.dto.spec.ts`) that feeds a real domain fixture through `aResumenMesDto(...)` and asserts `resumenResponseSchema.parse(output)` does not throw.
- [x] 7.2 Add an HTTP-level assertion in `app.resumen.spec.ts` (supertest against `createApp`) that parses the live 200 body with `resumenResponseSchema`.
- [x] 7.3 Add a boundary test: malformed transport shape (e.g. `periodo` as array) → 400 `{ message }`, no raw input echoed.

## Phase 8: Slice 1 — Regenerate + verify

- [x] 8.1 Run `pnpm api openapi:emit`, commit updated `apps/api/openapi.json`.
- [x] 8.2 Run `pnpm api test`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check` — all green.

## Phase 9: ADR docs (PR 3)

- [x] 9.1 Amend `docs/adr/ADR-011-contrato-first-openapi.md`: mechanism change only (`@nestjs/swagger` → `zod-openapi@5.4.2`, OpenAPI 3.1.0, schemas in `infrastructure/http-express/`); record the two original Zod-rejection reasons as moot and the 3.0.3→3.1 reversal + revisit trigger. Spanish prose matching existing ADR style; status stays amended, not superseded.
- [x] 9.2 Add a note to `docs/adr/ADR-012-packages-api-client.md`: `@nestjs/swagger`-era mechanics are dead (ADR-028); `packages/api-client` remains deferred (YAGNI); this change's `openapi.json` is its future input.

## Phase 10: Rollout (future PRs, coarse)

- [x] 10.1 Remaining reads: `/resumen/anual`, movimientos, transacciones GET, buckets — one route file + schema per slice, strict-TDD, `openapi:check` green each time.
- [x] 10.2 Writes/sensitive: auth, ingesta upload, reclasificar — extra ADR-015 TDD care, same pattern.
