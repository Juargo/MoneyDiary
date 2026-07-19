# Archive Report — us-013-categorias

**Date**: 2026-07-19
**Change**: us-013-categorias — Categorías por transacción (finer-grained classification layer between `PatronClasificacion` and `BucketPresupuesto`, manual reclassify endpoint + UI)
**Status**: ARCHIVED & CLOSED — shipped to production

## Executive Summary

US-013 (categorías por transacción) is complete, verified (PASS WITH WARNINGS, 0 CRITICAL), merged to `main`, and deployed to production. The full 6-slice chain (S1–S6, with S6 split into S6a/S6b) introduces a `Categoria` layer that every automatic classification now derives, adds a `userId`-isolated `PATCH /api/transacciones/:id/categoria` reclassify endpoint that can move money across 50/30/20 buckets with exact `BigInt` recompute, exposes `categoria` on the movimientos/detalle-bucket DTOs, and activates the previously-disabled "Editar categoría"/"Clasificar" web controls with a cross-bucket confirmation dialog. Production migrations were applied in order and the historical-transaction backfill ran successfully under a supervised, gated, double-opt-in production guard, preserving every existing `bucketId` while populating the new `categoriaId` column.

## What Shipped

### Slices (feature-branch-chain)

| Slice | Scope | Status |
|---|---|---|
| S1 | `Categoria` domain enum + `CATEGORIA_BUCKET` total map + `add_categoria` migration (nullable, structural only) + fixed-id seed dual-writing `bucketId`+`categoriaId` | ✅ Complete |
| S2 | `CategorizarTransaccionUseCase` flips to `{categoria, bucket}`; catalog repo reads `categoria`; writer persists both columns atomically; `drop_patron_bucketid` migration (categoriaId NOT NULL, bucketId dropped from `PatronClasificacion`) | ✅ Complete |
| S3 | `backfill-categorias.ts` — idempotent, `categoriaId IS NULL` scope, `--dry-run`, `ALLOW_DESTRUCTIVE_DB` gate | ✅ Complete (code + unit tests); production dry-run + apply completed post-verify (see below) |
| S4 | `PATCH /api/transacciones/:id/categoria` — `ReclasificarTransaccionUseCase` + userId-isolated Prisma writer + controller/module, merged 404 (anti-enumeration), 400 on unknown categoría | ✅ Complete |
| S5 | `categoria: {id,nombre}\|null` added to movimientos + detalle-bucket DTOs (additive, shared `foldCategoriaId()` helper) | ✅ Complete |
| S6a | Read-only categoría grouping in `BucketDetailList.tsx` (`agrupar-detalle-por-categoria`, BigInt-exact subtotals) | ✅ Complete |
| S6b | `ReclasificarCategoriaControl.tsx` — native `<select>` with `<optgroup>` per bucket, cross-bucket confirmation dialog (`role="alertdialog"`, names the exact money move), `use-reclasificar-categoria` mutation hook with query invalidation | ✅ Complete |

### Follow-up fixes discovered and applied during the same delivery arc

