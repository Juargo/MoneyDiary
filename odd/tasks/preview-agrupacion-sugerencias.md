# Feature: preview-agrupacion-sugerencias

**Locator:** `odd/tasks/preview-agrupacion-sugerencias.md` · Engram mirror: `odd/preview-agrupacion-sugerencias/tasks`
**Branch:** `refactor/preview-agrupacion-sugerencias` (from `main` @ `e49cc9e8`)
**Mirror status:** saved via `engram save` CLI (#1350) — the MCP `mem_save` fails with ambiguous sessions.
**Origin:** advisory suggestions S1–S3 from the T2 review of `preview-agrupacion-categoria` (lineage `review-2f4c58f24ddbaf89`, PR #809).

## Objective

Close the three non-blocking suggestions left by the T2 review of the category-grouped import preview.

## Scope

- In: `apps/web/src/domain/agrupar-filas-por-categoria-sugerida.ts` (+ its test), `apps/web/src/components/PreviewMuestra.test.tsx`.
- Out: behavior changes visible to the user, API, mobile, the stress e2e completion signal (separate later work).

## Constraints

- TDD: **enabled** (source: `~/.claude/CLAUDE.md` "Strict TDD Mode: enabled"). Runner: `npx vitest run <file>` in `apps/web`; typecheck `npx tsc -b`.
- S3 pins behavior that already exists, so it cannot start RED: its proof is a mutation (break the guard → test RED → restore → GREEN).

## Tasks

- [x] **S1 — Deterministic group order** (route: delegated writer, with S2/S3). Groups in the same bucket with the same `categoriaNombre` (e.g. several "Categoría no disponible" fallbacks, or catalog loading/error) sort by `clave` as the final tiebreak instead of file order (`:167`).
- [x] **S2 — Stop splitting `clave` on `::`** (`:149`). Carry the original `bucket` / `categoriaId` alongside each accumulated group so an id containing `::` still resolves its catalog name.
- [x] **S3 — Component-level test for the focus-continuity guard** (`PreviewMuestra.tsx:206-213`). A user who deliberately leaves focus on `<body>` must not have focus pulled back to a row trigger by a later render.

## Acceptance criteria

- `tsc -b` exit 0, full web vitest green, eslint clean on touched files.
- S1 and S2 each have a test observed RED before the fix; S3 has a mutation proof.
- No user-visible change.

## Progress / evidence

- 2026-09-25: created.
- 2026-09-25: S1–S3 implemented (writer). S1 RED: group order followed file order (`[cat-x, cat-y]` vs `[cat-y, cat-x]`) → GREEN with `clave` tiebreak. S2 RED: id `cat::raro` resolved to "Categoría no disponible" instead of "Rareza" → GREEN with `resolverGrupoDeFila` carrying bucket/categoriaId. S3: positive + negative component tests pinned GREEN; mutation (capture never resets to null) → negative test RED; restored (`PreviewMuestra.tsx` diff empty). Writer: `tsc -b` 0; vitest 2259/2259; eslint clean. Parent spot check: `tsc -b` 0; 2 touched test files 43/43; `PreviewMuestra.tsx` unchanged. 3 files, +209/−15.

- 2026-09-25: commit `73a661fc`. RDD assess (base `main`): medium, under budget; stop hook flagged the PR slice → consent **granted** → 1-lens (reliability) review **approved**, acknowledged (lineage `review-ee9a628dc80112e8`). Two advisory suggestions fixed (user-authorized): R3-s1-test-precondition (S1 test now asserts both groups share the fallback name) and R3-clave-tiebreak-locale (tiebreak is ordinal; RED test with a soft-hyphen id that `localeCompare('es')` treats as equal → GREEN). Checks: `tsc -b` 0; vitest 2260/2260; eslint clean.

## Delivery

- Forecast well under 400 authored lines → single PR.

## Next step

Push and open the PR.
