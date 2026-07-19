# Proposal — US-013: Categorías por transacción

- Slug: `us-013-categorias`
- Type: LARGE feature (multi-slice, backend + web)
- Artifact store: hybrid (Engram `sdd/us-013-categorias/proposal` + this file)
- Delivery strategy: `ask-on-risk`
- Status: PROPOSAL ONLY (no specs/design/tasks/code)

---

## 1. Why / Problem

Today MoneyDiary classifies every transaction into exactly one of the **5 buckets**
(`Necesidades / Deseos / Ahorro / Ingreso / SinCategoria`). That is the right
granularity for the 50/30/20 traffic light, but it is **too coarse for the user to
understand or correct their own spending**:

- A `Necesidades` total of $850.000 tells the user nothing about whether it was
  supermarket, fuel, pharmacy, or transport. There is no "why".
- The classification is **100% automatic and unappealable**. The
  `categorizar-transaccion.use-case.ts` picks a bucket from a pattern match and
  **discards which pattern matched** — the user cannot fix a misclassification.
  `BucketDetailList.tsx` already ships a permanently-**disabled** "Editar categoría"
  button and a disabled "Clasificar" CTA on `SinCategoria` rows, both documented as
  *"deferred to US-013"*. This proposal is US-013: turn those placeholders into
  working controls.
