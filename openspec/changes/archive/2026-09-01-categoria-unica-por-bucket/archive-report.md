# Archive Report: categoria-unica-por-bucket

**Change**: `categoria-unica-por-bucket` (ADR-042)
**Archived**: 2026-09-01, by `sdd-archive`
**Archived to**: `openspec/changes/archive/2026-09-01-categoria-unica-por-bucket/`
**Verification input**: `sdd-verify` — PASS WITH WARNINGS (0 CRITICAL, 2 WARNING), both warnings addressed by this archive (see below)

## Traceability — Engram observation IDs

| Artifact | Observation ID | Topic key |
|---|---|---|
| Proposal | #1153 | `sdd/categoria-unica-por-bucket/proposal` |
| Spec (delta summary) | #1154 | `sdd/categoria-unica-por-bucket/spec` |
| Design | #1155 | `sdd/categoria-unica-por-bucket/design` |
| Tasks | #1156 | `sdd/categoria-unica-por-bucket/tasks` |
| Apply progress | #1157 | `sdd/categoria-unica-por-bucket/apply-progress` |
| Verify report | #1160 | `sdd/categoria-unica-por-bucket/verify-report` |
| This archive report | (new) | `sdd/categoria-unica-por-bucket/archive-report` |

## What shipped

Five chained PRs on tracker branch `feat/categoria-unica-por-bucket`, chain strategy `feature-branch-chain`:

