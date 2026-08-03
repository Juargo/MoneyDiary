# Exploration: openapi-contract-express — producing `openapi.json` on Express + TS strict

> SDD explore artifact. Hybrid store — mirror of Engram topic `sdd/openapi-contract-express/explore` (id 426). No decision here; option map + tradeoffs for the propose phase.

## Driver

The DAST layer of ADR-021 (OWASP ZAP API scan + Schemathesis) is schema-driven — it needs `openapi.json`, which does not exist. ADR-011 decided to emit it via `@nestjs/swagger`, but ADR-028 migrated the backend NestJS→Express, killing that mechanism. Producing `openapi.json` on Express is the remaining prerequisite to enabling DAST (the ephemeral-DB CI environment prerequisite is now done — the `integration` job in `ci.yml`).

## Current State

- **ADR-011** decided `openapi.json` emitted by `@nestjs/swagger` from annotated controllers/DTOs, committed, with a CI drift check. Its **Option B (Zod as contract source) was rejected for two NestJS-specific reasons**: (1) "inverts the dependency direction" — contract in a package NestJS imports, coupling domain to the shared schema; (2) forces DTOs via `nestjs-zod` instead of idiomatic `class-validator` + `@ApiProperty`.
- **ADR-028** removed NestJS/decorators/DI magic. No `SwaggerModule`, no `@ApiProperty`. ADR-011's emission mechanism is dead and was never rebuilt.
- **ADR-012**'s `packages/api-client` (openapi-typescript client for web+mobile) was **never built** — tracked debt. Today the HTTP contract is hand-duplicated: backend DTOs (`apps/api/src/infrastructure/http/dto/*.dto.ts`, plain TS interfaces + hand-written mappers) + `apps/web/src/api/types.ts` (hand-mirrored) + mobile.
- **ADR-021** DAST is explicitly gated on `openapi.json` existing; it is now the single remaining blocker for DAST.
- **Current Express route/DTO pattern** (`infrastructure/http-express/routes/*.routes.ts`): closure-DI functions, manual try/catch → `next(err)`, manual `Result<T,E>` → HTTP translation, and **hand-rolled request validation** (documented in code: "valida el body a mano, sin class-validator"). No schema validation library at the HTTP boundary today.
- **Key discovery**: `zod` (`^4.4.3`) is already a direct dependency of `apps/api`, used in `src/config/env.ts` (ADR-029) for env validation. Introducing Zod for HTTP contracts is a new *usage context*, not a new unvetted dependency.
- Response DTOs encode BigInt-safe money-as-decimal-string, basis-point percentages, lowercase wire enums — any mechanism must express these precisely.

## Affected Areas

- `apps/api/src/infrastructure/http-express/routes/*.routes.ts` (6 files)
- `apps/api/src/infrastructure/http/dto/*.dto.ts` (8 files)
- `apps/api/src/config/env.ts` — precedent for this repo's Zod usage style
- `apps/web/src/api/types.ts` — downstream consumer, still hand-mirrored
- `.github/workflows/ci.yml` — `api` job (emit + drift check), `security` job (eventual DAST)
- `docs/adr/ADR-011-*`, `ADR-012-*` — both describe dead NestJS mechanics as current; need amendment/supersession

## Approaches

1. **Hand-authored `openapi.json`** + CI drift check. Pros: zero tooling, total control. Cons: reintroduces the exact hand-sync risk ADR-011 exists to kill (a 4th manual copy); no runtime boundary validation; no guarantee JSON matches route behavior. Effort: low now, high maintenance.
2. **Zod as contract source** → `zod-openapi` or `@asteasolutions/zod-to-openapi` (both Zod-4-native in 2026). Handlers `.parse()`/`.safeParse()` the same schema used to generate the spec. Pros: one schema = compile-time type + runtime validator + OpenAPI source; closes the currently-unaddressed HTTP-boundary validation gap; fits closure-DI/no-decorators Express; Zod already vetted here; strongest sync guarantee for DAST. Cons: ADR-011's rejection reasoning must be re-examined (Reason 1 likely moot if schemas stay in `infrastructure/http-express/`, not a shared package — CONFIRM in propose; Reason 2 moot post-migration); still a "new pattern" (KISS: requires ADR-level justification); non-trivial diff across 6 routes + 8 DTOs. Effort: medium — pays for itself by removing hand-rolled validation.
3. **Generate from TypeScript types** (`tsoa`, `ts-json-schema-generator`). `tsoa` needs decorator-based controllers — reintroduces exactly the decorator/DI magic ADR-028 removed. `ts-json-schema-generator` avoids decorators but emits JSON Schema (needs conversion) and leaves the boundary unvalidated. Effort: medium-high; architecturally regressive or plumbing-without-payoff.
4. **express-zod-api / opinionated frameworks.** Replaces the hand-wired Router + closure-DI with the framework's DSL — too invasive right after ADR-028 simplified this. Rejected on YAGNI/KISS. Effort: high.
5. **Runtime spec endpoint vs committed artifact** (orthogonal). Committed artifact (build-time `emit` script) matches ADR-011's posture: diffable PR contract, no public `/api-docs` in prod, supports `git diff` drift check. Runtime endpoint is simpler for ZAP/Schemathesis to fetch but adds a discoverable surface unless gated to non-prod. Not mutually exclusive.

## Recommendation (a lean for propose to validate, NOT a decision)

**Approach 2 (Zod as contract source, schemas owned inside `infrastructure/http-express/` — not a new shared package) + 5(a) committed `openapi.json` + CI drift check.** Only option that both closes the real runtime-validation gap (hand-rolled parsing in every route) and produces the artifact, using an already-audited, precedented dependency. Survives re-examination of ADR-011's rejection PROVIDED propose explicitly confirms schemas stay in the infrastructure layer — the one open question.

## Risks

- ADR-011/ADR-012 need explicit amendment/supersession (both describe dead NestJS mechanics as authoritative).
- Scope creep: "produce openapi.json" can balloon into "also build ADR-012's `packages/api-client`" — separate debt, keep out unless deliberately pulled in.
- Route-file rewrite blast radius (6 routes + 8 DTOs on money/auth endpoints) — needs ADR-015-level TDD care.
- DAST enablement is bigger than the artifact: wiring ZAP/Schemathesis into CI is likely a follow-up change.
- OpenAPI 3.0 vs 3.1 unpinned; Zod generators default to 3.1 in 2026 — confirm ZAP/Schemathesis compatibility when picking the tool.

## Ready for Proposal

Yes. State is clear, option space bounded, and the one open unknown (does Zod-in-infrastructure survive ADR-011's dependency-direction objection) is answerable in propose.
