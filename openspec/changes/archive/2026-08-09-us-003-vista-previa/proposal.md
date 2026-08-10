# Proposal — US-003: Vista previa de datos antes de confirmar la carga

**Change:** `us-003-vista-previa` · **Issue:** [#155](https://github.com/Juargo/MoneyDiary/issues/155) · **Epic:** `epic:ingesta` · **MoSCoW:** `should`
**Store:** hybrid · **Scope:** `apps/api` + `apps/web` + `apps/mobile` (backend rich, thin clients — ADR-024)
**Sprint:** Sprint-10 "Cierre de ingesta"

> **Closure note (2026-08-09).** COMPLETED — shipped to `main` across all three
> clients: backend `POST /api/ingestas/preview` (PR #191), web two-phase preview
> UI (PR #192), mobile (PR #193), Maestro flows (PR #195). Issue #155 closed as
> completed on 2026-08-02 with the DoD verified (including T2.11, real browser
> flow). The task checkboxes for Slices 2–3 were never ticked at the time; they
> were checked off retroactively against those PRs when this change was archived.

---

## 1. Why / problem

Today the ingesta flow is **single-shot and irreversible-by-default**: the user picks a
cartola and `POST /api/ingestas` **parses, dedupes, persists and categorizes in one call**.
There is no seam to stop and look before the rows land in the database. If the user picked the
wrong file, an outdated cartola, or a file the parser interprets differently than they expect
(wrong bank detected, columns read the other way around), they only discover it **after** the
transactions have already polluted every derived money view — and their only recourse is to
delete the ingesta afterwards (US-018).

Web makes this worse: it currently shows a 5-row preview **after** persisting — the confirmation
comes too late to be a confirmation at all. Mobile shows only summary counts, no per-row view.

US-003 gives the user a **look-before-you-commit** step: upload → see a representative sample of
how the system read the file (bank, canonical columns, row count, first N rows) → **confirm** to
actually import, or **cancel** and walk away with **nothing persisted**. The value is trust and
error-prevention at the cheapest possible moment — before any write — for a financial dataset
where a wrong import is expensive to notice and undo.

Acceptance criteria this proposal serves:
- **CA-01** — the user chooses how many sample rows to see (10 / 25 / 50).
- **CA-02** — the sample shows the data **as the system will interpret it** (detected bank +
  canonical columns Fecha / Descripción / Cargo / Abono), not the raw file layout.
- **CA-03** — the user sees the total row count the file will contribute, then **confirms** to import.
- **CA-04** — on preview or cancel, **nothing is persisted** — no ingesta, no transacciones, no account upsert.

## 2. Scope — IN

| # | Item | Where |
|---|------|-------|
| a | **New `PreviewIngestaUseCase`** (application) — parallel to `ProcessIngestaUseCase`, composed **only** of the no-write collaborators: `IngestFile` → `DetectBank`/`DetectPdfBank` → `ValidateStructure`/`ValidatePdfStructure` → `NormalizeTransactions`/`NormalizePdfTransactions`. **No repository/persistence port injected**; **does NOT call `accountRepository.ensure()`**. | `apps/api/src/application/use-cases/preview-ingesta.use-case.ts` (new) |
| b | **New preview endpoint** (a distinct POST that parses the uploaded file and returns a sample **without persisting**), same multipart upload contract as `POST /api/ingestas`, behind the existing middleware chain | `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts` + a new preview DTO |
| c | **Preview DTO** — canonical headers only (Fecha / Descripción / Cargo / Abono), **BigInt-safe** (cargo/abono as string, mirroring `ingesta-response.dto.ts`). Backend caps the sample at **50 rows** and returns `totalFilasDatos` (total data rows the file would contribute) + detected `banco`. | `apps/api/src/infrastructure/http/dto/` (new preview DTO) |
| d | **New composition factory** `crearPreviewIngesta` alongside `crearProcessIngesta`, wired into `container.ts` | `apps/api/src/composition/crear-preview-ingesta.ts` (new) + `container.ts` |
| e | **Web two-phase UI** — move the existing preview **before** confirm: upload → preview (10/25/50 selector, sliced client-side from the ≤50 sample) → **Confirmar** re-uploads the **same file** to the existing `POST /api/ingestas`, or **Cancelar** discards | `apps/web/src/components/SubirCartola.tsx` + `apps/web/src/api/` (new preview hook + DTO type) |
| f | **Mobile two-phase UI** — greenfield per-row preview list + confirm/cancel; on confirm re-uploads the same file to the existing `POST /api/ingestas` | `apps/mobile/app/subir.tsx` + `apps/mobile/src/api/` (new preview client call + view-model) |

**Stateless re-upload (Approach A, locked).** Preview persists nothing; **confirm re-uploads the
SAME file bytes** to the **existing, unchanged** `POST /api/ingestas`. Zero new server state.

## 3. Scope — OUT (non-goals)

- **Editing the data in preview** — no inline correction of rows/columns/bank. Preview is read-only.
- **Viewing the full file** — preview is a **representative sample** (≤50 rows), not a paginated full-table view. "Ver el archivo completo" is explicitly out.
- **Filtering / searching / sorting** the preview rows.
- **Business-rule validation at preview** — no dedupe, no categorization, no semáforo/50-30-20 preview. Preview stops at **normalize**; dedupe + persist + categorize remain **only** on confirm inside the existing `POST /api/ingestas`.
- **Server-side staging** (Approach B: token/TTL temp store) — rejected; adds state, cleanup jobs, and new failure modes disproportionate to a `should` single-file flow.
- **Client-submitted parsed rows** (Approach C) — rejected; violates ADR-024 (backend is sole source of truth for money). The client re-sends **file bytes**, never parsed cargo/abono.
- **Configurable sample cap** — 50 is a hardcoded server constant (KISS/YAGNI; no requirement to make it configurable).
- **CLI preview** — the CLI keeps its single-shot flow; preview is a client-facing UX concern.

## 4. Recommended technical approach

**Two orchestrators, one shared set of stateless steps.** `PreviewIngestaUseCase` reuses the
exact same collaborators as `ProcessIngestaUseCase` up to and including normalize, then stops and
returns a sample. It is a **new class, not a refactor** of the existing pipeline — the existing
`POST /api/ingestas` path is untouched.

**CA-04 as a compile-time guarantee (the key design decision).** `PreviewIngestaUseCase` is
constructed with **zero DB/persistence ports** — no `IIngestaRepository`, no `PersistTransactions`,
and crucially **no `accountRepository.ensure()`** (that `ensure()` is an *upsert* — a WRITE — that
fires mid-pipeline in the current single-shot flow). Because the class has no way to reach the
database **by construction**, "nothing is persisted on preview/cancel" is not a runtime check that
could regress — it is **structurally impossible** to violate. This is a stronger guarantee than a
test, and it is the reason the preview path is a separate use case rather than a flag on the
existing one.

**Preview seam:** `IngestFile → (Detect → Validate → Normalize)` → build sample DTO. The
PDF-vs-Excel routing branch (`archivo.extension === '.pdf'`) is **duplicated** from
`ProcessIngestaUseCase` into the preview orchestrator. This is a conscious DRY concession
(see §5): the branch is ~15 lines selecting one of two trios; extracting a shared internal
`detectarYNormalizar` step is a valid *later* refactor once the second consumer proves the shape,
but per YAGNI/three-strikes it is not warranted for the first slice.

**Preview DTO:** canonical schema only. `Transaccion` never carries raw file headers forward, so
CA-02 ("as the system will interpret it") maps naturally to Fecha / Descripción / Cargo / Abono —
**no new port is needed** to surface raw bank column names, and surfacing them would in fact
contradict CA-02. Amounts are strings (BigInt-safe), mirroring `ingesta-response.dto.ts`.

**Row-count selector (CA-01):** backend caps the sample at **50** (the max selectable value) and
returns `totalFilasDatos`; the client slices 10 / 25 / 50 from the **same in-memory array** — no
re-request per selector change. This deliberately differs from confirm's DTO (which returns the
full persisted set) because preview's purpose is representative sampling only.

**The "same file on confirm" guarantee is client-side.** Approach A cannot *prove* server-side
that confirm re-uploads the previewed bytes (that is the cost of not staging). Mitigation: after a
successful preview, **gate the file picker** — the user cannot swap the file; they either Confirmar
(re-upload the held file) or Cancelar (release it and pick again). This keeps the guarantee simple
and local to the client, which is acceptable for a `should` MVP flow.

**Session / auth:** keep the existing middleware chain (`apiKey → session → error`) on the preview
endpoint for **consistency**, even though preview touches **no tenant data** (no account resolution,
no reads/writes scoped by `userId`). Dropping `userId` scoping on preview would be a special-case
divergence with no real benefit; keeping the middleware is simplest and matches every other route.
`userId` is available if a future requirement needs it, but the preview use case does not consume it.

**Files (concrete):**
- Application: `apps/api/src/application/use-cases/preview-ingesta.use-case.ts` (new) — input
  `{ fileReader }`, output `{ banco, estructura: { totalFilasDatos }, muestra: Transaccion[≤50] }`
  via `Result<T,E>`, never throws.
- Composition: `apps/api/src/composition/crear-preview-ingesta.ts` (new) + register in `container.ts`.
- Infrastructure: new preview route in `ingesta.routes.ts` (`registrar*` closure-DI pattern) +
  new preview DTO mapper in `infrastructure/http/dto/`.
- Web: `SubirCartola.tsx` reordered to preview-before-confirm; new `use-preview-ingesta.ts` hook +
  `PreviewIngestaDto` type in `apps/web/src/api/types.ts` (hand-written, ADR-011/012 debt).
- Mobile: `apps/mobile/app/subir.tsx` gains a preview list + confirm/cancel; new preview call in
  `apps/mobile/src/api/` + a small view-model in `apps/mobile/src/domain/` (pure formatting/slicing).

## 5. Impact / risks

- **Double parse (accepted).** Preview parses, then confirm re-parses the same file. At the ≤10MB
  in-memory-multer norm this is cheap and already the operating envelope; no measured latency
  problem exists to optimize against (YAGNI: don't cache/stage on speculation).
- **PDF/Excel routing duplication (accepted DRY tension).** The `esPdf` trio-selection branch now
  lives in two orchestrators. Acceptable per YAGNI/three-strikes; flagged for a possible
  `detectarYNormalizar` extraction **later**, not now. Design phase should note this so the second
  copy stays a faithful mirror (a divergence between the two would be a real bug).
- **"Same file on confirm" is a soft, client-side guarantee.** Inherent to Approach A. Mitigated by
  gating the picker post-preview. Not a data-integrity risk (confirm still fully re-validates the
  bytes it receives via the hardened `POST /api/ingestas`), only a UX-consistency risk.
- **Mobile greenfield cost.** Mobile has **no** per-row preview UI today — CA-02 on mobile is a
  larger lift than web (new list, accessibility/live-region wiring per existing `subir.tsx`
  conventions). This is the heaviest single item in the change and a candidate for its own PR.
- **Independence from US-004 (in-flight).** US-003 branches off `main` and reuses only
  detect/validate/normalize (unchanged by US-004). It does **not** touch the persist/failure path
  US-004 refactors. **The one contact point is the composition root**: US-003 adds a new
  `crear-preview-ingesta` factory alongside the existing one — a merge-awareness note, not a
  blocker.
- **No new PII surface / encryption trigger untouched.** Preview returns the same canonical fields
  the confirm response already exposes (descripción in memory only, never newly persisted). ADR-013
  column encryption (11.6) trigger is unchanged.

## 6. Open questions (for spec / design)

1. **Exact preview endpoint path + verb.** Candidates: `POST /api/ingestas/preview`, or a
   `POST /api/ingestas?dryRun=true` variant. Recommend a distinct sub-path (`/preview`) over a query
   flag on the persisting endpoint — keeps the no-write path visibly separate and avoids a boolean
   that changes whether a call has side effects. Decide in spec.
2. **Preview DTO field names/shape** — align with `ingesta-response.dto.ts` naming (`banco`,
   `estructura.totalFilasDatos`, sample array key). Lock in spec.
3. **Sample cap constant** — confirm `50` as a named server constant (e.g. `PREVIEW_SAMPLE_MAX`) and
   where it lives (application vs a shared constants module).
4. **Session scoping** — confirm the recommendation to keep `apiKey + session` middleware while the
   use case ignores `userId` (vs. an explicit public-preview decision).
5. **Bank-not-recognized / structure-invalid in preview** — preview surfaces the same domain errors
   the pipeline already produces (mapped to HTTP 400 with amount scrub). Confirm the error contract
   for the preview endpoint mirrors the confirm endpoint's boundary behavior.
6. **Mobile accessibility** — sample-list live-region + row semantics conventions to reuse from the
   existing mobile screens (design phase).

## 7. Delivery note (rough size — NOT a task plan)

Real weight across three workspaces; **chained/stacked PRs recommended** (400-line budget, ADR-020/030)
rather than one monolithic PR. Likely clean split:

- **Slice 1 — Backend preview (use case + endpoint + DTO + composition factory).** New
  `PreviewIngestaUseCase`, preview route, DTO mapper, `crear-preview-ingesta`, unit tests for the
  no-write path + the ≤50 cap + `totalFilasDatos`. Lands the contract first.
- **Slice 2 — Web two-phase UI.** Reorder `SubirCartola.tsx` to preview-before-confirm, selector,
  confirm/cancel, preview hook + DTO type.
- **Slice 3 — Mobile two-phase UI.** Greenfield preview list + confirm/cancel + preview client +
  view-model (heaviest client slice; may warrant its own PR).

Delivery strategy (`feature-branch-chain` vs `stacked-to-main`) and exact task breakdown are decided
at `sdd-tasks`, not here.