1. **`db-safety.ts` production-detection gap (CRITICAL, fixed pre-merge)**: `PROD_PATTERN` only matched literal "prod"/"production" substrings and never matched MoneyDiary's actual Supabase pooler host (`aws-1-us-west-2.pooler.supabase.com`, project `cpudmeahqjiuvpqvvizg`). This meant `ALLOW_DESTRUCTIVE_DB=1` would never have been blocked from running against the real production database, and the previously-added `allowProductionAck` opt-in was unreachable dead code. Fixed by adding a `SUPABASE_HOST_PATTERN` check ORed with the existing pattern, giving the double-opt-in guard (`ALLOW_DESTRUCTIVE_DB=1` **and** an explicit production acknowledgment) real teeth. 4 new tests added, all green. Full detail: Engram `sdd/us-013-categorias/apply-progress` (#294).
2. **Bridge migration reconciliation**: the shared Supabase instance had a pre-existing unrelated pending migration (`20260718120000_add_demo_trial_mode`) that had to be reconciled before `add_categoria_model` and `drop_patron_bucketid` could be applied in their required order (S1 schema + seed, then S2's NOT NULL tightening).
3. **Supervised production backfill**: with the db-safety fix and migrations in place, a human ran the backfill's `--dry-run` first, reviewed the printed summary, then ran it for real against production under the double-opt-in gate.
4. **Preserve-bucket outcome**: the production backfill run preserved every existing `Transaccion.bucketId` — no row's 50/30/20 bucket assignment changed as a side effect. Only the new, previously-null `categoriaId` column was populated (from the matching pattern, or left `null` for genuinely unmatched/SinCategoria rows). This is the conservative, honest behavior the `categoriaId IS NULL` backfill scope was designed to produce (spec CAT-05), and it is now recorded in the merged `categorias-model` spec as the confirmed shipped behavior.

### Production deploy outcome

- Schema migrations `20260719000000_add_categoria_model` and `20260719010000_drop_patron_bucketid` applied to production, in the required order, after reconciling the unrelated pending `add_demo_trial_mode` migration.
- Categoría catalog (8 fixed-id categorías) seeded.
- Historical transaction backfill executed successfully (dry-run reviewed, then applied) under the corrected `db-safety.ts` double-opt-in production guard — bucket-preserving, as described above.
- Reclassify endpoint and web control are live in production behind the existing `ApiKeyGuard` + `SessionGuard` chain.

## Delta Specs → Main Specs

| Domain | Action | Location | Notes |
|---|---|---|---|
| `categorias-model` | **Created** (new capability, no prior baseline) | `openspec/specs/categorias-model/spec.md` | 5 requirements (CAT-01..05), unchanged from the change's spec except CAT-05 gained a "shipped outcome" paragraph and a new scenario documenting the double-opt-in production guard, reflecting the `db-safety.ts` fix and the confirmed bucket-preserving production run. |
| `categorias-api` | **Created** (new capability, no prior baseline) | `openspec/specs/categorias-api/spec.md` | 5 requirements (CATAPI-01..05), copied as designed/verified — the shipped contract (`PATCH /api/transacciones/:id/categoria`, nombre-based body, merged 404) matched the spec with no drift. Added a short note on the shipped endpoint shape to the Purpose section. |
| `web-app` | **Created** (no `openspec/specs/web-app/` baseline existed — PR #75's earlier web-app spec was never merged) | `openspec/specs/web-app/spec.md` | 5 requirements (WCAT-01..05), delta framing (`## ADDED Requirements`) flattened to `## Requirements` since this is now the living spec. WCAT-04 was rewritten to describe the shipped cross-bucket confirmation dialog behavior (T6.0's guardrail — not in the original delta spec, added during S6b implementation) with two new scenarios (confirmation required + cancel leaves UI unchanged), replacing the original's silent-commit framing. |

## Archive Contents

- `proposal.md` ✅ (faithful copy, unmodified)
- `design.md` ✅ (faithful copy, unmodified)
- `tasks.md` ✅ (52/53 checked at end of `sdd-apply`/`sdd-verify`; T3.6 reconciled `[x]` at archive time — see below)
- `specs/categorias-model/spec.md` ✅
- `specs/categorias-api/spec.md` ✅
- `specs/web-app/spec.md` ✅
- `archive-report.md` ✅ (this document)

## Task Completion Gate — Exception Recorded

At the end of `sdd-verify`, `tasks.md` had 52/53 tasks checked; the sole exception was **T3.6** (`[verify]` manual dry-run of the backfill against a real DB), explicitly deferred per that session's guardrail against touching any real database. Per the `sdd-archive` skill's Task Completion Gate, this is exactly the situation requiring explicit orchestrator instruction plus documented proof before reconciling a stale checkbox at archive time.

**Reconciliation basis**: the change owner explicitly confirmed, at archive time, that (1) the full S1–S6b code is merged to the tracker branch and deployed, (2) production migrations were applied in the documented order, and (3) a human ran the supervised backfill (dry-run reviewed, then applied) against production, completing successfully and preserving all existing `bucketId` values. This production rollout occurred **after** `verify-report` (Engram #295) was written, so it is not independently captured inside this change's own prior Engram artifact trail (proposal/spec/design/tasks/verify-report/apply-progress all predate it) — the reconciliation rests on the owner's direct confirmation at archive time, not on a re-run automated check. This is recorded transparently in `tasks.md`'s new "Archive-time reconciliation" section and here, per the skill's allowance for exceptional, explicitly-instructed, explicitly-documented reconciliation. Nothing about the original session's own account of what it did or didn't execute was altered.

No CRITICAL issues existed in the verify report at any point; this reconciliation closes an operational/manual-verification gap, not a code defect.

## Residual / Human Verification Items (carried forward, not blocking)

These were flagged in `verify-report` (#295) as WARNING-tier, non-CRITICAL gaps. Some are now closed by the production rollout described above; the rest remain genuinely open and are **not** claimed as resolved by this archive:

1. ~~Gated integration suites not run against a real DB this cycle~~ — superseded: migrations were applied and the backfill ran against production per the confirmation above, though the specific gated int-spec files (`categorizacion.int-spec.ts`, `backfill-categorias.int-spec.ts`, `reclasificar-categoria.int-spec.ts`) were not reported as having been explicitly re-run as CI artifacts; their pure-logic unit-test coverage remains green and was the basis of the PASS verdict.
2. **Manual screen-reader (VoiceOver/NVDA) spot-check of the keyboard reclassify flow (WCAT-05)** — still **DEFERRED**, not performed. Automated keyboard-operability coverage (native `<select>`/`<button>`, `user-event` driven tests) is strong but is not a substitute for a live assistive-technology check. This is the one item this archive report does **not** claim as closed.
3. Manual curl matrix for the reclassify endpoint (T4.9, 200/404/400 cases) — deferred at verify time; superseded in spirit by the endpoint now being live and reachable in production, but no explicit curl-matrix artifact was produced.

**Recommendation**: track item 2 (screen-reader spot-check) as a small standalone follow-up task; it is the only remaining unverified acceptance criterion (WCAT-05) for this change.

## Artifact Traceability (Engram)

| Artifact | Topic Key | Observation ID |
|---|---|---|
| Decision (proposal precursor) | `sdd/us-013-categorias/proposal` | 289 |
| Spec | `sdd/us-013-categorias/spec` | 290 |
| Design | `sdd/us-013-categorias/design` | 291 |
| Tasks | `sdd/us-013-categorias/tasks` | 293 |
| Apply progress (db-safety fix + slice detail) | `sdd/us-013-categorias/apply-progress` | 294 |
| Verify Report | `sdd/us-013-categorias/verify-report` | 295 |
| Archive Report | `sdd/us-013-categorias/archive-report` | (this document) |

## SDD Cycle Complete

✅ Proposal defined and product decisions locked (#289)
✅ Specifications written (15 requirements across 3 domains) and spec-compliant
✅ Design decisions documented (derive-don't-accept invariant, migration ordering, backfill scope) and followed
✅ Tasks executed across 7 chained PR-sized slices (S1–S5, S6a, S6b), TDD throughout
✅ Implementation verified (PASS WITH WARNINGS, 0 CRITICAL) — Engram #295
✅ Production deploy completed: migrations applied in order, backfill run supervised and bucket-preserving, db-safety production-detection gap fixed
✅ Delta specs merged into `openspec/specs/{categorias-model,categorias-api,web-app}/spec.md` as the new source of truth
✅ Archive created and persisted (hybrid: filesystem + Engram)

**The us-013-categorias change is fully closed.** One residual, non-blocking human item remains open (WCAT-05 live screen-reader spot-check) and is recommended as a small standalone follow-up. Ready for the next change.