| PR | Branch | Scope | Status at archive time |
|---|---|---|---|
| PR1 | `feat/categoria-unica-pr1-contrato` | ADR-042 + backend reclassify contract → `categoriaId`, hard cutover | Implemented locally, 3 commits, **NOT merged, NOT pushed** |
| PR2 (#541 in the referenced numbering) | `feat/categoria-unica-pr2-web` | Web `ReclasificarCategoriaControl` id-keyed | Implemented locally, 4 commits, **NOT merged, NOT pushed** |
| PR3 (#542) | `feat/categoria-unica-pr3-mobile` | Mobile `ReclasificarMobileControl` id-keyed | Implemented locally, 2 commits, **NOT merged, NOT pushed** |
| PR4a (#543) | `feat/categoria-unica-pr4a-fixtures` | Test fixture helper (`categoriaIdDe`) + 8-file swap | Implemented locally, 1 commit (`567e8173`), **NOT merged, NOT pushed** |
| PR4b (#544) | `feat/categoria-unica-pr4b-constraint` | The bucket-scoped uniqueness constraint itself | Implemented locally, 8 commits (tip `49282bb6`, plus a 9th docs-only commit `2f820e2f` found by adversarial review), **NOT merged, NOT pushed** |

**IMPORTANT — none of the five PRs are merged to `main` as of this archive.** All work is complete and verified locally on the chain of branches above (PR1 → PR2/PR3 in parallel → PR4a → PR4b). Archiving now records specs, design, and tasks as the source of truth ahead of the merge, per the explicit instruction that this archive commit must land together with (not before) the code once the chain merges. The chain still needs to be pushed and its PRs opened/merged in order before the canonical specs edited here actually describe `main`'s runtime behavior.

## The load-bearing decision: identity before constraint

The reclassify wire contract (`nombre` → `categoriaId`, PR1–PR3) was migrated to id-keyed resolution **before** the DB uniqueness constraint was relaxed from `(userId, nombre)` to `(userId, bucketId, nombre)` (PR4a/PR4b). This ordering (design D-01) is a correctness invariant, not a scheduling preference: while `(userId, nombre)` is still unique, id-keying is a strict refinement of name-keying (exactly one row answers to any name), so PR1–PR3 are behaviour-preserving on the *current* schema and can deploy independently. Reversing the order would have opened a window in which two conditions held simultaneously — names ambiguous AND the write path resolving by name — with no exception, no `400`, and no log line: money would silently land in the wrong bucket and the 50/30/20 verdict would silently change. No commit in this chain ever contains both a name-keyed `Categoria` lookup on a write path and the relaxed index.

## The forbidden shape (D-05) and why it is forbidden

`findFirst({ where: { userId, nombre } })` is explicitly named in the design as the one edit that must never be made on the reclassify write path. It compiles, type-checks, and passes every pre-existing test — and it returns one of N same-named rows across buckets, chosen non-deterministically by the database, silently reclassifying a transaction into the wrong bucket with no exception and no log line. This is the silent money-misclassification class the project weights heaviest (ADR-015). The adopted shape, `findFirst({ where: { id: categoriaId, userId } })`, is safe by construction because `id` is the primary key — `WHERE "id" = $1 AND "userId" = $2` can match at most one row regardless of any unique index, so there is no N to choose from. `sdd-verify` independently confirmed via `rg "findFirst("` that the forbidden shape does not exist anywhere in `apps/api/src`, and the only remaining `userId_nombre` string occurrences repo-wide are negative assertions (asserting the old index does NOT exist) plus reviewer-facing comments naming the forbidden pattern.

## Adversarial review

Two rounds of `judgment-day` ran against this change, both **APPROVED**:

1. **PR1** (contract migration + ADR-042). No CRITICAL or unresolved findings recorded against the final state.
2. **PR4b** (the constraint). Found and fixed: two stale code comments (in `schema.prisma`'s model comment and `crear-categoria.use-case.ts`'s docblock) that still asserted the pre-ADR-042 `(userId, nombre)` invariant after the constraint had already been relaxed in code — fixed in a 9th, docs-only commit (`2f820e2f`) on top of PR4b's original 8 commits. This is the same category of defect this archive report's own "doc drift" sections below record for the canonical specs and root `CLAUDE.md` — comments/docs lagging behind a code or spec change is a recurring failure mode worth naming explicitly, not a one-off.

## Known open items carried forward

- **`e1ae3c2d` does not compile in isolation.** This is PR4b's commit 2 (`existeNombre` port+adapter signature change to a criterion object). By design, this commit alone produces exactly 2 compile errors at the two stale call sites (`actualizar-categoria.use-case.ts:76`, `crear-categoria.use-case.ts:87`), fixed by the very next commits (3 and 4). This is documented in PR #544's description as an expected, intentional intermediate state of the strict-TDD RED→GREEN sequence, not a defect — but it means a clean `git bisect` or a squash-merge that stops mid-sequence would break the build. A clean linear history requires either keeping all 8 (or 9) PR4b commits together, or an interactive rebase to fold the transiently-broken commits before merge. Flagged here so it is not rediscovered as a surprise at merge time.
- **DB rollback is asymmetric (design D-15).** Code-only rollback is always safe: reverting the PR chain leaves the app-layer `existeNombre` gate stricter than the (looser) DB index, the same relationship that exists today. DB-level rollback is NOT the inverse of the migration — `CREATE UNIQUE INDEX "Categoria_userId_nombre_key"` will fail outright the moment any user holds a cross-bucket duplicate name. Before any attempt to re-tighten the index, the deploy runbook must run the pre-rollback dedup query and resolve what it returns (rename or delete duplicates) — the index creation will otherwise abort:
  ```sql
  SELECT "userId", "nombre", count(*)
  FROM "Categoria" GROUP BY 1, 2 HAVING count(*) > 1;
  ```
  An empty result means the old index can be recreated safely; a non-empty result is a product decision (which duplicate survives, and what happens to transactions pointing at the other), not something a migration can decide automatically.
- **Case-insensitivity remains explicitly deferred (non-goal, unchanged by this change).** The app-layer `existeNombre` check compares case-insensitively (`mode: 'insensitive'`) while the DB unique index stays case-sensitive — a pre-existing mismatch that does not widen under the new `(userId, bucketId, nombre)` key, since the app-layer check is always the actual gate every write passes through. Revisit only if a write path is ever added that bypasses `existeNombre`.

## Doc drift found but NOT fixed by this change

- **Root `CLAUDE.md` ADR table drift (new finding, this archive).** Task 1.6.3 ("Add ADR-042 row to root `CLAUDE.md`'s ADR table") was checked off `[x]` in `tasks.md` and apply-progress claims it was done, but a fresh read of the live root `CLAUDE.md` at archive time shows its ADR table still ends at ADR-041 — **no ADR-042 row exists**. `docs/adr/README.md`'s ADR-042 row (task 1.6.2) IS present and correct, confirming the miss is specific to `CLAUDE.md`, not both docs. `sdd-archive` did NOT correct this, because editing `CLAUDE.md` is outside this phase's authorized scope (specs + change folder + report only, per the explicit archive brief's constraints). **Action needed**: a follow-up one-line edit to root `CLAUDE.md`'s ADR table, adding the ADR-042 row that already exists verbatim in `docs/adr/README.md`.
- **Root `CLAUDE.md` claims `openspec/specs/` holds 2 capabilities; it holds 29** (pre-existing drift, not introduced or worsened by this change; recorded here per the archive brief's explicit instruction to document it, not fix it).

## Spec merge performed by this archive

Delta specs from `openspec/changes/categoria-unica-por-bucket/specs/` were merged into the canonical specs under `openspec/specs/`:

| Domain | Action | Details |
|---|---|---|
| `catalogo-clasificacion-ownership` | Modified | CAT038-01 (uniqueness scoped to `(userId, bucket)`), CAT038-03 (validates resulting `(bucket, nombre)` pair) replaced in place; CAT037-04 replaced in place (id-keyed resolution, 6 scenarios, was 4); CAT037-01's uniqueness clause edited with a scoped supersede naming ADR-042/CAT038-13; CAT038-13 and CAT038-14 added |
| `web-app` | Added | WDM-10, WDM-11 inserted after WDM-09, before the WCTG-01 section |
| `mobile-detalle-mes` | Added | MDET-08 appended at end of file, after MDET-07 |
| `mobile-configuracion` | Added, renumbered | Delta's `MCTG-07` renumbered to **`MCTG-09`** at merge time — see next section |

### The `CAT037-01` partial prose edit (verify-report WARNING 1, resolved)

`openspec/specs/catalogo-clasificacion-ownership/spec.md` asserted the pre-ADR-042 invariant in two places, both now fixed:

- **CAT037-01's uniqueness clause** (`Categoria` MUST be unique per `(userId, nombre)`) — edited in place with a scoped supersede: the clause now reads `(userId, bucketId, nombre)`, names ADR-042/CAT038-13 as the superseding decision, and states explicitly that every OTHER CAT037-01 guarantee (NOT NULL `userId`, bootstrap-user ownership, no FK repointed by the migration) is unchanged and still binding. This follows the same scoped-supersede pattern this project already uses for ADR-038/039/040.
- **CAT037-04's reclassify-resolution prose** (previously: "resolve the target `Categoria` by the caller's own `(userId, nombre)` pair") — this was NOT a second manual edit inside CAT037-01; it lives inside the separate CAT037-04 requirement, which the delta spec already declared as a full `MODIFIED Requirement`. Merging that MODIFIED block per the normal Step 2 procedure (replacing the entire requirement body, title included) naturally rewrote this prose to id-based resolution `(id, userId)` as part of the ordinary merge — no separate manual edit was needed or performed beyond the standard MODIFIED-requirement replacement.

Self-verification: re-read both edited sections in the canonical file after the edits; no remaining instance of `Categoria` MUST be unique per `(userId, nombre)` exists in `openspec/specs/`, and the only remaining `(userId, nombre)` string occurrences in the merged file are explicit historical "(Previously: ...)" notes and the scoped-supersede sentence itself, both of which correctly describe the OLD, superseded state rather than asserting it as current.

### The `MCTG-07` ID collision (verify-report's numbering, resolved by renumbering)

The delta spec for `mobile-configuracion` (and `sdd-spec`'s own proposal/tasks references, including `sdd-verify`'s compliance matrix) labeled the new "NOMBRE_DUPLICADO copy is bucket-aware" requirement `MCTG-07`. At merge time, the canonical `openspec/specs/mobile-configuracion/spec.md` was found to **already contain** an unrelated, pre-existing `MCTG-07` — "Dashboard refresh after a bucket change" — added by an earlier, different change. This is an ID-numbering bug introduced during this change's `sdd-spec` phase (it did not check the canonical file's existing highest `MCTG-*` id before assigning a new one).

Resolution: `sdd-archive` renumbered this change's new requirement to **`MCTG-09`** when merging it into the canonical spec (appended at the end of the file, after the pre-existing `MCFG-MCTG-08`, preserving the existing physical order of all other requirements). No requirement content was altered by the rename — only the identifier and a short explanatory note pointing back to this report. The requirement's test coverage (`mensajes-catalogo.spec.ts:76`, exact `toBe()` literal match, confirmed compliant by `sdd-verify`) is unaffected, since it asserts string content, not a requirement ID. The archived delta spec under this folder still shows the original (as-authored) `MCTG-07` label for historical accuracy, with an archive-time note added explaining the rename.

**Recommendation for future changes**: `sdd-spec` should check the canonical spec file's existing highest requirement id for a domain before assigning new ADDED requirement numbers, not just the current change's own delta-in-progress numbering.

## Archived contents

- `proposal.md` ✅
- `design.md` ✅
- `tasks.md` ✅ — all implementation tasks (PR1–PR4b) checked `[x]`; cross-cutting `X.1`–`X.3` (owned by `sdd-archive`) also checked `[x]`, completed as part of this archive phase
- `specs/catalogo-clasificacion-ownership/spec.md`, `specs/web-app/spec.md`, `specs/mobile-detalle-mes/spec.md`, `specs/mobile-configuracion/spec.md` ✅ (delta specs, as-authored, with an archive-time note on the `mobile-configuracion` renumbering)

## Source of truth updated

The following canonical specs now reflect the new (id-keyed, bucket-scoped) behavior:
- `openspec/specs/catalogo-clasificacion-ownership/spec.md`
- `openspec/specs/web-app/spec.md`
- `openspec/specs/mobile-detalle-mes/spec.md`
- `openspec/specs/mobile-configuracion/spec.md`

**Caveat repeated for emphasis**: these canonical specs now describe behavior that exists on the local `feat/categoria-unica-pr4b-constraint` branch chain but is **not yet on `main`**. Per this archive's operating instructions, this archive commit is intended to land together with (not before) the code once the PR chain is pushed and merged, so the canonical specs never claim an invariant `main` does not yet enforce. Until that merge happens, treat the pre-archive canonical specs (recoverable from git history) as the ones actually describing production.

## Tooling limitation encountered during archive

`sdd-archive`'s available tools in this session were `Read`/`Edit`/`Write`/`Glob`/`mem_search`/`mem_get_observation` — no shell/`mv`/`rm` access. The change folder was therefore copied (via `Write`, using content already read via `Read`) to `openspec/changes/archive/2026-09-01-categoria-unica-por-bucket/`, but the original `openspec/changes/categoria-unica-por-bucket/` folder **could not be deleted** by this agent. **Manual follow-up required**: run `git rm -r openspec/changes/categoria-unica-por-bucket/` (or equivalent) before or as part of committing this archive, so the active changes directory does not retain a duplicate of an archived change.

## Status

**Intentional-with-warnings.** Both `sdd-verify` WARNINGs are resolved by this archive (the CAT037-01/CAT037-04 prose fix, and the apply-progress staleness is noted here as historical color, not blocking). One new drift was discovered during archive (root `CLAUDE.md`'s missing ADR-042 row) and is documented, not fixed, per this phase's scope. The change is otherwise complete: 0 CRITICAL findings across implementation and two adversarial review rounds, all implementation tasks checked, all four spec deltas merged. Remaining before this is truly "shipped": push and merge the 5-PR chain to `main`, delete the un-archivable old change folder, and apply the two follow-up doc fixes noted above.
