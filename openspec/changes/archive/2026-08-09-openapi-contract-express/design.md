# Design: openapi-contract-express — Zod-sourced `openapi.json` on Express

> SDD design artifact. Hybrid store — mirror of Engram topic `sdd/openapi-contract-express/design`.
> Reads from `proposal.md` (Engram `sdd/openapi-contract-express/proposal`). This is the HOW at the
> architectural level: library + version, layout, emit determinism, CI wiring, boundary/response contract,
> slice mapping, ADR amendment intent. Not the per-endpoint spec, not the task list, not code.

## Decision (lead)

**Library: `zod-openapi` pinned to exact `5.4.2`. OpenAPI output: `3.1.0`.**

This **overrides the proposal's `3.0.3` lean** and resolves the proposal's internal contradiction (it recommended
`zod-openapi` *and* `3.0.3`, which are mutually incompatible — `zod-openapi` emits **only** OpenAPI 3.1.x, never
3.0.x). The library choice wins and drags the OpenAPI version to 3.1 with it, because the two decisive forces both
point the same way:

1. **Repo ethos (dominant force).** Post-ADR-028 the entire thesis was *remove hidden wiring / no magic*. The
   alternative library, `@asteasolutions/zod-to-openapi`, **requires `extendZodWithOpenApi(z)`** — a global
   side-effect monkey-patch on the shared `z` object. That directly contradicts the ethos this very proposal
   leans on. `zod-openapi` uses Zod-4-native metadata (`.meta()`) and an explicit `createDocument()` call — no
   global patch, High reputation, clean fit for a build-time emit script.