- The exploration (`sdd/group-by-categoria-within-bucket/explore`, Engram #288)
  confirmed the **root cause**: a per-transaction "categoría" finer than `Bucket`
  **does not exist** in the schema, the API, or the domain. There is no `categoriaId`
  anywhere. Any "group by categoría" UI is impossible until this layer is built.

**Why now:** the web drill-down UX (US-015/016/017) and the paused PR #75 both want
to explain *what is inside a bucket*. Both are blocked on the same missing concept.
Building it once, properly, unblocks both and activates the long-promised manual edit.

**Success looks like:**
1. Every transaction carries a `categoriaId` (or explicit "sin categoría") that a
   human can read: "Supermercado", "Streaming", "Transporte".
2. Automatic classification derives the categoría from the matched pattern, and the
   bucket is derived from the categoría (never set independently).
3. The user can **reclassify** a transaction's categoría from the web UI, with
   `userId` isolation, and the 50/30/20 resumen recomputes when that move crosses a
   bucket boundary.
4. The dashboard drill-down shows, for a clicked bucket, its transactions **grouped
   by categoría** with per-categoría subtotal + count.

---

## 2. The model (decided)

Insert a **`Categoria`** layer between `PatronClasificacion` and `BucketPresupuesto`.
A categoría **belongs to exactly one bucket** and **inherits it**. A transaction
records **which categoría** classified it; its bucket is **derived** from the
categoría, never stored independently of it.

```
Chain (new):     PatronClasificacion ──▶ Categoria ──▶ BucketPresupuesto
Chain (today):   PatronClasificacion ─────────────────▶ BucketPresupuesto   (to be removed)

Transaccion.categoriaId ──▶ Categoria ──▶ (derives) bucket
```

### 2.1 ERD-ish sketch

```
BucketPresupuesto           Categoria                     PatronClasificacion
  id (PK)          1 ─── *    id (PK)            1 ─── *     id (PK)
  nombre                      nombre                         patron
                              bucketId (FK)  ───────┐        matchType
                                                    │        categoriaId (FK) ──┐
                              (belongs to 1 bucket) │        prioridad          │
                                                    │                           │
Transaccion                                         │   (pattern → categoria) ──┘
  id (PK)                                           │
  ...                                               │
  categoriaId (FK, nullable) ───▶ Categoria ────────┘  (categoria → bucket)
  bucketId (kept, see §7)
```

Key invariant: **`Transaccion.bucket === Transaccion.categoria.bucket`** whenever a
categoría is set. `bucketId` becomes a *derived cache* of `categoria.bucketId`, not an
independent field (see migration §7 and open question Q4 on whether to drop it).

### 2.2 Automatic assignment (categorización update)

`CategorizarTransaccionUseCase` today returns `{ bucket }` and throws away the matched
pattern. The change: return **`{ categoriaId, bucket }`** where `bucket` is derived
from the categoría of the matched pattern.

- `abono > 0 && cargo === 0` → Ingreso rule → categoría **"Ingreso"** (bucket Ingreso).
- Pattern match (priority asc, id asc tiebreak — unchanged) → the matched pattern's
  **categoría**; bucket = `categoria.bucket`.
- No match → **no categoría** (`categoriaId = null`) → bucket `SinCategoria`.

This preserves the existing "never throws, always ok, degrade to SinCategoria" contract
(LSP/OCP intact — we extend the return shape and the seed, we do not add a `switch`).

### 2.3 Manual assignment (full US-013)

Activate the disabled "Editar categoría" control: a **write endpoint** lets the user
set a transaction's categoría.

- `PATCH /api/transacciones/:id/categoria` (final shape decided in spec/design),
  body `{ categoriaId }`, **`userId` isolation enforced** (RNF-SEC-006): a user can only
  reclassify their own transactions, and only to a categoría that exists.
- **First-class consequence — reclassify can MOVE money between 50/30/20 buckets.**
  Because categoría → bucket, assigning a transaction to a categoría in a *different*
  bucket changes its bucket, which **changes the resumen** (§6). This is intended, not
  a side effect: the user reclassifying "Uber Eats" from Deseos-Delivery to
  Necesidades-Transporte MUST move that money out of the 30% and into the 50%. The UI
  must make this visible (the pie/traffic-light shifts) and the recompute must be exact.

---

## 3. Proposed taxonomy (derived from the seed — CORRECT ME)

Derived by grouping the existing `PATRON_CATALOG` entries in
`apps/api/prisma/seed.ts`. **Each categoría maps to exactly one bucket.** This table
IS the "define the categorías first" deliverable — the user should correct names,
splits, and bucket assignments before spec.

| Bucket | Categoría (proposed) | Patterns folded into it (from seed) |
|--------|----------------------|--------------------------------------|
| Necesidades | **Supermercado** | lider, jumbo, unimarc, santa isabel, tottus |
| Necesidades | **Combustible** | copec, shell |
| Necesidades | **Farmacia** | farmacia |
| Necesidades | **Salud** | isapre |
| Necesidades | **Transporte** | transantiago, bip |
| Deseos | **Streaming** | netflix, spotify, prime video |
| Deseos | **Delivery** | uber eats, rappi |
| Ahorro | **Inversión** | fintual, `^transf(?:erencia)?.*ahorro` |
| Ahorro | **Ahorro programado** | cuenta ahorro |
| Ahorro | **Previsión (AFP)** | afp |
| Ingreso | **Ingreso** | (none — set by the Ingreso rule, no pattern) |
| SinCategoria | *(none — null categoría)* | (unmatched transactions) |

Notes for the user to weigh in on:
- `Combustible`, `Farmacia`, `Salud`, `Transporte` could collapse or split further —
  this is the main product judgment call.
- `Inversión` vs `Ahorro programado` vs `Previsión` — three Ahorro categorías may be
  more than the MVP needs; could be a single **Ahorro** categoría. (YAGNI check.)
- `Ingreso` as a single categoría keeps the model uniform (every non-SinCategoria
  transaction has a categoría). Alternative: Ingreso stays category-less like
  SinCategoria. Q3.

---

## 4. What changes (concrete surface)

Backend:
- **Schema**: new `Categoria` model (`id`, `nombre`, `bucketId` FK). Add
  `categoriaId` FK (nullable) to `Transaccion`. Add `categoriaId` FK to
  `PatronClasificacion` (replacing/alongside its direct `bucketId` — Q4).
- **Domain**: new `Categoria` VO (belongs-to-bucket); extend the categorización
  result to carry `categoriaId`.
- **Application**: `CategorizarTransaccionUseCase` returns `{ categoriaId, bucket }`;
  new `ReclasificarTransaccionUseCase` (userId-isolated write); ports for reading the
  categoría catalog and persisting the manual change.
- **Infrastructure**: Prisma repos for Categoria; update the classification write path
  to persist `categoriaId`; new controller endpoint for reclassify; expose `categoria`
  (id + nombre) in the movimientos / detalle-bucket DTOs (BigInt-safe, unchanged money
  rules).
- **Seed**: new `CATEGORIA_CATALOG` (fixed ids, idempotent upsert); rewire
  `PATRON_CATALOG` entries to reference `categoriaId` instead of `bucketId`.
- **Migration + backfill**: real data migration (§7) under the repo's
  `db-safety` / `ALLOW_DESTRUCTIVE_DB` gate.

Web:
- Revert the dashboard right panel from PR #75's "all buckets always visible" back to
  **click-a-bucket-in-the-pie → show only that bucket's transactions**, now **grouped
  by categoría** with per-categoría subtotal + count.
- **Activate** the "Editar categoría" per-row control (currently disabled) → calls the
  reclassify endpoint, invalidates the resumen + detalle queries on success.
- `SinCategoria` "Clasificar" CTA becomes a real assign action.

---

## 5. Chosen approach + rejected alternatives

**Chosen — dedicated `Categoria` entity between pattern and bucket (Option A from the
exploration, done as full US-013).**
- Fits Clean Architecture: `Categoria` is a domain concept, `bucket` derives from it,
  the pattern points to a categoría (OCP: adding a categoría = new seed row + optional
  patterns, no consumer changes). SRP preserved: the use case still does one thing.
- Single source of truth for the pattern→bucket relationship moves to
  pattern→categoría→bucket, eliminating the possibility of a pattern and a categoría
  disagreeing on bucket.

**Rejected — B: minimal `categoria` string column on Transaccion/Patron, scoped only to
the drill-down UI.** Cheaper now but (a) risks diverging from the real US-013 spec,
(b) a free string invites the same "pattern vs bucket can disagree" drift, (c) no clean
home for the belongs-to-bucket invariant. The exploration flagged this divergence risk.

**Rejected — C: reinterpret "categoría" as description text or bank/account.** Web-only
and cheap, but does not match user intent ("finer than bucket" = semantic categories
like Supermercado/Delivery). Explicitly out.

**Rejected — user-created custom categorías / IA classification / cross-month
analytics.** Out of scope (§8), consistent with RES-ALC-003 (no IA) and YAGNI.

---

## 6. Impact / blast radius

- **`CategorizarTransaccionUseCase`** — return shape changes; every caller and the
  `ProcessIngestaUseCase` post-persist classification step must persist `categoriaId`.
  This is the pipeline's hot path (US-012 wiring). Existing "degrade to SinCategoria"
  isolation must be preserved.
- **Resumen 50/30/20 (US-015/016)** — **recompute on manual reclassify.** When a
  reclassify crosses a bucket boundary, `calcular-resumen-mes.use-case.ts` output
  changes for that period: bucket totals, `porcentajeBp`, and the traffic-light
  `estadoSemaforo` can all flip. Money stays `BigInt`/exact; no float. Web must
  invalidate the resumen query after a successful reclassify.
- **`/api/movimientos` + detalle-bucket DTOs** — gain a `categoria` field. Additive;
  existing consumers unaffected if categoría is optional in the DTO.
- **Seed** — `PATRON_CATALOG` rewired; idempotency test (`PATRON_CATALOG_SIZE`) and any
  bucket-count assertions must extend to categoría counts.
- **Mobile** — read-only resumen screen consumes `/api/resumen` (aggregate), not
  per-transaction categoría, so **no mobile change required** for the MVP of this
  feature. (Confirm — Q5.)
- **DB** — one real migration touching `Transaccion` (new FK) + two new tables/columns;
  backfill updates existing rows.

---

## 7. Migration / backfill plan

Existing `Transaccion` rows have `bucketId` but **no `categoriaId`**. bucket→categoría
is **NOT 1:1** (a bucket has many categorías), so we cannot mechanically map a bucket
back to a single categoría. Plan:

1. **Schema migration** (Prisma): create `Categoria`, add nullable
   `Transaccion.categoriaId` FK, add `PatronClasificacion.categoriaId` FK. Nullable
   first so the migration is non-breaking on existing rows.
2. **Seed the categoría catalog** (fixed ids, idempotent) and rewire patterns to
   categorías.
3. **Backfill by re-running pattern classification**: for each existing transaction,
   re-evaluate the (now categoría-aware) catalog. Where a pattern matches → set
   `categoriaId` (and reconcile `bucketId` to `categoria.bucket`). Where the Ingreso
   rule applies → Ingreso categoría. **Where nothing matches → leave `categoriaId = null`
   (SinCategoria).** Do NOT invent a categoría for previously-bucketed-but-now-unmatched
   rows; SinCategoria is the honest state and the user can reclassify.
4. **Reconciliation note**: a row currently in e.g. `Necesidades` by an old pattern will
   land on the same categoría's bucket, so buckets should be stable for matched rows;
   any drift is a data-quality signal, not a silent money change.
5. **Safety**: the backfill mutates the DB → runs under the existing
   `assertDestructiveDbAllowed` / `ALLOW_DESTRUCTIVE_DB=1` gate, rejects prod connection
   strings, and is idempotent (re-runnable). Same posture as `seed.ts`.

Open decision **Q4**: keep `Transaccion.bucketId` as a derived cache (denormalized, fast
resumen reads, must stay in sync on reclassify) **or** drop it and always derive bucket
via `categoria.bucket` (normalized, one source of truth, JOIN on every read). Recommend
**keep as derived cache** for read performance, with the reclassify use case responsible
for keeping it consistent — but this is a design-phase call.

---

## 8. In scope vs non-goals

**In scope:**
- `Categoria` entity + belongs-to-bucket invariant.
- Automatic categoría assignment from matched pattern.
- Manual reclassify endpoint (userId-isolated) + web control.
- Backfill of existing transactions.
- Web drill-down: click bucket → transactions grouped by categoría (subtotal + count).
- Resumen recompute when reclassify moves a bucket.

**Non-goals (explicit):**
- **User-created / custom categorías** (fixed seed catalog only, like buckets today).
- **IA / ML classification** (RES-ALC-003 — patterns only).
- **Cross-month analytics / historical category trends** (single-period, as US-014/015).
- Mobile per-transaction categoría UI.
- Sub-sub-categorías / hierarchy deeper than one level.
- Editing patterns from the UI (still seed-only).

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Reclassify silently corrupts the resumen (money moves between 50/30/20 wrong) | Exact `BigInt` recompute; integration test asserting resumen deltas after a cross-bucket reclassify; invalidate resumen query on the web |
| Cross-tenant write (user reclassifies another user's transaction) | `userId` isolation on the endpoint (RNF-SEC-006) + integration test (ISO pattern already in repo) |
| Backfill mutates prod data / runs by accident | `ALLOW_DESTRUCTIVE_DB` gate + prod-connection-string rejection + idempotent + dry-run count first |
| `bucketId` cache drifts from `categoria.bucket` after reclassify | Reclassify use case updates both atomically; or drop the cache (Q4); invariant test |
| Taxonomy churn after build (user renames/splits categorías) | This proposal front-loads the taxonomy table for correction BEFORE spec; fixed-id seed makes renames cheap |
| Reverting PR #75's panel undoes Slice 2 web work | Explicit PR #75 decision (§10) before touching the web panel |
| Return-shape change to the categorización use case breaks the pipeline | Contract change covered by the existing US-012 unit + e2e tests; extend, don't rewrite |

---

## 10. PR #75 recommendation (user decides)

PR #75 (`feat/group-transactions-by-category-web`, PAUSED/open) is **misnamed**: per the
exploration it groups by the **same 5 buckets** (renders all groups at once, WG-01), NOT
by a finer categoría. US-013's drill-down (**click one bucket → its transactions grouped
by real categoría**) is a **different and superseding UX**.

**Recommendation: close PR #75 (do not merge), and rebuild the panel as part of US-013's
web slice.** Rationale:
- Merging #75 first ships an "all buckets visible" panel that US-013 immediately reverts —
  wasted review + a confusing intermediate state in `main`.
- #75's grouping logic (`agrupar-movimientos-por-bucket.ts`) groups by bucket, which
  US-013 replaces with group-by-categoría; little is reusable verbatim.
- The standalone `/buckets/:bucket` route + `useDetalleBucket` (untouched by #75) remain
  and are the natural extension point for the categoría grouping.

Alternatives if the user disagrees: (a) **merge #75 as-is** and treat US-013 as a follow-up
revert (accepts churn); (b) **rework #75's branch** into the US-013 web slice directly
(keeps the branch, rebases onto the categoría API). **The user makes the final call.**

---

## 11. Magnitude estimate + proposed slicing

**Magnitude: LARGE.** New entity + schema migration + real backfill + hot-path use-case
change + new write endpoint + DTO changes + web UX revert & rebuild + activate manual edit.
Rough order: **~6 slices, well over the 400-line single-PR budget** → chained PRs
recommended (`ask-on-risk` → surface at tasks time).

Proposed PR chain (dependency order):

1. **S1 — Domain + schema + migration (nullable).** `Categoria` VO + belongs-to-bucket;
   Prisma `Categoria` model, `Transaccion.categoriaId`, `PatronClasificacion.categoriaId`
   (nullable); seed `CATEGORIA_CATALOG` + rewire patterns. No behavior change yet.
2. **S2 — Categorización update.** `CategorizarTransaccionUseCase` returns
   `{ categoriaId, bucket }`; pipeline persists `categoriaId`. Unit + e2e green.
3. **S3 — Backfill migration.** Re-run classification over existing rows under the
   `ALLOW_DESTRUCTIVE_DB` gate; idempotent; dry-run count.
4. **S4 — Manual reclassify endpoint.** `ReclasificarTransaccionUseCase` + controller,
   `userId` isolation, resumen recompute semantics; integration tests (isolation + money).
5. **S5 — API exposure.** Add `categoria` to movimientos / detalle-bucket DTOs
   (BigInt-safe); grouped-by-categoría read shape for the drill-down.
6. **S6 — Web drill-down + reclassify UX.** Revert panel to single-bucket-on-click,
   group by categoría (subtotal + count), activate "Editar categoría", invalidate
   resumen on success. (Depends on the PR #75 decision, §10.)

Slices 1→5 are backend and can chain linearly; S6 is the only web slice and lands last.
This could alternatively be split into **two SDD changes** (backend `us-013-categorias`
S1–S5, then web `us-013-categorias-web` S6) if the team prefers smaller review units —
raise at tasks time per `ask-on-risk`.

---

## 12. Open product questions (for the user)

- **Q1 (taxonomy — most important):** Is the §3 table right? Correct any categoría
  name, split, merge, or bucket assignment now — this proposal is the "define the
  categorías first" step.
- **Q2:** Collapse the three Ahorro categorías (Inversión / Ahorro programado /
  Previsión) into a single **Ahorro** categoría for the MVP? (YAGNI.)
- **Q3:** Should Ingreso be a single categoría "Ingreso", or stay category-less like
  SinCategoria?
- **Q4:** Keep `Transaccion.bucketId` as a derived cache (recommended) or drop it and
  always derive via `categoria.bucket`? (Design-phase, but affects the migration.)
- **Q5:** Confirm mobile needs **no** per-transaction categoría change for this MVP.
- **Q6 (PR #75):** Close and rebuild (recommended), merge-then-revert, or rework the
  branch?
- **Q7:** One SDD change (S1–S6) or split backend / web into two changes?
