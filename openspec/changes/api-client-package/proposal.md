# Proposal: api-client-package — first slice of ADR-012, generated types only

> SDD propose artifact. Hybrid store — mirror of Engram topic `sdd/api-client-package/proposal`.
> Reads from `explore.md` (same folder). This is a PROPOSAL: intent, scope, approach, risk, slicing —
> not the spec, not the design, not code.
>
> **The ADR-012 decision is not being reopened.** This change *implements it incrementally*, starting
> with the cheapest slice that retires the real risk. The full client stays registered debt with a trigger.

## Intent

**Problem.** Both frontends hand-copy the HTTP contract. `apps/web/src/api/types.ts` is 239 lines of
hand-written DTO mirrors (10 interfaces, each with a comment naming the backend file it mirrors);
`apps/mobile` duplicates a subset again across `client.ts`, `post-ingesta.ts`, `preview-ingesta.ts`.
Nothing mechanically links either copy to the real contract — a backend field rename compiles green in
both apps and fails at runtime.

**Why now.** The contract source finally exists and is *guarded*: `apps/api/openapi.json` is emitted from
Zod schemas and CI fails on drift (`pnpm api openapi:check`, ADR-011 amended 2026-08-02). Drift is retired
**at the source but not at the consumers** — the two hand-copies are now the only unguarded link in the
chain. ADR-012 has been tracked debt since 2026-07-02; the prerequisite it waited on is done.

**Success looks like.** Both apps' DTO shapes are *derived* from `openapi.json` instead of retyped, so a
backend contract change fails `tsc` in web and mobile automatically. Success is explicitly NOT "the
ADR-012 client exists" (deferred, see non-goals) and NOT any change to runtime behavior.

## Scope

### In scope

- Create `packages/api-client` (`@moneydiary/api-client`) — **the monorepo's first shared package** —
  containing generated contract types **and nothing else**. No runtime code ships in this slice.
