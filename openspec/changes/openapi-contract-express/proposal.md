# Proposal: openapi-contract-express — Zod-sourced `openapi.json` on Express

> SDD propose artifact. Hybrid store — mirror of Engram topic `sdd/openapi-contract-express/proposal`.
> Reads from `explore.md` (Engram id 426). This is a PROPOSAL: intent, scope, approach, risk, slicing —
> not the spec, not the design, not code.

## Intent

**Problem.** The API has no `openapi.json`. ADR-011 decided to emit it via `@nestjs/swagger`, but ADR-028
removed NestJS entirely — that mechanism is dead and was never rebuilt. The missing artifact is now the single
remaining blocker for the ADR-021 DAST layer (OWASP ZAP API scan + Schemathesis), which is schema-driven and
cannot run without a spec. Separately, every Express route today validates its request **by hand** (documented
in code as "valida el body a mano, sin class-validator") — there is no schema validation library at the HTTP
boundary, so malformed input is caught ad hoc, per route, with no single source of truth.

**Why now.** The ephemeral-DB CI prerequisite for DAST is already done (the `integration` job in `ci.yml`).
`openapi.json` is the last thing standing between the current pipeline and schema-driven security testing.

**Success looks like.** A committed, accurate `openapi.json` that is provably in sync with runtime behavior,
plus a CI drift-check that fails the build if the spec and the code diverge — and, as a direct by-product,
runtime request validation at the HTTP boundary replacing the hand-rolled parsing. Success is explicitly NOT
"DAST is running" (that is the downstream change this one unblocks) and NOT "the api-client exists" (ADR-012 debt).

## Scope

### In scope

- Introduce **Zod as the single contract source of truth** for the HTTP layer: one schema per request/response
  shape that (a) validates at runtime at the boundary and (b) generates the OpenAPI document.
- Schemas **co-located inside `apps/api/src/infrastructure/http-express/`** (e.g. a new `schemas/` directory
  alongside `routes/`). Never a shared package. Never imported by `domain`/`application`.
- A **build-time emit script** that produces a **committed `openapi.json`**.
- A **CI drift-check**: regenerate the spec and `git diff --exit-code` so the committed artifact cannot rot.
- **Runtime boundary validation**: handlers `.safeParse()` the same request schema used to generate the spec,
  replacing the current hand-rolled query/body parsing.
- **Amend/supersede ADR-011's mechanism** for the Express stack, and add a note to ADR-012 that its NestJS
  mechanics are dead (see "ADR amendment intent").
- Rollout **sliced** across the ~6 route files + ~8 DTOs, proven first on one low-risk read endpoint.

### Out of scope (explicit non-goals)

- **NOT** building ADR-012's `packages/api-client` (openapi-typescript consumer for web/mobile). Separate tracked debt.
- **NOT** wiring the ADR-021 DAST (ZAP + Schemathesis) into CI. That is a **follow-up change** that *consumes*
  the `openapi.json` this change produces. DAST is the motivating downstream, not in-scope work here.
- **NOT** replacing the hand-mirrored `apps/web/src/api/types.ts` / mobile types. Still hand-authored after this;
  their elimination is the api-client debt above.
- **NOT** exposing a public prod `/api-docs` or runtime spec endpoint. The artifact is the committed file,
  matching ADR-011's original review/security posture (diffable PR contract, no discoverable prod surface).
- **NOT** changing `domain` or `application`. As with ADR-028, the Clean-Architecture isolation (ADR-005) means
  this is an infrastructure-only change.
- **NOT** adopting an opinionated framework (express-zod-api et al.) that rewrites the hand-wired Router +
  closure-DI. Rejected on YAGNI/KISS right after ADR-028 simplified exactly that.

## Approach (high level)

**Mechanism (locked): Zod as contract source + committed artifact + CI drift-check.**

1. For each endpoint, define request and response schemas in `http-express/schemas/`. The response schema must
   express the existing wire contract *precisely*: money as BigInt-safe **decimal string**, `porcentajeBp` as
   **`number | null`** (basis points ≤ 10000), lowercase wire enums (`'verde' | 'amarillo' | 'rojo' | null`),
   nested arrays (e.g. the 4-entry `buckets`). The existing mapper functions (`aResumenMesDto`, …) stay as-is;
   the schema documents and guards the object they already produce.