2. **Consumer safety no longer favors 3.0.** The only argument for 3.0.3 was DAST-consumer compatibility (OWASP
   ZAP import + Schemathesis). In 2026 both import/handle OpenAPI **3.1 cleanly** (Schemathesis has supported 3.1
   for a long time via JSON-Schema-2020-12; ZAP's OpenAPI add-on imports 3.1). With the compatibility doubt gone,
   the 3.0-safety argument collapses and `zod-openapi`'s ergonomics + no-magic posture win.

**Assumption this rests on:** ZAP's OpenAPI import and Schemathesis both consume 3.1.0 against *this* spec without
loss. **Trigger to revisit:** the follow-up DAST change finds a concrete 3.1 incompatibility in ZAP's import or
Schemathesis's schema handling against this exact `openapi.json`. **If triggered:** the money DTOs are simple
(`string`, `number | null`, small enums) so a downgrade is bounded — but note `zod-openapi` cannot emit 3.0, so a
downgrade would mean swapping to `@asteasolutions/zod-to-openapi` (`OpenApiGeneratorV3`) and re-expressing the
`.meta()` registrations as `.openapi()`. That is the accepted, documented cost of taking the cleaner library now.

## Details

| Topic | Decision |
|-------|----------|
| Library | `zod-openapi` — High reputation, Zod-4-native, no global patch, explicit `createDocument()` |
| Version (exact pin) | `5.4.2` (no caret). Emits OpenAPI 3.1.0 / 3.1.1. Zod 4 native, Node ≥ 22 OK (repo `.node-version` = 22.22.3) |
| OpenAPI output | `3.1.0` via `createDocument({ openapi: '3.1.0', ... })` |
| Zod import | Keep repo style `import { z } from 'zod'` (repo is zod-4-only at `^4.4.3`, so `.meta()`/`toJSONSchema()` resolve; the `zod/v4` subpath is only for v3/v4 coexistence — not needed here) |
| v6 note | `zod-openapi@6` exists (adds 3.2, needs Node ≥ 22.14 — satisfied). **Deferred (YAGNI):** we need 3.1, not 3.2. Upgrade only when a real 3.2 need appears |
| Schemas dir | `apps/api/src/infrastructure/http-express/schemas/` (new) — infrastructure-only, never imported by `domain`/`application` (ADR-005) |
| Committed artifact | `apps/api/openapi.json` — co-located in the api workspace so the existing CI `api:` path filter (`apps/api/**`) already triggers the drift-check |
| Emit script | `apps/api/scripts/emit-openapi.ts` (mirrors existing `scripts/gen-env-example.ts`) |
| npm scripts | `"openapi:emit"` (write) + `"openapi:check"` (`--check`, compare-only, exit 1 on drift) — mirrors `env:example` / `env:example:check` |
| CI slot | New step in the existing `api` job, right after `env:example:check`: `pnpm api openapi:check` |
| Naming | Infrastructure layer → English (repo convention): `schemas/`, `resumen.schema.ts`, `buildOpenApiDocument()` |

## Component map & data flow

Single source of truth per endpoint: **one Zod schema object, two consumers.** The same
`resumenQuerySchema` / `resumenResponseSchema` are imported by (a) the route handler for `.safeParse()` and typing,
and (b) the document builder for the spec. There is no second hand-copy.

```
apps/api/src/infrastructure/http-express/
  schemas/
    version.schema.ts        ← response schema for GET /version (Slice 0)
    resumen.schema.ts        ← query + response schemas for GET /api/resumen (Slice 1)
    <one file per endpoint as rollout proceeds>
    openapi-document.ts      ← buildOpenApiDocument(): pure, no container/env/DB.
                               imports every schema + static route metadata,
                               calls createDocument({ openapi:'3.1.0', info, paths })
  routes/
    version.routes.ts        ← (Slice 0) response only, no request validation
    resumen.routes.ts        ← (Slice 1) .safeParse(req.query) with resumenQuerySchema
apps/api/scripts/
  emit-openapi.ts            ← ts-node script. import buildOpenApiDocument, sortKeysDeep,
                               write / --check apps/api/openapi.json
apps/api/openapi.json        ← the committed artifact (drift-checked)
```

Flow:

```
Zod schema (schemas/*.schema.ts)
   ├─(a) route handler: request .safeParse() + response type ──→ runtime boundary
   └─(b) buildOpenApiDocument() ──→ emit-openapi.ts ──→ apps/api/openapi.json (committed)
                                                            └─ CI: openapi:check regenerates & diffs
```

`buildOpenApiDocument()` MUST be importable without booting the app — no `container`, no `loadEnv()`, no Prisma. It
is pure metadata assembly, which is why the emit script and tests can call it cheaply and why the CI step runs in
the DB-less `api` job.

## Determinism (how false drift is prevented)

The drift-check only works if regeneration is byte-identical. Four levers, all explicit:

1. **Pinned library, exact version.** `zod-openapi@5.4.2` (no `^`) + `pnpm install --frozen-lockfile` in CI. The
   lib version is a determinism input — a bump can change output, so it is pinned like the repo's other
   supply-chain-sensitive deps.
2. **Ordered registration.** `buildOpenApiDocument()` registers endpoints via an explicit, fixed array/sequence
   (not iteration over a mutable map), so `paths` insertion order is stable.
3. **Canonical key sort before serialize.** The emitted object passes through a small recursive `sortKeysDeep()`
   that sorts **object keys** alphabetically. Arrays (`required`, `enum`, `buckets`) keep their element order —
   sorting touches keys only, never array order — so this is a safe canonical form independent of any
   library-internal insertion quirk.
4. **Fixed formatting, Prettier excluded.** Emit is exactly `JSON.stringify(sorted, null, 2) + '\n'`. Add
   `apps/api/openapi.json` to `.prettierignore` so lint-staged/Prettier never reformats it and fights the emit.
   The `--check` mode regenerates the same string in memory and compares against the file — no git state needed.

**Why `--check` over `git diff --exit-code` (proposal wording):** functionally equivalent, but `--check` mirrors
the established `env:example:check` precedent, works on a dirty tree, and gives a targeted "run `pnpm api
openapi:emit`" message. Same guarantee, repo-consistent.

## Runtime boundary validation (preserve the wire contract)

The current `resumen.routes.ts` normalizes input with a hand-rolled `queryString()` helper and returns a **scrubbed
`{ message: string }`** 400 that never reflects raw input. Two rules keep that contract intact:

1. **Boundary schema validates transport shape only — NOT domain format.** `resumenQuerySchema` asserts `periodo`
   is an optional string (replacing `queryString()`), and nothing more. It **must not** encode the `YYYY-MM` regex.
   The `YYYY-MM` rule is a **domain** rule (`PeriodoMes` VO → `PeriodoInvalidoError`), and ADR-005 + DRY say it
   lives in exactly one place: the domain. Duplicating it at the boundary would create two sources of truth with
   divergent messages. Result: two distinct 400s, **both** `{ message }`-shaped and scrubbed —
   - transport-shape violation (e.g. `periodo` sent as an array) → boundary 400,
   - malformed `YYYY-MM` string → unchanged domain `PeriodoInvalidoError` → existing 400.
2. **Zod failure maps to the existing scrubbed shape, never `error.issues`.** On `!parsed.success` the handler
   responds `res.status(400).json({ message: '<fixed message>' })`. Zod's `issues` can echo the offending input, so
   they are **never** serialized — the fixed-message scrub (money/input scrub, ADR-015 boundary posture) is
   preserved verbatim. The wire error contract does not change.

## Response schema honesty (the sync guarantee)

The response schema is a 4th place the DTO shape is written, so it can silently diverge. The **test is the sync
guarantee**, not decoration:

- `resumenResponseSchema` mirrors `ResumenMesDto` exactly: `totalIngreso: z.string()`, `porcentajeBp:
  z.number().int().nullable()`, `estadoSemaforo: z.enum(['verde','amarillo','rojo']).nullable()`, `buckets`
  (array of the 4-entry bucket shape), `targets` object, `estadoGlobal` nullable enum.
- **Strict-TDD assertion (`pnpm api test`):** a unit test feeds a real domain fixture through the existing mapper
  (`aResumenMesDto(...)`) and asserts `resumenResponseSchema.parse(output)` does **not** throw; a companion
  assertion proves the schema **rejects** a wrong shape (e.g. money as `number`). Plus one HTTP-level check
  (supertest against `createApp`) asserting the live 200 body parses. If the mapper output ever drifts from the
  schema, the test goes red → the schema (and therefore the emitted spec) stays honest.

## Slice mapping

| Slice | Endpoint | Proves | Stands up |
|-------|----------|--------|-----------|
| **0** | `GET /version` (public, no `/api`, no query) | Toolchain end-to-end, near-zero domain risk | `schemas/` dir, `version.schema.ts` (response only), `buildOpenApiDocument()` skeleton + `info`, `sortKeysDeep`, `emit-openapi.ts`, `openapi:emit`/`openapi:check` scripts, committed `apps/api/openapi.json`, `.prettierignore` entry, CI `openapi:check` step |
| **1** | `GET /api/resumen` (`periodo` query + rich DTO) | Request validation replacing `queryString()` **and** the full BigInt-safe response contract (money-as-string, `porcentajeBp` number\|null, lowercase enums, nested `buckets`). Go/no-go gate for the whole pattern | `resumen.schema.ts` (query + response), boundary `.safeParse` wiring, response-honesty test |
| Rollout | remaining reads (`/resumen/anual`, movimientos, transacciones GET, buckets), then writes/sensitive (auth, ingesta upload, reclasificar) with extra ADR-015 TDD care | one route file (± its DTOs) per slice; spec regenerated + `openapi:check` green each time | — |

**Slice 0 stays its own commit** (not folded into Slice 1): its value is standing up the registry + emit + CI +
committed file with zero money risk. Fold only if it collapses to a handful of lines in practice.

**TDD order per slice (RED → GREEN):** (1) write the schema spec (query rejects bad shape / accepts good;
response parses a good DTO fixture and rejects a bad one) + the boundary test (bad-shape request → 400 `{ message }`)
— these fail; (2) create `<endpoint>.schema.ts`, wire `.safeParse` in the route, register the path in
`buildOpenApiDocument()`; (3) `pnpm api openapi:emit`, commit the updated `apps/api/openapi.json`, `pnpm api
openapi:check` green.

## CI wiring

Add one step to the existing **`api`** job in `.github/workflows/ci.yml`, immediately after the
`env:example:check` step (both are DB-less contract-drift guards, same shape):

```yaml
- name: Check openapi.json is up to date
  run: pnpm api openapi:check
```

No new job, no DB, no Prisma dependency (the emit script imports schemas only, never boots the app). The `api:`
path filter (`apps/api/**`) already covers both the schemas and the committed `apps/api/openapi.json`, so any
contract change triggers this check. The single stable required check (`ci-success`) already aggregates the `api`
job, so nothing else changes.

## ADR amendment intent (prose written in apply, not here)

- **ADR-011 → AMEND (not supersede-whole).** Goal preserved (contract-first, committed diffable `openapi.json`, CI
  drift-check, no public prod docs endpoint). Only the **mechanism** changes: `@nestjs/swagger` (dead since
  ADR-028) → Zod-sourced emit via `zod-openapi@5.4.2`, OpenAPI 3.1.0, schemas in `infrastructure/http-express/`.
  The amendment records that the two original reasons ADR-011 rejected "Zod as contract source" are now **moot**:
  (Reason 1, dependency-direction) schemas live in the outermost infra layer, no shared package, ADR-005 arrow
  intact; (Reason 2, `nestjs-zod` vs `class-validator`) N/A — NestJS is gone, routes validate by hand today, Zod
  is a strict improvement. It also records the **3.0.3 → 3.1 reversal** and its rationale (library ethos +
  confirmed 3.1 tool compatibility) with the revisit trigger above. Spanish prose matching existing ADR style.
- **ADR-012 → NOTE only (not superseded).** Add a note: its `@nestjs/swagger`-era emit mechanics are **dead**
  (removed by ADR-028); `packages/api-client` remains **unbuilt/deferred debt** (YAGNI — not built here); the
  `openapi.json` this change produces is the future input for that client when it is eventually built.
- Design does **not** author final ADR prose — it fixes the intent so `sdd-tasks`/`sdd-apply` write it.

## Risks

| Risk | Mitigation / status |
|------|---------------------|
| 3.1 turns out incompatible with ZAP/Schemathesis when DAST is wired | Documented assumption + revisit trigger above; downgrade path is a library swap (bounded, simple DTOs). DAST is a separate follow-up change — the doubt is deferred, not shipped |
| `zod-openapi` v5 `createDocument` API details differ from assumption | Apply phase confirms exact `createDocument`/`.meta()` signatures against v5.4.2 docs (Context7/npm) before wiring — design fixes intent, not call syntax |
| Non-deterministic emit → false drift | 4 explicit levers (pinned exact version, ordered registration, `sortKeysDeep`, fixed format + `.prettierignore`) |
| Response schema silently diverges from mapper output | Strict-TDD parse-the-real-output assertion is the sync guarantee (mapper unit + one HTTP-level parse) |
| Boundary schema duplicates the domain `YYYY-MM` rule | Explicit rule: boundary validates transport shape only; format stays a domain rule (ADR-005 + DRY) |
| Scrubbed-400 contract regressed by leaking Zod `issues` | Handler maps `!success` to fixed `{ message }`; `issues` never serialized |
| Blast radius across 6 routes + 8 DTOs on money/auth paths | Slice it; strict-TDD per slice; `pnpm api test` + `openapi:check` green before each merge; prove on read-only `/api/resumen` first |

## Next

`sdd-tasks` (after spec is ready). Tasks must cover: (Slice 0) add `zod-openapi@5.4.2`, create `schemas/` +
`version.schema.ts` + `buildOpenApiDocument()` + `sortKeysDeep` + `emit-openapi.ts` + `openapi:emit`/`openapi:check`
scripts + committed `apps/api/openapi.json` + `.prettierignore` + CI step; (Slice 1) `resumen.schema.ts` (query +
response), boundary `.safeParse` wiring, response-honesty test; then the ADR-011 amendment + ADR-012 note. Each
slice strict-TDD, `openapi:check` green.