- Add `packages/*` to `pnpm-workspace.yaml` (`packages:` is `['apps/*']` today).
- A codegen script chained off `apps/api/openapi.json` via `openapi-typescript` → `src/types.gen.ts`,
  plus a thin `src/index.ts` re-exporting `paths` / `components` (the package's public surface).
- **No build step.** See "Approach" — a types-only package needs no `tsup`.
- Adopt in **both** apps: replace hand-written DTO interfaces with type aliases over
  `components['schemas'][...]`, declaring `@moneydiary/api-client: workspace:*` explicitly in both
  `package.json`s (pnpm isolated resolution — it will not hoist).
- **All runtime code stays untouched**: fetch wrappers, `ApiError` taxonomies, and every money-safety
  guard (`esMontoStringValido`, `esFechaValida`, `esResumenMesDto`, …) remain exactly where they are, now
  type-checked against generated types instead of hand-written ones.
- A CI path filter for `packages/**` (none exists today — package-only commits would run zero jobs).
- An **early Metro/Expo spike task** before mobile is wired (see risks).

### Out of scope — non-goals, each with its trigger

| Deferred | Trigger to bring in scope |
|---|---|
| `client.ts` / openapi-fetch + interceptors | After this slice proves workspace + CI + Metro mechanics end to end |
| `TokenStorage` port + DI wiring | Same, **mobile first** (its Bearer + SecureStore shape is the port's natural fit; web's HttpOnly cookie makes it a near-no-op and needs its own design) |
| Unified `errors.ts` taxonomy | Requires reconciling web (`invalid\|unauthorized\|network\|parse\|server`) vs mobile (`unauthorized\|network\|parse\|http`); may change user-facing error copy → needs product sign-off, not just an engineering call |
| Token refresh / retries / offline queue | A future auth ADR (ADR-012 already defers this) |
| npm publication, `release-please` entry | Only if consumed outside the monorepo (`workspace:*`, internal) |
| Turborepo / task-graph orchestrator | When hand-chained pnpm scripts get painful or CI gets slow (ADR-012's own words: "no antes") |
| Moving runtime guards into the package | When the full client lands and "written once" actually applies |

## Capabilities

### New capabilities

- `shared-api-contract-types`: the generated-types package, its regeneration/drift contract, and the rule
  that both apps derive DTO shapes from it rather than retyping them.

### Modified capabilities

- None. This slice changes no observable behavior of any endpoint or screen — it is a type-layer
  substitution. Existing specs (`web-app`, `mobile-resumen-screen`, `api-access-control`, …) keep their
  requirements verbatim.

## Approach

**Two decisions worth stating up front, because they shrink the change and the risk.**

**1. No `tsup`, no build step.** ADR-012 prescribes `tsup` (esm+cjs+dts) so Vite and Metro consume the
package without friction — that constraint exists because the ADR assumed *runtime* code. A types-only
package emits nothing at runtime: `package.json` points `types`/`exports` at the TypeScript source and
the consumers' own compilers read it. Dropping `tsup` removes a dependency, a build artifact, and a
build-ordering edge from CI (KISS; YAGNI — the bundler exists to solve a problem this slice does not have).
`tsup` returns with the runtime client, in the slice that actually needs it.

**2. This also collapses the Metro risk.** Type-only imports are erased before bundling, so Metro never
resolves `@moneydiary/api-client` at runtime — only `tsc` does, and it follows pnpm symlinks fine. Two
conditions must hold: imports use the `import type { … }` statement form (web already enforces this via
`verbatimModuleSyntax: true`; mobile's tsconfig does not — the mobile task must add it or enforce the
convention), and the spike confirms jest-expo's transform is equally happy. The spike stays as an early
task because it is cheap; its expected finding is now "nothing to configure".

**3. Committed `types.gen.ts` (proposal lean; design confirms).** ADR-012 says gitignore it. Committing it
instead buys a `git diff --exit-code` drift gate that mirrors the already-proven `openapi:check` pattern,
and removes a mandatory generate-before-typecheck step from every consumer CI job and every fresh clone.
`openapi.json` is already committed for exactly this reason (ADR-011). If design confirms, ADR-012 gets a
one-line mechanics note — the decision itself is untouched.

**Pipeline:** `pnpm api openapi:emit` → `packages/api-client` generate → `web`/`mobile` typecheck.
Hand-chained pnpm scripts, no orchestrator.

### Affected areas

| Area | Change |
|---|---|
| `packages/api-client/` (new) | `package.json`, `tsconfig.json`, `src/types.gen.ts` (generated), `src/index.ts` |
| `pnpm-workspace.yaml` | add `packages/*` |
| `apps/web/src/api/types.ts` (239 lines, 10 DTOs) | interfaces → aliases over generated types; guards untouched |
| `apps/mobile/src/api/{client,post-ingesta,preview-ingesta}.ts` | same, for its DTO subset |
| `apps/web/package.json`, `apps/mobile/package.json` | `workspace:*` dep (explicit — pnpm isolated) |
| `apps/mobile/tsconfig.json` | `verbatimModuleSyntax` (erasure guarantee) |
| `.github/workflows/ci.yml` | `packages: ['packages/**']` filter → must trigger web + mobile jobs |
| `docs/adr/ADR-012-*` | note: first slice shipped types-only; `tsup`/gitignore mechanics adjusted |

## Constraints

- **ADR-005 / 008 / 024 boundary:** only the HTTP contract crosses. No domain entities, no UI, no styles,
  no screen hooks. The package must not import DOM or React Native APIs (trivially satisfied: it has no code).
- **npm 7-day quarantine** (`minimum-release-age=10080`) + `pnpm audit --audit-level=high` gate (ADR-021):
  pin `openapi-typescript` to a version already outside the window. Do not add a `minimumReleaseAgeExclude`
  entry for build tooling — no precedent exists (only security patches).
- **pnpm isolated resolution:** both apps declare the dep directly; nothing is hoisted.
- Node 22, TS strict. Vitest if the package ever needs tests (consistent with web/api; it has no RN/DOM dep).

## Acceptance criteria

- [ ] `pnpm --filter @moneydiary/api-client generate` regenerates `types.gen.ts` **deterministically** from
      `apps/api/openapi.json`; CI regenerates and `git diff --exit-code`s it (mirrors `openapi:check`), so a
      contract change without regeneration is a red build.
- [ ] `pnpm web typecheck` passes with **zero hand-written DTO interfaces left in `apps/web/src/api/types.ts`**
      for endpoints covered by `openapi.json`; the file holds aliases + its documentation comments only.
- [ ] Mobile equivalent passes (`tsc --noEmit` + `pnpm --filter @moneydiary/mobile test` green).
- [ ] **Money fidelity, type-level:** a compile-time assertion pins `cargo`/`abono` (and `total`,
      `totalIngreso`) to `string` in the generated types. A backend change to `number` fails the build.
- [ ] **Runtime untouched:** the diff contains no edits to guard functions, `ApiError` unions, `fetch`
      wrappers, or `conTimeout` — assertable by inspecting the changed hunks.
- [ ] A commit touching only `packages/**` triggers the web and mobile CI jobs.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Metro/jest-expo cannot resolve a pnpm-symlinked workspace package (no precedent in this repo) | Low (types are erased pre-bundle) | Spike task before wiring mobile; `verbatimModuleSyntax` in mobile tsconfig; if it still fails, ship the web half and re-slice mobile |
| Generated types weaken money safety by displacing runtime guards | Low | Guards are explicitly out of scope and untouched; the type-level `string` assertion above is an *addition*, not a replacement (`openapi-typescript` is compile-time only — ADR-011's "sin validación runtime" still stands client-side) |
| New devDep stalls install inside the 7-day quarantine | Medium | Pin to a version already out of the window at task-writing time |
| Generated names/shapes don't map 1:1 onto hand-written DTOs (optionality, `readonly`, nullability) | Medium | Aliases may need local `Readonly<>`/narrowing wrappers; slice web first to surface this on the app with the richer guards |
| Non-deterministic emit produces false drift failures | Low | Pin the generator version; format output; same discipline `openapi:emit` already proved |

## Rollback

Nothing runtime ships. Revert the PR(s): apps return to their hand-written interfaces, and
`packages/api-client` + the workspace/CI entries are deleted. No migration, no data, no deploy step. If
only mobile fails, the web slice stands alone (that is the reason for slicing them apart).

## Slicing sketch (indicative — `sdd-tasks` formalizes; delivery `ask-on-risk`)

1. **Spike** — trivial workspace package consumed by mobile; confirm Metro bundle + jest-expo. Throwaway.
2. **Package + web adoption** — create the package, workspace + CI wiring, drift gate, migrate
   `apps/web/src/api/types.ts`. Web is the harder consumer (10 DTOs, richest guards) and the safer one
   (no Metro).
3. **Mobile adoption** — `verbatimModuleSyntax`, `workspace:*` dep, migrate its DTO subset.

Step 2 is the largest; if the forecast exceeds the 400-line review budget, split package-creation from
web-adoption.

## Next

`sdd-spec` and `sdd-design` can run in parallel. **Design must:** pin the `openapi-typescript` version
(quarantine-aware), confirm the committed-vs-gitignored `types.gen.ts` call, settle the `exports`/`types`
shape for a build-less package, and specify the CI filter so `packages/**` fans out to both app jobs.
**Spec must:** capture the per-DTO type-derivation contract, the drift-gate acceptance criteria, and the
explicit "runtime guards unchanged" requirement.
