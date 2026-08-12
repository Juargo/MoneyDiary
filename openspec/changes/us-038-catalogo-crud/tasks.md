# Tasks: US-038 — Catalog CRUD API (categories + classification patterns)

- **Change**: `us-038-catalogo-crud`
- **Inputs**: `specs/catalogo-clasificacion-ownership/spec.md` (CAT038-01…09 ADDED, CAT037-04/06 MODIFIED) + `design.md` (Q1–Q5, D-01…D-10). **Where the design corrects the proposal, the design wins.**
- **Strict TDD is active.** Every code task is RED (failing spec committed/observed first) → GREEN (production edit). `[INV]` = inventory/no-behaviour, `[GATE]` = verification only, `[DOC]` = documentation, `[P]` = parallelisable with its siblings.

## Runners (verified against `apps/api/package.json`, do not guess)

| Purpose | Command |
|---|---|
| Unit | `pnpm api test` (optionally `pnpm api test <file-pattern>`) |
| Integration (real Postgres) | `pnpm api test:integration` — the script **already** exports `ALLOW_DESTRUCTIVE_DB=1` and `DOTENV_CONFIG_PATH=.env.test`; prefixing `ALLOW_DESTRUCTIVE_DB=1` is harmless |
| Local ephemeral DB | `pnpm api db:up` then `pnpm api test:db:setup` (see `apps/api/docs/local-test-db.md`) |
| Type check | `pnpm api exec tsc --noEmit` |
| Web regression | `pnpm web test` |
| Contract emit / drift gate | `pnpm api openapi:emit` · `pnpm api openapi:check` |
| Contract + client together | `pnpm contract:sync` (root: `openapi:emit` + `api-client generate`) |

---

## Review Workload Forecast