2. Handlers `.safeParse()` the **request** schema at the boundary, returning the existing scrubbed 400 shape on
   failure — this replaces the hand-rolled `queryString()` / manual body parsing without changing the error contract.
3. A registry collects every schema + route metadata; a **build-time emit script** (e.g. `pnpm api openapi:emit`)
   writes a **committed `openapi.json`**. Emission must be **deterministic** (stable key order, pinned library
   version, formatted output) so the drift-check produces no false diffs.
4. CI adds a step to the `api` job: re-run the emit script and `git diff --exit-code openapi.json`. A diff = the
   code changed the contract without regenerating the spec = red build.
5. Strict-TDD throughout (`pnpm api test`): schema + failing boundary test first, then the handler wiring.

**Why this is a *new pattern* worth its ADR-level cost (KISS gate).** It is the only option that both closes the
real, currently-unaddressed runtime-validation gap *and* produces the required artifact, using a dependency
already vetted and in use in this repo — `zod` (`^4.4.3`) already powers env validation in `config/env.ts`
(ADR-029). This is a new *usage context* for an existing dependency, not a new unvetted one.

### Library recommendation (design phase MUST pin exact versions)

> ⚠️ Live 2026 docs were not reachable from this executor (Context7 tools unavailable here). The lean below is
> from general knowledge; the **design phase MUST verify against current docs/npm** (Context7 or npm) and pin
> exact versions before implementation. Treat this as a recommendation to validate, not a settled fact.

- **Recommend `zod-openapi`** over `@asteasolutions/zod-to-openapi`. Rationale to confirm at design time:
  - `zod-openapi` integrates through Zod's native metadata registry (`.meta()` / `z.openapi()`), which fits
    Zod 4's native design and avoids monkey-patching the global `z`. `@asteasolutions/zod-to-openapi` requires
    `extendZodWithOpenApi(z)`, a global side-effect that sits awkwardly with the repo's explicit/no-magic ethos
    (post-ADR-028 the whole point was removing hidden wiring).
  - `zod-openapi` exposes an explicit `createDocument()` call that maps cleanly onto a build-time emit script.
  - Both are Zod-4-capable in 2026 and both can target OpenAPI 3.0 and 3.1 — so this is a fit/ergonomics call,
    not a capability gap. Design phase confirms the current Zod-4 peer range for whichever is chosen.

- **OpenAPI version: recommend emitting `3.0.3` for the first cut**, with a documented trigger to revisit 3.1.
  - The artifact's entire reason to exist is to feed the ADR-021 DAST consumer (ZAP + Schemathesis). Optimize
    the artifact for its consumer. ZAP's OpenAPI import and Schemathesis are both most battle-tested on 3.0;
    3.1 (JSON-Schema-2020-12 aligned, `type: [..,"null"]` unions) support has been catching up but is riskier.
  - The money DTOs (`string | null`, `number | null`) express cleanly in 3.0 via `nullable: true`.
  - Modern Zod generators default to **3.1** in 2026 — so 3.0 is an explicit `openapi: '3.0.3'` option, not the default.
  - **Trigger to move to 3.1:** the follow-up DAST change confirms both ZAP and Schemathesis handle 3.1 cleanly
    against this spec. Until then, 3.0.3 is the compatibility-first, consumer-driven, YAGNI-aligned call.

### Affected areas

| Area | Change |
|------|--------|
| `apps/api/src/infrastructure/http-express/routes/*.routes.ts` (~6) | request `.safeParse()` + response typed by schema |
| `apps/api/src/infrastructure/http/dto/*.dto.ts` (~8) | schemas describe these shapes; mappers unchanged |
| `apps/api/src/infrastructure/http-express/schemas/` (new) | request/response Zod schemas + OpenAPI registry |
| emit script (e.g. `apps/api/scripts/emit-openapi.ts` + `openapi:emit`) (new) | build-time spec generation |
| `openapi.json` (new, committed — final path TBD in design) | the artifact |
| `.github/workflows/ci.yml` — `api` job | regenerate + `git diff --exit-code` drift-check |
| `docs/adr/ADR-011-*`, `docs/adr/ADR-012-*` | amendment/supersession notes (see below) |
| `config/env.ts` (ADR-029) | precedent only — the repo's Zod usage style; not modified |

## ADR amendment intent

This change **amends/supersedes ADR-011's *mechanism*** (not its goal) for the Express stack, and defuses the
two NestJS-specific reasons ADR-011 originally rejected "Zod as contract source":