| Field | Value |
|---|---|
| **Estimated changed lines** | **4,300–5,900 total** — PR1 900–1,400 · PR2a 1,300–1,800 · PR2b 2,100–2,700 (of which ~700–1,100 are generated `openapi.json` + `types.gen.ts`) |
| **400-line budget risk** | **High** (every slice exceeds it; no slice can be squeezed under 400 without splitting a single behaviour across PRs) |
| **Chained PRs recommended** | **Yes — 3 chained PRs** (a refinement of design §9's seam, not a change of it: PR1's boundary is untouched; PR2 is split at the application/infrastructure line, aggregate content identical) |
| **Chain strategy** | `feature-branch-chain` (cached; matches US-037's precedent). Tracker branch `feat/us-038-catalogo-crud` accumulates; **only the tracker merges to `main`**. PR1 → tracker, PR2a → PR1's branch, PR2b → PR2a's branch |
| **Slice boundaries (each independently green)** | **PR1** domain widening, behaviour-preserving (ADR-037 + enum retirement + widened read/write paths + all affected specs). **PR2a** application slice: `esDemo` threading + 13-class error family + 2 ports + 7 use cases, unit-tested against fakes — compiles and is green with no HTTP surface. **PR2b** infrastructure slice: 2 Prisma adapters + 2 routers + 3 Zod schemas + 3 DTO mappers + composition + `openapi.json`/`types.gen.ts` regeneration + the 4 integration specs |
| **Generated files** | `apps/api/openapi.json` and `packages/api-client/src/types.gen.ts` land **only in PR2b** and must be flagged in the PR body as **read-once, not line-by-line**; both are CI drift-gated (`openapi:check`, the `api-client` job), so review adds nothing a gate does not already prove |
| **Delivery strategy** | `ask-on-risk` |
| **Decision needed before apply** | **Yes** — the orchestrator must confirm the 3-PR split (or record `size:exception`) before task 0.4 creates the tracker. A fallback 4-way split exists if the budget must be tighter: cut PR2b at the resource line (PR2b categories end-to-end, PR2c patterns end-to-end), at the cost of two contract regenerations |
| **Optional-scope escape hatch** | None. `schema.prisma` is untouched by construction (design §9 constraint 5); any task proposing a migration is **escalated, not absorbed** |

---

## Phase 0 — Pre-flight (no code, no branch cost)

- [x] 0.1 `[GATE]` Confirm the local ephemeral Postgres is up and migrated before any integration work: `pnpm api db:up && pnpm api test:db:setup`. → design §8
- [x] 0.2 `[GATE]` Baseline the tree: `pnpm api test`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check`, `pnpm web test` all green **before** the first edit. Anything already red is pre-existing debt and is **not** absorbed by this change.
- [x] 0.3 `[GATE]` Re-confirm `apps/api/prisma/schema.prisma` and `prisma/migrations/**` stay untouched for the whole change; if any task appears to need a migration, **stop and escalate**. → design §9 constraint 5, §4.3 — confirmed untouched throughout PR1.
- [x] 0.4 `[GATE]` After the orchestrator's Review Workload decision: create tracker branch `feat/us-038-catalogo-crud` from `main` + a **draft/no-merge tracker PR**. → `chained-pr` skill

---

# PR #1 — Domain widening (behaviour-preserving for every previously-valid input)

Target: tracker branch. Independently revertable. **A green suite is this PR's acceptance criterion.**

## Phase 1 — Documentation (lands in PR1 per Q1)

- [x] 1.1 `[DOC]` Write `docs/adr/ADR-037-identidad-de-categoria-como-fila-del-usuario.md` in **Spanish**, matching the existing ADR format (front-matter + `## Estado` / `## Contexto` / `## Decisión` / `## Alternativas` / `## Consecuencias`, same shape as ADR-036). Content obligations from design Q1: title *"La identidad de una categoría es una fila propiedad del usuario, no un tipo de compilación"*; the **traded-away guarantee** stated explicitly (`Record<Categoria, Bucket>` was *total* — the compiler proved no category was bucket-less; that proof is replaced by the `NOT NULL` `Categoria.bucketId` FK and retained by the compiler only for the template via `CategoriaTemplateNombre`); the **three rejected alternatives** (enum as a "known names" hint alongside free-form rows · branded `string` type · runtime validation against a per-user name set); the consequence that `prisma/backfill-categorias.ts` loses its last runtime dependency on `CATEGORIA_IDS`. → Q1
- [x] 1.2 `[DOC]` Add **one** forward-pointer line to ADR-036's `## Consecuencias` section referencing ADR-037. **Do not rewrite ADR-036's body.** → Q1
- [x] 1.3 `[DOC]` **Fix the stale ADR-036 production note.** Gate 6.9 (third migration rehearsal) **passed on 2026-08-11 against a restored prod `pg_dump` copy** — 1 live demo purged, 430 real transactions checksummed identical, constraints verified — and US-037 was merged and **deployed** (commit `4d4cc4c`, 2026-08-11, smoke-tested). Therefore: (a) rewrite/remove the `### Pendiente antes de producción` section (line ~124) so it records the gate as **passed** instead of pending; (b) update the `## Estado` line (~17) to drop *"El despliegue a producción queda pendiente…"*; (c) update the ADR-036 row in `docs/adr/README.md` from `✅ Decidido (deploy pendiente del gate 6.9)` to `✅ Decidido e implementado`. → design §9 constraint 7, §10
- [x] 1.4 `[DOC]` Add the ADR-037 row to the `docs/adr/README.md` index table (same column shape as rows 54–57). → Q1
- [x] 1.5 `[DOC]` Add the ADR-037 row to the ADR table in `CLAUDE.md` (one line, same register as ADR-036's row). → Q1

## Phase 2 — Enum deletion + domain layer (compiler-driven)

- [x] 2.1 `[INV]` **Delete first, then let the compiler enumerate.** Delete `apps/api/src/domain/value-objects/categoria.ts` and `apps/api/src/domain/errors/categoria-invalida.error.ts`, run `pnpm api exec tsc --noEmit`, and record the ~41 red files **grouped by layer** (domain → application → infrastructure → prisma scripts → specs) in the PR1 body. **Do not grep** — the red list is the work list, and it is worked in that order. → design §9 constraint 2 (ADR-036 D-09 tactic)
- [x] 2.2 RED `[P]` Specs for `CategoriaNoEncontradaError` (404 · `CATEGORIA_NO_ENCONTRADA`) and `CategoriaDesconocidaError` (400 · `CATEGORIA_DESCONOCIDA`): each carries a scrubbed message that **enumerates nothing**. Assert the two classes are distinct (the "one error ⇒ exactly one status" invariant depends on it). → §5.3, CAT037-04 · `pnpm api test errors`
- [x] 2.3 GREEN Add both error classes under `apps/api/src/domain/errors/`. → §5.3
- [x] 2.4 RED Rewrite `patron-clasificacion.spec.ts`: nested `categoria: { id, nombre, bucket }` accepted; `get bucket()` projects `categoria.bucket`; **`coincide()` behaviour byte-identical, including malformed-REGEX ⇒ `false`**. → CAT038-06, D-03 · `pnpm api test patron-clasificacion`
  - **GUARDRAIL — must not be weakened.** The malformed-REGEX `try/catch` case is CA-05's runtime guarantee. If this assertion has to be relaxed to make anything pass, stop and escalate.
- [x] 2.5 GREEN `domain/value-objects/patron-clasificacion.ts`: nested category props, `get bucket()`, `coincide()` **untouched**. → D-03

## Phase 3 — Application layer (red list, layer 2)

- [x] 3.1 RED `categorizar-transaccion.use-case.spec.ts`: result carries `{ id, nombre } | null`; Ingreso rule unchanged; **`(prioridad, patron, id)` tie-break cases unchanged in meaning — only the assertion shape may change**. → Q5, D-08 · `pnpm api test categorizar-transaccion`
  - **GUARDRAIL — must not be weakened.** ADR-036 precondition 2. The sort itself is untouched by this change; a tie-break test that gets deleted or loosened is a stop-and-escalate.
- [x] 3.2 GREEN `CategorizarTransaccionUseCase` — `CategorizarTransaccionResult.categoria: { id, nombre } | null`; sort untouched. → Q5
- [x] 3.3 RED `[P]` `agrupar-por-categoria-bucket.spec.ts`: keys on `categoriaId ?? ' '`; two categories sharing a bucket still group **separately**; `null` groups behave as before. → Q5 · `pnpm api test agrupar-por-categoria-bucket`
- [x] 3.4 GREEN `application/services/agrupar-por-categoria-bucket.ts`. → Q5
- [x] 3.5 Update ports (types only, no behaviour): `transaccion-bucket-writer.port.ts` (assignment tuple gains `categoriaId: string | null`; `userId` **retained and now load-bearing**), `reclasificar-categoria.port.ts` (`reasignar` returns both `categoriaId` **and** `bucket`; error union gains `CategoriaDesconocidaError`), `movimientos-mes.port.ts` + `detalle-bucket.port.ts` (`categoria.nombre: string`). → §4.2, Q5, CAT037-04/06 · `pnpm api exec tsc --noEmit`
- [x] 3.6 RED `reclasificar-transaccion.use-case.spec.ts`: delegates **without any enum gating** (`CATEGORIAS_VALIDAS`/`CATEGORIA_BUCKET` gone); maps `CategoriaDesconocidaError`. → CAT037-04 · `pnpm api test reclasificar-transaccion`
- [x] 3.7 GREEN `ReclasificarTransaccionUseCase` shrinks to delegation + error mapping. → §11 of the proposal, CAT037-04

## Phase 4 — Infrastructure / persistence (red list, layer 3)

- [x] 4.1 RED `catalogo-template.spec.ts` becomes a **pinning** test (no longer derived from `Object.values(Categoria)`): 8 literal categories pinned by name+bucket; 20 patterns; every `PATRON_TEMPLATE.categoria` ∈ template names; `CATEGORIA_IDS` keys ≡ template names. → D-02, §8.3 · `pnpm api test catalogo-template`
- [x] 4.2 GREEN `catalogo-template.ts`: literal `as const` list **carrying `bucket: Bucket`** (resolve `BUCKET_IDS[bucket]` at the two write sites, keeping `BUCKET_IDS` the single id authority) + exported `CategoriaTemplateNombre`; `copiarCatalogoTemplate`'s contract (caller owns the transaction, throws, non-idempotent) **unchanged**. Re-key `categoria-ids.ts` to `CategoriaTemplateNombre`; it stays seed/migration-only. → D-02
- [x] 4.3 RED `fold-categoria.spec.ts` — **invert** the old *"unknown nombre folds to null (defensive)"* case into *"an arbitrary owned name passes through verbatim"*; `null`/`undefined` ⇒ `null`; ids are the row's real ids. The inversion **is** the point of the test. → CAT037-06, D-01, §8.3 · `pnpm api test fold-categoria`
- [x] 4.4 GREEN `fold-categoria.ts` — drop the `CATEGORIA_NOMBRES.has()` guard; total over non-null rows. → D-01
- [x] 4.5 RED `prisma-catalogo-clasificacion.repository.spec.ts`: asserts the `include` **widens** to `{ categoria: { include: { bucket: true } } }` (today it is `include: { categoria: true }`, which returns `bucketId` but not the bucket's `nombre`) and that the nested VO is built correctly. → §4.4 correction 3, D-03 · `pnpm api test prisma-catalogo-clasificacion`
- [x] 4.6 GREEN `prisma-catalogo-clasificacion.repository.ts` — widened `include` + nested VO construction (the single production construction site). → D-03
- [x] 4.7 RED `prisma-transaccion-bucket.repository.spec.ts`: writes the handed `categoriaId`; **asserts no `categoria.findMany` is issued** (the name→id map and the "categoría no encontrada" throw are gone); the `updateMany` `WHERE` contains the **triple lock** `id IN (…) AND ingestaId = ? AND account.userId = ?`. → Q5, CAT038-07, §8.3 · `pnpm api test prisma-transaccion-bucket`
- [x] 4.8 GREEN `prisma-transaccion-bucket.repository.ts` — delete the lookup/map/throw (≈22 lines, one query, one failure mode); add `account: { userId }` to the `updateMany` `WHERE` so the freed `userId` parameter becomes load-bearing rather than orphaned. → Q5 (RNF-SEC-006 at the statement that stamps money rows)
- [x] 4.9 RED `prisma-reclasificar-categoria.repository.spec.ts`: resolves `(userId, nombre)`; returns the real id **and** the bucket; a missing row ⇒ `Result.fail(CategoriaDesconocidaError)` **instead of a throw**. → CAT037-04 · `pnpm api test prisma-reclasificar-categoria`
- [x] 4.10 GREEN `prisma-reclasificar-categoria.repository.ts`. → CAT037-04
- [x] 4.11 RED→GREEN `[P]` `prisma-movimientos-mes.repository.ts` and `prisma-detalle-bucket.repository.ts` (+ their specs): mocks/assertions updated for the widened fold; **a user-created name is never folded to `null`**. → CAT037-06 · `pnpm api test movimientos-mes detalle-bucket`

## Phase 5 — HTTP boundary + prisma scripts (red list, layers 4–5)

- [x] 5.1 RED `transacciones.routes.spec.ts`: the `400` body **no longer enumerates the 8 names**; `CategoriaDesconocidaError` maps to `400` with *"La categoría indicada no existe en tu catálogo."*; the inline 2-variant exhaustive switch still compiles. → CAT037-04, §7.4 · `pnpm api test transacciones.routes`
- [x] 5.2 GREEN `http-express/routes/transacciones.routes.ts`. → §7.4
- [x] 5.3 RED `backfill-categorias.spec.ts`: the hand-written `BackfillClient` fake's `include` is **widened** to fetch `categoria.bucket`; `categoriaId` comes from the matched pattern's own row, **not** from `CATEGORIA_IDS`. → §4.4 correction 2, §3.5 · `pnpm api test backfill-categorias`
- [x] 5.4 GREEN `prisma/backfill-categorias.ts`: widen the `BackfillClient` `include`, write `categoriaId: categoria?.id ?? null`, **drop the `CATEGORIA_IDS` import entirely**. The script **stays frozen** and pinned to `USER_ID_FIJO` on **both** the read and the write side (ADR-036 D-10 + PR #301 hardening). **This is more than the "mechanical import fix" the proposal predicted** — budget it. → §3.5, §4.4 correction 2
- [x] 5.5 RED→GREEN `[P]` `prisma/seed.ts` + `seed-catalog.spec.ts`: template typing follow-through under `CategoriaTemplateNombre` (both consume the template types and were **missing from the proposal's Affected Areas**). → §4.4 additional correction · `pnpm api test seed-catalog`
- [x] 5.6 `[GATE]` `backfill-categorias.int-spec.ts` green under the widened types (regression, real DB). → §8.2 · `pnpm api test:integration backfill-categorias`

## Phase 6 — PR #1 proof obligation and gate

- [x] 6.1 `[GATE]` `pnpm api exec tsc --noEmit` clean — the Phase 2.1 red list is exhausted, with **every red file's spec updated before its source**. → design §10 risk 1
- [x] 6.2 `[GATE]` `pnpm api test` green.
- [x] 6.3 `[GATE]` `pnpm api test:integration` green (`categorizacion`, `movimientos-mes`, `detalle-bucket`, `reclasificar-categoria`, `backfill-categorias`, `catalogo-isolation` regressions). → §8.2
- [x] 6.4 `[GATE]` `pnpm web test` green — **DEVIATION**: one test-only edit under `apps/web/**` was required (`src/domain/categoria.mirror.spec.ts`), not zero. That spec's drift guard read `apps/api/src/domain/value-objects/categoria.ts` as plain text; task 2.1 deletes that file. Re-pointed the guard at the new backend source of truth (`catalogo-template.ts`'s `CATEGORIA_TEMPLATE`, D-02) — same purpose, zero product-behaviour change, no edit to `apps/web/src/domain/categoria.ts` (the accepted-stale hardcoded mirror stays untouched, US-043 scope). Design's §4.4 "apps/web unchanged" table did not anticipate this coupling — flagged for design/tasks correction. → §4.3
- [x] 6.5 `[GATE]` **PR1's precise proof obligation — NOT "openapi byte-identical".** Run `pnpm api openapi:emit` and inspect the diff: the **only** change permitted is the `description` string of the `400` response on `PATCH /api/transacciones/{id}/categoria` (it currently names `CategoriaInvalidaError` and "the domain enum", both of which cease to exist). **No path, operation, status code, or schema may change.** Reviewers verify this by reading the diff, not by trusting the claim. Then `pnpm api openapi:check` green. → design §9 PR#1 obligation 2
- [x] 6.6 `[GATE]` Regenerate the client for that one description change and commit: `pnpm contract:sync` (or `pnpm api-client generate`), then confirm the `api-client` drift gate is satisfied (`git diff --exit-code` after regeneration). → CAT038-09
- [x] 6.7 `[DOC]` PR #1 body states **up front the two intentional behaviour deltas**, both on `PATCH /api/transacciones/:id/categoria`: (a) the `400` body text changes from the enumerated 8-name message to *"La categoría indicada no existe en tu catálogo."*; (b) a category name absent from the caller's catalog now returns `400` instead of `500` — **a path that was previously unreachable**, because the enum gate rejected every name before the adapter's `throw` could fire. Every input valid before is still valid and still produces the same result. Plus: no new endpoint, no `esDemo`, no CRUD; dependency diagram with `📍`; review budget (`additions + deletions`); Phase-2.1 red list by layer. → design §9, `chained-pr`
- [x] 6.8 Open PR #1 **targeting the tracker branch** `feat/us-038-catalogo-crud`. → PR #306, https://github.com/Juargo/MoneyDiary/pull/306

---

# PR #2a — Application slice (`esDemo` + errors + ports + 7 use cases)

Targets PR #1's branch. Independently green: use cases are unit-tested against fakes and depend only on the new ports, so no HTTP surface is required for the suite to pass.

## Phase 7 — Demo flag threading (session repo → middleware)

- [ ] 7.1 RED `prisma-session.repository.spec.ts`: `findUnique({ where: { tokenHash } })` `select` includes `user: { select: { esDemo: true } }` — **one query, no extra round trip**. → CAT038-08, §3.4 · `pnpm api test prisma-session`
- [ ] 7.2 GREEN `prisma-session.repository.ts` + `application/ports/session-repository.port.ts` (`SesionPersistida.esDemo: boolean`). → §3.4, §4.2
- [ ] 7.3 RED `validar-sesion.use-case.spec.ts`: `ValidarSesionResult` carries `esDemo`. → CAT038-08 · `pnpm api test validar-sesion`
- [ ] 7.4 GREEN `ValidarSesionUseCase`. → §4.2
- [ ] 7.5 RED `session.middleware.spec.ts`: `req.esDemo` is written alongside `req.userId`. → CAT038-08 · `pnpm api test session.middleware`
- [ ] 7.6 GREEN `http-express/middleware/session.middleware.ts` + declare `esDemo?: boolean` in **`apps/api/src/infrastructure/http/auth/express-request.d.ts`** — **not** under `http-express/`; it is one of the framework-agnostic `http/` survivors of ADR-028. → §4.4 correction 1

## Phase 8 — Error family + ports

- [ ] 8.1 RED `[P]` Specs for the remaining **11** error classes (2 landed in PR1): `NombreCategoriaInvalidoError` 400 `NOMBRE_INVALIDO` · `BucketNoAsignableError` 400 `BUCKET_NO_ASIGNABLE` · `PatronInvalidoError` 400 `PATRON_INVALIDO` · `MatchTypeInvalidoError` 400 `MATCH_TYPE_INVALIDO` · `RegexInvalidaError` 400 `REGEX_INVALIDA` · `PrioridadInvalidaError` 400 `PRIORIDAD_INVALIDA` · `CatalogoDemoSoloLecturaError` 403 `DEMO_SOLO_LECTURA` · `PatronNoEncontradoError` 404 `PATRON_NO_ENCONTRADO` · `NombreCategoriaDuplicadoError` 409 `NOMBRE_DUPLICADO` · `PatronDuplicadoError` 409 `PATRON_DUPLICADO` · `CategoriaEnUsoError` 409 `CATEGORIA_EN_USO`. Assert **one class ⇒ exactly one status**; `CatalogoDemoSoloLecturaError`'s message is the `DemoUploadNudge.tsx` UX family: *"Las categorías de la cuenta demo son de solo lectura. Creá una cuenta para personalizar tu catálogo."*; `CategoriaEnUsoError`'s message points at reassigning first and **does not promise a migration** (that is US-039). → §5.3, CAT038-04/08 · `pnpm api test errors`
- [ ] 8.2 GREEN 11 error classes under `domain/errors/`. → §5.3. **Q3 is settled: one class per user-facing remediation. Do not merge `NombreCategoriaInvalidoError` + `BucketNoAsignableError` into a `motivo`-carrying class** — with `{message, code}`, one class per remediation *is* the code enum.
- [ ] 8.3 `[P]` Add `application/ports/categoria-repository.port.ts` (`ICategoriaRepository`) and `application/ports/patron-repository.port.ts` (`IPatronRepository`) with the exact signatures of design §5.4. Every method takes `userId` as a **method parameter**, never constructor state (repositories are request-shared singletons and must stay tenant-stateless, ADR-036 D-03). Document on `actualizar`: *`bucketId` present ⇒ the adapter MUST re-stamp in the same transaction*; on `eliminar`: *patterns cascade; refusal is atomic with the in-use predicate*. → D-04, §5.4 · `pnpm api exec tsc --noEmit`

## Phase 9 — The 7 use cases

Common assertions for all 6 mutation specs: **the demo gate fires first, before any repository call** — assert the repository fake was **not** called; `esDemo` is a **required, non-optional** input field so a route that forgets to thread it fails to compile (D-04/D-05). The two-line guard is **duplicated on purpose** across the 6 use cases — do not extract a shared helper (D-05, KISS over DRY).

- [ ] 9.1 RED `listar-catalogo.use-case.spec.ts`: **no `esDemo` in the input type** (compile-level assertion); a zero-pattern category returns `patrones: []`; ordering of nested patterns is `(prioridad, patron, id)`. → CAT038-02, CAT038-03 scenario, D-08 · `pnpm api test listar-catalogo`
- [ ] 9.2 GREEN `ListarCatalogoUseCase` (`{ userId }` → `CategoriaConPatrones[]`, error union `never`). → §5.1
- [ ] 9.3 RED `crear-categoria.use-case.spec.ts`: demo gate first; `nombre` trim + 1–40 chars ⇒ `NombreCategoriaInvalidoError`; `bucket` required and ∈ `{Necesidades, Deseos, Ahorro}` — **`Ingreso` and `SinCategoria` are computed states and are NOT assignable**, yielding the same `400` as a missing bucket; case-insensitive per-user duplicate ⇒ `NombreCategoriaDuplicadoError`; `bucket` travels as a **name** and is resolved via `BUCKET_IDS` in infrastructure; created category comes back with `patrones: []`. → CAT038-01, CAT038-03 (CA-01/CA-03) · `pnpm api test crear-categoria`
- [ ] 9.4 GREEN `CrearCategoriaUseCase`. → §5.1/§5.2
- [ ] 9.5 RED `actualizar-categoria.use-case.spec.ts`: **partial body** — `nombre`-only and `bucket`-only both valid (Q4); `404` before validation when the row is not the caller's; uniqueness check **excludes self**; **`bucketId` is omitted from the patch when the bucket did not change** (D-07's flag-free mechanism); `bucketId` present in the patch when it did. → CAT038-03, Q4, D-07 · `pnpm api test actualizar-categoria`
- [ ] 9.6 GREEN `ActualizarCategoriaUseCase` following design §3.2's ordered flow (demo → 404 → nombre rules → bucket rule → patch shape → repo). → §3.2
- [ ] 9.7 RED `eliminar-categoria.use-case.spec.ts`: demo gate first; maps the adapter's `Result` to `404` (`CategoriaNoEncontradaError`) vs `409` (`CategoriaEnUsoError`); the use case does **not** perform its own in-use pre-check (that is D-06's whole point). → CAT038-04 · `pnpm api test eliminar-categoria`
- [ ] 9.8 GREEN `EliminarCategoriaUseCase`, with a docblock restating the **non-goal**: the `409` is the deliverable; reassigning/migrating a category's transactions is **US-039** and must not be absorbed here. → §10 scope-creep risk
- [ ] 9.9 RED `crear-patron.use-case.spec.ts`: demo gate first; `patron` trim + 1–200 chars; `matchType` ∈ `{CONTAINS, STARTS_WITH, REGEX}` (**first write path in the repo that validates it**); `REGEX` ⇒ `new RegExp(patron)` must compile, else `RegexInvalidaError`; `prioridad` optional integer `1..999` **defaulting to 100** (`1000` ⇒ `400`); category ownership checked first ⇒ `404` for a foreign/absent `categoriaId`; case-insensitive per-user `patron` duplicate ⇒ `409`. → CAT038-05, CAT038-06 (CA-02/CA-05) · `pnpm api test crear-patron`
- [ ] 9.10 GREEN `CrearPatronUseCase`. The write-time regex check is an **earlier, friendlier gate**, never a replacement for `coincide()`'s `try/catch`. → CAT038-06
- [ ] 9.11 RED `actualizar-patron.use-case.spec.ts`: partial body (Q4); same field rules; self-excluded uniqueness; `404` for a non-owned id; **`categoriaId` is not accepted** (moving a pattern between categories is a non-goal). → CAT038-05, Q4 · `pnpm api test actualizar-patron`
- [ ] 9.12 GREEN `ActualizarPatronUseCase`. → §5.1
- [ ] 9.13 RED `eliminar-patron.use-case.spec.ts`: demo gate first; adapter `false` ⇒ `PatronNoEncontradoError` (404, merging "absent" and "not yours"). → CAT038-05, CAT038-07 · `pnpm api test eliminar-patron`
- [ ] 9.14 GREEN `EliminarPatronUseCase`. → §5.1
- [ ] 9.15 `[GATE]` `pnpm api test` + `pnpm api exec tsc --noEmit` green; open PR #2a targeting PR #1's branch with a `📍` dependency diagram and the note that it ships **no HTTP surface** (its value is provable only by unit tests). → `chained-pr`

---

# PR #2b — Infrastructure slice (adapters + routers + contract + integration)

Targets PR #2a's branch. This is where the endpoints become reachable.

## Phase 10 — Prisma adapters

- [ ] 10.1 RED `prisma-categoria.repository.spec.ts`:
  - `userId` appears in the SQL `WHERE` of **every** query and mutation (never filtered in memory) — `listarConPatrones`, `buscarPorId`, `existeNombre`, `crear`, `actualizar`, `eliminar`. → CAT038-07 (RNF-SEC-006)
  - `listarConPatrones` uses `include: { bucket: true, patrones: true }`, `orderBy: { nombre: 'asc' }`, and re-orders nested patterns by **`(prioridad, patron, id)`** so the UI sees the real resolution order. → D-08
  - `actualizar` issues the re-stamp `updateMany` **iff** `bucketId` is present in the patch, inside `prisma.$transaction([update, updateMany])` (**array form** — the two statements have no interdependent reads), with `where: { categoriaId: id, account: { userId } }`. → CAT038-03, D-07
  - `eliminar` runs an **interactive** `$transaction` that deletes patterns first (`patronClasificacion.deleteMany({ where: { categoriaId, userId } })`) and then `categoria.deleteMany({ where: { id, userId, transacciones: { none: {} } } })`; `count === 0` ⇒ rollback sentinel so **patterns survive a refusal**; a follow-up `userId`-scoped `findUnique` **outside** the transaction distinguishes `404` from `409`. → CAT038-04, D-06
  - · `pnpm api test prisma-categoria`
- [ ] 10.2 GREEN `persistence/prisma-categoria.repository.ts`.
  - **BINDING — do not regress to check-then-delete.** The in-use predicate MUST live **inside the deleting statement** (`transacciones: { none: {} }`, which compiles to a `NOT EXISTS` subquery evaluated atomically with the delete). Wrapping a separate count-then-delete in a `$transaction` does **not** close the race under Postgres READ COMMITTED — a row committed by a concurrent writer between the count and the delete is still visible to the delete's FK action, and `onDelete: SetNull` would then silently strip `categoriaId` from a money row while `bucketId` survives. The `$transaction` exists for a **different** guarantee (patterns-and-category are all-or-nothing); both reasons must hold simultaneously. Any refactor that moves the predicate out of the delete statement is a **stop-and-escalate**. → D-06, §10
  - The `transacciones: { none: {} }` relation filter is **deliberately not scoped by user**: any `Transaccion` row pointing at the category — even a hypothetical cross-tenant stray — blocks the delete. Refusing is the safe side.
- [ ] 10.3 RED `[P]` `prisma-patron.repository.spec.ts`: `userId` in every `WHERE`; `crear` relies on the composite FK `(categoriaId, userId) → Categoria(id, userId)` for DB-level cross-tenant refusal; `eliminar` returns `false` when the delete count is 0. → CAT038-05, CAT038-07 · `pnpm api test prisma-patron`
- [ ] 10.4 GREEN `persistence/prisma-patron.repository.ts`. → §5.4

## Phase 11 — HTTP surface, contract registration, composition

- [ ] 11.1 RED `[P]` `categorias.schema.spec.ts` + `patrones.schema.spec.ts` (following the `buckets.schema.spec.ts` precedent): schema ↔ DTO **sync**; bodies are `.strict()` so an unknown/typo'd key is rejected (notably `categoriaId` on `PATCH /api/patrones/:id`, a non-goal); PATCH bodies' `.refine()` rejects `{}` ("at least one field", Q4); path params are `z.object({ id: z.string() })`; **no enums, no lengths, no ranges** in Zod — `bucket` and `matchType` are `z.string()` because enum-membership is a DOMAIN rule per the documented `buckets.schema.ts` layer-honesty gate; assert **no numeric money field** appears anywhere on this surface (CA-06 is satisfied vacuously and the spec pins it). → §5.2, §7.2, CAT038-09 · `pnpm api test schema`
- [ ] 11.2 GREEN `http-express/schemas/categorias.schema.ts`, `patrones.schema.ts`, and `catalogo-error.schema.ts` exporting `catalogoErrorResponseSchema` (`{ message: string, code: string }`, `meta.id: 'CatalogoErrorResponse'`). → §7.2/§7.3
- [ ] 11.3 RED `[P]` DTO mapper specs for `http/dto/{catalogo,categoria,patron}.dto.ts`: **one** `CategoriaDto` shape (`{ id, nombre, bucket, patrones: [...] }`) reused by the GET list entries, the `POST` 201 and the `PATCH` 200 (`patrones: []` on create is how **CA-03** is observable); **one** `PatronDto` shape (`{ id, categoriaId, patron, matchType, prioridad }`) reused nested and standalone — `categoriaId` is redundant when nested and is kept anyway so there is exactly one pattern shape. → CAT038-02/03, §7.1 · `pnpm api test dto`
- [ ] 11.4 GREEN the 3 DTO mappers. → §7.1
- [ ] 11.5 RED `categorias.routes.spec.ts` + `patrones.routes.spec.ts`: the status matrix of §7.1 (GET 200/401 · POST 201 · PATCH 200 · DELETE 204, plus 400/403/404/409 per error class); every non-2xx body is `{ message, code }`; `.safeParse()` failure ⇒ `400 { message: 'Cuerpo de la petición inválido.', code: 'BODY_INVALIDO' }` that **never echoes Zod's issue list or any submitted value** (the issue list contains raw input; echoing it breaches the scrubbing convention); `req.esDemo` is threaded into every mutation input; `404` merges "absent" and "not yours". → CAT038-01…08, D-09, §7.4 · `pnpm api test categorias.routes patrones.routes`
- [ ] 11.6 GREEN `http-express/routes/categorias.routes.ts` + `patrones.routes.ts` (`registrar*(router, catalogo)`, closure-DI) and **one shared** `aCatalogoHttpError(error): { status, code, message }` owning the single `const _exhaustive: never = error` guard for the whole 13-class family — adding a variant without mapping it must **fail compilation** (mirrors `aHttpError` in `ingesta.routes.ts`). → §7.4
- [ ] 11.7 Register the 4 new paths in `http-express/schemas/openapi-document.ts` by **appending** to the fixed-order `paths` object — `'/api/categorias'` (get, post), `'/api/categorias/{id}'` (patch, delete), `'/api/patrones'` (post), `'/api/patrones/{id}'` (patch, delete). **Never reorder existing entries** (the order is part of the determinism contract that keeps `openapi:check` diffing only genuine changes). Every non-2xx of the 4 new paths references `CatalogoErrorResponse`; request bodies surface as `additionalProperties: false`; the ~13 pre-existing operations are **not** touched (Q2's boundary). → CAT038-09, Q2, §7.3 · `pnpm api openapi:emit`
- [ ] 11.8 Composition: new `composition/crear-catalogo.ts` returning a `CatalogoGraph` (7 use cases + 2 adapters wired inside, mirroring `crearAuth`/`crearAuthGoogle`/`crearProcessIngesta`); `container.ts` gains exactly **one** field `readonly catalogo: CatalogoGraph` and **one** `crearCatalogo(prisma)` call; `http-express/app.ts` gains two `registrar*` calls on `protectedApi` so `apiKeyMiddleware` + `sessionMiddleware` both apply (**CA-04**). → D-10, CAT038-07 · `pnpm api exec tsc --noEmit`

## Phase 12 — Integration (real Postgres)

- [ ] 12.1 **Extend** `catalogo-isolation.int-spec.ts` (do **not** replace it — the US-037 assertions stay green): user B gets **`404`, never `403`**, when reading, renaming, re-bucketing or deleting user A's category, and when creating/updating/deleting a pattern under A's `categoriaId`. → CAT038-07 (CA-04) · `pnpm api test:integration catalogo-isolation`
- [ ] 12.2 New `catalogo-crud.int-spec.ts`: create → list → rename → re-bucket → delete round trip; a zero-pattern category is returned with `patrones: []` (CA-03); delete-with-patterns-and-no-transactions ⇒ `204` **and the patterns are gone**; delete-in-use ⇒ `409` **and nothing was deleted, patterns intact**; case-insensitive duplicate ⇒ `409`. → CAT038-01…04 · `pnpm api test:integration catalogo-crud`
- [ ] 12.3 **`[GATE]` The named ILIKE wildcard test — this is a task, not a note, and its outcome selects an implementation.** Inside `catalogo-crud.int-spec.ts`, create a category (and a pattern) named **`a_b`**, then create **`axb`**, and assert the second is **accepted**. Prisma's case-insensitive `equals` on PostgreSQL is implemented with `ILIKE`, whose wildcards are `%` and `_`; if the driver does not escape the value, `_` matches any character and produces a **false `409`** (entirely plausible in a REGEX pattern). **If this test fails**, switch the uniqueness comparison to the trigger-gated fallback: compare in memory over the `userId`-scoped fetch of that user's 8–30 names using `toLocaleLowerCase()`. That does **not** breach RNF-SEC-006 — the `WHERE` still carries `userId`; only where the business comparison is evaluated moves. Record which branch was taken in the PR body. → §5.2, §10 · `pnpm api test:integration catalogo-crud`
- [ ] 12.4 New `catalogo-demo-gate.int-spec.ts`: all **6** mutations from an `esDemo` session ⇒ `403` with `code: "DEMO_SOLO_LECTURA"`; `GET /api/categorias` still returns `200` with that same demo session's own catalog. → CAT038-08 · `pnpm api test:integration catalogo-demo-gate`
- [ ] 12.5 New `catalogo-rebucket.int-spec.ts` — **bucket integrity end-to-end**: categorize transactions into `Delivery` (`Deseos`), re-bucket the category to `Necesidades`, then assert **both** `/api/resumen` **and** the bucket drill-down report the new bucket for those historical rows. → CAT038-03 · `pnpm api test:integration catalogo-rebucket`
- [ ] 12.6 Modify `reclasificar-categoria.int-spec.ts`: reclassifying to a **user-created** category succeeds and persists that row's real id; reclassifying to a nombre absent from the caller's catalog ⇒ a clean **generic `400`**, never an enumerated list. → CAT037-04 · `pnpm api test:integration reclasificar-categoria`
- [ ] 12.7 `[GATE]` Full integration regression under the widened types: `pnpm api test:integration`. → §8.2

## Phase 13 — Contract regeneration, green matrix, PR

- [ ] 13.1 `[GATE]` `pnpm api openapi:emit` → commit `apps/api/openapi.json`; `pnpm api openapi:check` green (CI gate `ci.yml:185`). Verify the diff is **append-only** on `paths` with no reordering of existing entries. → CAT038-09
- [ ] 13.2 `[GATE]` `pnpm api-client generate` → commit `packages/api-client/src/types.gen.ts`; the `api-client` CI job (`ci.yml:482-504`) regenerates and runs `git diff --exit-code` — confirm zero drift locally first. (`pnpm contract:sync` does 13.1 + 13.2 in one shot.) → CAT038-09 (CA-06)
- [ ] 13.3 `[GATE]` Full matrix green: `pnpm api test` · `pnpm api test:integration` · `pnpm api exec tsc --noEmit` · `pnpm web test` (with **zero** edits under `apps/web/**` / `apps/mobile/**`) · `pnpm api openapi:check`. → proposal success criteria
- [ ] 13.4 `[DOC]` PR #2b body: `📍` dependency diagram (tracker ← PR1 ← PR2a ← **PR2b**); review budget (`additions + deletions`); **generated files (`openapi.json`, `types.gen.ts`) flagged as read-once, not line-by-line, because both are CI drift-gated**; the ILIKE branch taken in 12.3; the accepted risks carried forward (see below). → `chained-pr`
- [ ] 13.5 Open PR #2b targeting PR #2a's branch. After all three children are reviewed and integrated, un-draft the tracker PR and merge **only the tracker** to `main`. → `chained-pr` feature-branch-chain

---

## Accepted risks to restate in the PR bodies (not tasks — do not "fix" them here)

| Risk | Disposition |
|---|---|
| Two concurrent creates of `Mascotas`/`mascotas` both pass the app-level check (the DB unique index is case-**sensitive**) | Accepted: degrades to two similarly-named categories, never corruption. A `citext`/functional-index migration is the trigger-gated fix — **not this change** (no migration, §9 constraint 5) |
| `apps/web`'s hardcoded 8-name reclassify `<select>` goes stale after a rename | Accepted and documented: clean `400`, no data damage; closed by **US-043** |
| `code` exists on the 4 new paths but not on the ~13 pre-existing operations | Accepted debt with a named trigger: **the first time a second resource family needs a machine-readable code**, promote `CatalogoErrorResponse` to a shared `ErrorResponse` in one dedicated change |
| The re-stamp `updateMany` is a single unbounded statement | Bounded by one user's transactions for one category; no pagination. Trigger: the first re-bucket that visibly blocks a request |
| User-supplied REGEX can block the single-threaded event loop | 200-char cap + write-time compile check now; `re2`/execution timeout is the deferred fix, trigger = first slow-ingesta report |

---

## Traceability — every requirement and design decision maps to ≥1 task

| Source | Tasks |
|---|---|
| **CAT038-01** create requires nombre + assignable bucket | 9.3, 9.4, 11.1–11.6, 12.2 |
| **CAT038-02** GET returns caller's catalog with nested patterns | 9.1, 9.2, 10.1, 11.3–11.6, 12.1, 12.2 |
| **CAT038-03** rename + re-bucket, atomic history re-stamp | 9.5, 9.6, 10.1, 10.2, 12.2, 12.5 |
| **CAT038-04** delete rejects in-use, cascades patterns | 9.7, 9.8, 10.1, 10.2, 12.2 |
| **CAT038-05** pattern CRUD, match types, uniqueness, priority | 9.9–9.14, 10.3, 10.4, 12.2 |
| **CAT038-06** write-time REGEX check; `coincide()` still degrades | 2.4 (guardrail), 9.9, 9.10 |
| **CAT038-07** ownership isolation + anti-enumeration 404 | 4.7, 4.8, 8.3, 10.1–10.4, 11.8, 12.1 |
| **CAT038-08** demo read-only | 7.1–7.6, 8.1, 8.2, 9.3–9.14, 11.5, 11.6, 12.4 |
| **CAT038-09** contracts stay in sync | 11.1, 11.7, 13.1, 13.2 |
| **CAT037-04 (MODIFIED)** reclassify unconstrained by a closed set | 2.2, 2.3, 3.5–3.7, 4.9, 4.10, 5.1, 5.2, 12.6 |
| **CAT037-06 (MODIFIED)** read fold: ownership is the sole authority | 4.3, 4.4, 4.11 |
| **Q1** new ADR-037 + ADR-036 pointer | 1.1–1.5 |
| **Q2** `code` on new endpoints only, registered in the contract | 8.1, 11.2, 11.7 |
| **Q3** one error class per remediation | 8.1, 8.2 |
| **Q4** partial PATCH bodies | 9.5, 9.11, 11.1 |
| **Q5** categorization carries `categoriaId`; `userId` made load-bearing | 3.1–3.5, 4.7, 4.8, 5.3, 5.4 |
| **D-01** ownership is the authority | 4.3, 4.4 |
| **D-02** template keeps a compile-time proof | 4.1, 4.2, 5.5 |
| **D-03** nested category in `PatronClasificacion` | 2.4, 2.5, 4.5, 4.6 |
| **D-04** two ports; demo rule is a required input | 8.3, 9.x |
| **D-05** demo guard duplicated on purpose | 9.3–9.14 (Phase 9 preamble) |
| **D-06** delete predicate inside the write statement | 10.1, 10.2 |
| **D-07** re-stamp triggered by the patch's shape | 9.5, 9.6, 10.1, 10.2, 12.5 |
| **D-08** tie-break strengthened; listing exposes it | 3.1 (guardrail), 9.1, 10.1 |
| **D-09** `.safeParse()` at the boundary, `.strict()`, no echo | 11.1, 11.2, 11.5, 11.6 |
| **D-10** `crearCatalogo` composition | 11.8 |
| **§4.4 correction 1** `express-request.d.ts` under `http/auth/` | 7.6 |
| **§4.4 correction 2** backfill needs more than an import fix | 5.3, 5.4, 5.6 |
| **§4.4 correction 3** `prisma-catalogo-clasificacion` include widening | 4.5, 4.6 |
| **§4.4 addition** `seed.ts` + `seed-catalog.spec.ts` | 5.5 |
| **§5.2 MUST-VERIFY** ILIKE wildcard | 12.3 |
| **§9 constraint 2** compiler-driven slice order | 2.1, 6.1 |
| **§9 constraint 4** guardrails not weakened | 2.4, 3.1 |
| **§9 constraint 5** no migration | 0.3 |
| **§9 constraint 7** ADR-036 staleness | 1.3 |
| **PR1 proof obligation** | 6.1–6.7 |

---

## Parallel vs sequential

**Strictly sequential (dependency-ordered):** Phase 0 → PR1 (Phase 1 ∥ Phase 2 → 3 → 4 → 5 → 6) → PR2a (7 → 8 → 9) → PR2b (10 → 11 → 12 → 13). The layer order inside PR1 is **compiler-driven** (2.1's red list, worked domain → application → infrastructure → prisma scripts → specs); jumping ahead of it re-introduces the "fix it to compile" hazard that changes behaviour silently.

**Parallelisable within a phase** (marked `[P]`, single writer, no shared file):
- 1.1–1.5 (docs) run in parallel with all of Phase 2–5.
- 2.2 (errors) ∥ 2.4 (VO).
- 3.1/3.2 (categorizar) ∥ 3.3/3.4 (agrupar).
- 4.11 ∥ 4.9/4.10.
- 5.3/5.4 (backfill) ∥ 5.5 (seed).
- 8.1/8.2 (13 error classes) ∥ 8.3 (ports).
- 10.1/10.2 (categoria adapter) ∥ 10.3/10.4 (patron adapter).
- 11.1/11.2 (schemas) ∥ 11.3/11.4 (DTOs); both must precede 11.5.
- 12.1, 12.2+12.3, 12.4, 12.5, 12.6 are independent spec files but **share one database** — run them sequentially unless the int harness isolates per-suite data.

**Bottlenecks to watch:** 2.1 gates all of PR1 (nothing else can start until the red list exists); 11.7 gates 13.1/13.2 (the contract cannot be emitted before the paths are registered); 12.3's outcome can force a rework of the uniqueness comparison in 9.3/9.5/9.9/9.11 and 10.1/10.3 — run it as early in Phase 12 as the surface allows.