- **Reason 1 — "inverts the dependency direction" (contract in a package NestJS imports, coupling domain to a
  shared schema): MOOT.** Schemas live in `infrastructure/http-express/`, the outermost layer, co-located with
  the routes that already own the HTTP concern. There is no shared package. `domain` and `application` never
  import them. The dependency arrow still points strictly inward (ADR-005: `domain ← application ← infrastructure`).
  The proposal states this explicitly because it is the one open question the explore flagged — and the answer is
  yes, Zod-in-infrastructure survives the objection.
- **Reason 2 — "forces `nestjs-zod` instead of idiomatic `class-validator` + `@ApiProperty`": MOOT.** ADR-028
  removed NestJS; there is no `class-validator`/`@ApiProperty` idiom left. Routes validate by hand today, so Zod
  is a strict improvement over the status quo, not a substitution of one idiom for another.

ADR-011's *posture* is preserved: committed diffable artifact, CI drift-check, no public prod docs endpoint.
**ADR-012** gets a note that its `@nestjs/swagger`-era mechanics and unbuilt `packages/api-client` are dead/deferred;
building the client stays out of scope. The exact ADR prose is written in the design/apply phase and must match
the existing ADRs' Spanish style for consistency.

## Risks

| Risk | Mitigation |
|------|------------|
| Blast radius: rewriting 6 routes + 8 DTOs on money/auth paths | Slice it (below); strict-TDD per slice (ADR-015 money/access emphasis); `pnpm api test` green before each merge |
| Library/version drift — recommendation made without live docs | Design phase pins exact `zod-openapi` version + confirms Zod-4 peer range + OpenAPI output version via Context7/npm before any code |
| OpenAPI 3.0 vs 3.1 tool compatibility (ZAP/Schemathesis) | Recommend 3.0.3 first (consumer-first); documented trigger to move to 3.1 once the DAST change confirms tool support |
| Drift-check false positives from non-deterministic emit | Emit must be deterministic: stable key order, pinned lib, formatted output — called out as a design constraint |
| Response schema becomes a 4th hand-copy that silently diverges from real handler output | Strict-TDD asserts real handler output `.parse()`s against the response schema, so the tests are the sync guarantee (not just decoration) |
| ADR-011/012 keep describing dead NestJS mechanics as authoritative | Explicit amendment/supersession notes are in scope |
| Scope creep into api-client (ADR-012) or DAST wiring (ADR-021) | Both are explicit non-goals; DAST is named only as the motivating downstream |

## Slicing strategy

Strict-TDD (`pnpm api test`), one route file (± its DTOs) per slice, spec regenerated and CI drift-check green
each time. Prove the pattern on the lowest-risk path before touching money/auth.

- **Slice 0 — plumbing warm-up (`GET /version`).** Public, outside `/api`, no query params, no money. Stands up
  the registry + emit script + committed `openapi.json` + CI drift-check end-to-end with near-zero domain risk.
  Proves the toolchain (schema → spec → committed → CI regenerates & diffs). May be folded into Slice 1 if trivial.
- **Slice 1 — vertical proof (`GET /api/resumen`).** The representative read endpoint: a `periodo` query param
  (proves request validation replacing hand-rolled `queryString`) **and** a rich response DTO (money-as-string,
  `porcentajeBp` number|null, lowercase wire enums, nested `buckets` array) — proves the schema can express the
  full BigInt-safe contract. Read-only, no auth-token creation, money is display-only (not a write path): lowest
  meaningful blast radius. This is the go/no-go gate for the whole pattern.
- **Rollout (subsequent slices).** Remaining read endpoints first (`/resumen/anual`, movimientos, transacciones
  GET, buckets), then the write/sensitive ones (auth, ingesta upload, reclasificar) with extra ADR-015 TDD care.
  Each slice: schema + failing boundary test first, handler wiring, `pnpm api test` green, `openapi.json`
  regenerated, drift-check passing. No blanket rewrite.

## Next

`sdd-spec` and `sdd-design` can run in parallel from this proposal. Design must: pin the exact library + version,
confirm the OpenAPI version against ZAP/Schemathesis, decide the committed `openapi.json` path, and specify the
deterministic-emit + drift-check mechanics. Spec must: capture the per-endpoint request/response contracts and
the CI drift-check acceptance criteria.
