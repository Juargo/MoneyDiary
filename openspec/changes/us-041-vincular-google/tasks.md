# Tasks: US-041 — Link and unlink Google from the profile

Design is binding. Where a task note quotes a design guard, that guard is non-negotiable — do not
"simplify" it away during apply. Strict TDD is active for every unit below: **RED (failing test) →
GREEN (minimal implementation) → refactor**, per file/unit, using `pnpm api test` (or the scoped
`vitest run <file>`) as the fast loop and the full green bar (§6.6 of design) before closing a PR.

**Anti-stall note for `sdd-apply`**: commit after each completed unit (work-unit-commits skill), run
file-scoped tests while iterating, never chain long commands with `&&`. If a task appears to require a
Prisma migration, **STOP and escalate** — design §3.6 states there is none.

---

## Review Workload Forecast (MANDATORY)

Design corrected the proposal's two-PR split to **three chained PRs** (design §7). Independent estimate
below, validated against the design's own bucket table (design §7 "Size forecast").

| PR | Content | Est. changed lines | 400-line budget risk |
|---|---|---|---|
| **#1 — Link state on identity read** (CA-04, VINC041-06) | `googleVinculado` field, both selects/mapper, schema, 2 route response literals, 5 client fixtures, contract regen | ~220 (180 source/fixtures + 40 generated) | **Low** — fits the budget |
| **#2 — Link** (CA-01/02/05, VINC041-01..04/08/09) | `deriveLinkIntentKey`, `link-intent.ts`, cookie widening, 3 domain errors, `buscarPorId`, 2 new use cases, callback branching, activation-gate split, routes, schema, translator, OpenAPI, contract regen, new int-spec | ~970 (430 source + 450 specs + 90 generated) | **High** — well over budget |
| **#3 — Unlink** (CA-03, VINC041-05) | `desvincularGoogleSub` conditional write, `DesvincularGoogleUseCase`, route (always-mounted), translator branch, ADR-034 amendment, int-spec extensions | ~400 (180 source + 220 specs) + amendment doc | **Medium-High** — at or just over budget once the ADR doc and OpenAPI regen are counted |

**Total estimate**: ~1,590 changed lines across three PRs.

**Chained PRs recommended: Yes.** Matches design §7's own split and its stated reason: PR #2 carries a
new cryptographic mechanism on an auth hot path (deserves an isolated, focused review with the
forged-cookie proof directly in front of the reviewer); PR #3 carries a data invariant (CA-03) that
depends on PR #2 only for the route file and translator it extends; PR #1 is the cross-workspace
DTO-fallout slice, isolated so it doesn't bury the crypto review under fixture churn.

**Slice boundaries** (each independently green — full `pnpm api test` + `tsc --noEmit` + `openapi:check`
+ `pnpm web typecheck` + mobile `tsc --noEmit`):
- PR #1 start: clean `main`. PR #1 end: `/auth/me` and `PATCH /api/perfil` return `googleVinculado`;
  zero new endpoints; zero crypto.
- PR #2 start: PR #1 merged (or its branch, per `feature-branch-chain`). PR #2 end: link flow fully
  works end-to-end (initiate → callback → row linked), unlink still does not exist.
- PR #3 start: PR #2 merged/stacked. PR #3 end: unlink flow works, ADR-034 amendment lands.

**Decision needed before apply: Yes.** `delivery_strategy` is cached as `ask-on-risk` — the orchestrator
must stop before `sdd-apply` and confirm chained PRs (already leaning yes) and get explicit
`size:exception` acknowledgement for PR #2 (High risk) and PR #3 (Medium-High risk) before implementation
starts, per the Review Workload Guard. `chain_strategy` is already cached as `feature-branch-chain`: PR
#1 targets a tracker/feature branch, PR #2 targets PR #1's branch, PR #3 targets PR #2's branch; only the
tracker merges to `main`.

---

## Group 0 — Preflight

- [x] **0.1** Confirm no Prisma schema/migration change is needed: `googleSub String? @unique` and
  `passwordHash String?` already exist on `User` (`apps/api/prisma/schema.prisma`). If any task below
  seems to require a migration, **STOP and escalate** — that means the change went off-design (design
  §3.6).
  - Verify: `git status apps/api/prisma/` stays clean through the whole change.
  - Tag: design §3.6.

---

## PR #1 — Link state on the identity read (CA-04, VINC041-06, AUTH-09 delta)

Depends on: nothing (first PR in the chain). Target branch: tracker/feature branch.

- [x] **1.1** `IdentidadUsuario` gains **required** `googleVinculado: boolean` in
  `apps/api/src/application/ports/user-credential-repository.port.ts`. Required, not optional — an
  optional field lets a producer forget it in silence (design §1/Q5a, D-07). Let `tsc --noEmit`
  enumerate every fixture that builds an `IdentidadUsuario` — do not hunt references by grep (D-07).
  - Verify: `pnpm api exec tsc --noEmit` (expect new errors enumerating the fallout).
  - Tag: VINC041-06, design §5.1/§1-Q5a.

- [x] **1.2** RED then GREEN: `PrismaUserCredentialRepository` — add `googleSub: true` to **both**
  `buscarIdentidad`'s and `actualizarPerfil`'s `select`; the shared private `aIdentidadUsuario(row)`
  mapper computes `googleVinculado = row.googleSub !== null`. The raw `googleSub` never crosses the
  port — only the boolean does.
  - Files: `infrastructure/persistence/prisma-user-credential.repository.ts` (+ `.spec.ts`).
  - Guard: repo spec asserts `googleSub` is in **both** selects and that the mapper never emits the raw
    value (design §6.1 item 5).
  - Verify: `pnpm api test -- prisma-user-credential.repository`.
  - Tag: VINC041-06, design §3.3.

- [x] **1.3** Compile-fallout fix: `application/use-cases/obtener-identidad.use-case.spec.ts` fixtures
  gain `googleVinculado`; assert it passes through untouched (the use case has zero logic change).
  - Verify: `pnpm api test -- obtener-identidad`.
  - Tag: design §6.1 item 4.

- [x] **1.4** RED then GREEN: `authMeResponseSchema` gains `googleVinculado: z.boolean()`;
  `meta.description` updated to name the field and its meaning. `authMeOperation` needs **no edit** —
  it already `$ref`s the schema.
  - Files: `infrastructure/http-express/schemas/auth-me.schema.ts` (+ `.spec.ts`).
  - Guard: schema spec fixtures gain the field, plus a case asserting a body **without** it is rejected
    (design §6.1 item 8).
  - Verify: `pnpm api test -- auth-me.schema`.
  - Tag: VINC041-06, AUTH-09 (delta).

- [x] **1.5** RED then GREEN: `auth.routes.ts` and `perfil.routes.ts` — the two inline identity-payload
  literals gain `googleVinculado`. Both build the JSON inline (no shared serializer to touch beyond
  that).
  - Files: `infrastructure/http-express/routes/auth.routes.ts` (+ `.spec.ts`),
    `infrastructure/http-express/routes/perfil.routes.ts` (+ `.spec.ts`), `app.auth.spec.ts`.
  - Guard: assert `googleVinculado` present in the `200` bodies (design §6.1 item 7).
  - Verify: `pnpm api test -- auth.routes perfil.routes app.auth`.
  - Tag: AUTH-09 (delta), VINC041-06.

- [x] **1.6** Regenerate the contract, in order: `pnpm api openapi:emit` →
  `pnpm --filter @moneydiary/api-client generate` → `pnpm api openapi:check` →
  `pnpm --filter @moneydiary/api-client typecheck`. Commit `apps/api/openapi.json` and
  `packages/api-client/src/types.gen.ts` **with** this PR's code, not in a follow-up.
  - Verify: all four commands above, green.
  - Tag: VINC041-09 (partial — AUTH-09 field only), design §5.6.

- [x] **1.7** Fix the **five** client fixture files broken by the now-required `googleVinculado` field
  (design §1/Q5a — the proposal's list was missing one; verify by reading, not by trusting a stale
  list):
  1. `apps/web/src/api/auth.test.ts` — 2 `MeDto` literals (`validMeDto`, `validDemoMeDto`).
  2. **`apps/web/src/lib/require-session.test.ts`** — 2 `MeDto` literals (lines ~91, ~106). **Missing
     from the original proposal — do not skip.**
  3. `apps/mobile/src/api/client.spec.ts` — 1 `MeDto` literal (`validMeDto`).
  4. `apps/mobile/src/api/session-context.spec.tsx` — 1 `MeDto` literal (`meDto`).
  5. `apps/mobile/test/auth-navigation.integration.spec.tsx` — 1 `MeDto` literal (`meOk`), which
     **already lacks `nombre` from US-040** (add both `nombre` and `googleVinculado` here). This file
     lives in `apps/mobile/test/`, which `apps/mobile/tsconfig.json`'s `include` never covers — **do
     not** widen the tsconfig `include` here; that is separate debt (task 4.2). Fix only the fixture.
  - Constraint: these are the **only** `apps/web`/`apps/mobile` files this task touches, and they are
    test fixtures, not source. Zero source changes in either workspace.
  - Verify: `pnpm web typecheck` (NOT `pnpm web test` — Vitest does not typecheck and shipped a CI break
    in US-040) and `pnpm --filter @moneydiary/mobile exec tsc --noEmit`. Both are mandatory gates, not
    optional extras.
  - Tag: VINC041-11, design §1/Q5a (CORRECTION).

- [x] **1.8** Full PR #1 verification: `pnpm api test`, `pnpm api exec tsc --noEmit`,
  `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`, `pnpm api openapi:check`,
  `pnpm --filter @moneydiary/api-client typecheck`, `pnpm web typecheck`,
  `pnpm --filter @moneydiary/mobile exec tsc --noEmit`, `pnpm web test`. All green before opening PR #1.
  - Tag: design §6.6.

---

## PR #2 — Link (CA-01/02/05, VINC041-01..04/08/09, AUTH-12/14 deltas)

Depends on: PR #1 (targets its branch per `feature-branch-chain`). This is the highest-risk PR in the
chain — it introduces a new cryptographic mechanism on an auth hot path.

- [ ] **2.1** RED then GREEN: `deriveLinkIntentKey` — second named export in
  `composition/derive-blind-index-key.ts`, HKDF-SHA256 over `ENCRYPTION_KEY`, info string
  `LINK_INTENT_HKDF_INFO = 'oauth-link-intent-v1'`, 32 bytes. Same file as `deriveBlindIndexKey`,
  deliberately — a second derivation in a second file is how salt/hash/length drift apart (the
  docblock there exists because a drifted derivation broke login in silence, 2026-08-02). Rewrite the
  file's docblock to describe **both** derivations and the "one `ENCRYPTION_KEY`, N purpose-separated
  keys" rule — a stale docblock here is the `dry` anti-pattern this file already warns against.
  - **GUARD note (binding item #1)**: the second exported key derivation is mandatory, and its
    purpose-separation from the blind-index key must be a spec assertion, not a comment. Add
    `expect(deriveLinkIntentKey(k).equals(deriveBlindIndexKey(k))).toBe(false)` for a fixed `k` (the
    real test — catches a copy-paste that forgets to swap `info`) **and**
    `expect(LINK_INTENT_HKDF_INFO).not.toBe(BLIND_INDEX_HKDF_INFO)` (the cheap tripwire). No new env
    var.
  - Verify: `pnpm api test -- derive-blind-index-key`.
  - Tag: VINC041-03, design §1/Q1a, D-02.

- [ ] **2.2** RED then GREEN: `infrastructure/http/auth/link-intent.ts` — `mensajeLinkIntent`,
  `firmarLinkIntent`, `verificarLinkIntent`. Plain functions taking the key, no class, no port
  (design D-01 — cookie integrity is transport, the application layer never learns a MAC exists).
  - **GUARD note (binding item #1, message encoding)**: the signed message is
    **length-prefixed** — `${len(state)}:${state}:${len(userId)}:${userId}` via
    `Buffer.byteLength(x, 'utf8')` — **NOT** `${state}.${userId}`. Record why in the docblock: a simple
    separator makes `("a.b","c")` and `("a","b.c")` produce the same message; today that's not
    exploitable (`state` comes from `openid-client`, `userId` comes from the session — neither is
    attacker-controlled), but that safety depends on `state`'s alphabet, an unpinned property of a
    third-party library. Length-prefixing is injective by construction and costs one line.
  - **GUARD note (binding item #2, verification traps)**: `timingSafeEqual` **throws** on length
    mismatch — check `recibido.length !== esperado.length` first, and that check must be the actual
    gate (return `false`), not a bypassed formality. `Buffer.from(x, 'base64url')` does **not** throw on
    invalid input — it silently discards invalid chars and returns a **shorter** buffer, which the
    length check also catches. Both traps get explicit spec cases, not just prose.
  - Spec assertions (design §6.2): determinism (same key+state+userId ⇒ same MAC); different `state` ⇒
    different MAC; different `userId` ⇒ different MAC; different key ⇒ different MAC; canonicalization
    proof `firmar(k,'a.b','c').mac !== firmar(k,'a','b.c').mac`; `verificar` ⇒ `false` (never throws)
    for: wrong-length MAC, empty MAC, non-base64url garbage, MAC from a different `state`, MAC from a
    different `userId`, MAC from a different key.
  - Verify: `pnpm api test -- link-intent`.
  - Tag: VINC041-03, design §1/Q1b-c, D-01.

- [ ] **2.3** RED then GREEN: `oauth-transient-cookie.ts` — `OauthTransientState` gains optional
  `readonly link?: LinkIntent`; `isOauthTransientState` accepts both shapes and returns `undefined` for
  the **whole** cookie when `link` is present but malformed (not an object, missing `userId`/`mac`,
  wrong types). Amend the "unsigned by design" docblock paragraph in place: quote the original sentence
  ("an attacker who can set a cookie doesn't need to forge content — they can start their own flow") and
  state why it stops applying to the field that names an account.
  - Files: `infrastructure/http/auth/oauth-transient-cookie.ts` (+ `.spec.ts`).
  - Spec assertions: round-trip with and without `link`; **a cookie without `link` serializes to
    exactly the same bytes as before this change** (pin against a literal captured pre-change — this is
    the byte-identical login-path proof); malformed `link` variants ⇒ whole parse is `undefined`;
    `Set-Cookie` attributes unchanged (`Path=/api/auth/google`, `Max-Age=600`, `HttpOnly`,
    `SameSite=Lax`).
  - Verify: `pnpm api test -- oauth-transient-cookie`.
  - Tag: VINC041-03, D-03, design §6.2.

- [ ] **2.4** RED then GREEN: three new domain errors + specs — `GoogleYaVinculadoError` (fixed
  message, docblock: UX pre-flight, not a security control), `VinculacionGoogleNoDisponibleError`
  (dependency outage), `VinculacionGoogleFallidaError` (renamed from the proposal's
  `vinculacion-rechazada.error.ts`; `motivo: 'usuario-inexistente' | 'usuario-demo' |
  'identidad-de-otra-cuenta' | 'ya-tiene-otro-sub' | 'link-perdio-la-carrera'`; docblock: **never
  crosses the HTTP boundary** — every outcome from `VincularGoogleUseCase` is a `302`, `motivo` exists
  only for the `.warn` line).
  - Files: `domain/errors/google-ya-vinculado.error.ts`,
    `domain/errors/vinculacion-google-no-disponible.error.ts`,
    `domain/errors/vinculacion-google-fallida.error.ts` (each + `.spec.ts`).
  - Verify: `pnpm api test -- domain/errors`.
  - Tag: design D-08, §3.1.

- [ ] **2.5** `IIdentidadGoogleRepository` gains `buscarPorId(userId): Promise<UsuarioVinculable | null>`
  (reuses the existing `UsuarioVinculable` projection). Let `tsc --noEmit` enumerate the fallout: the
  **only** double of this port, `test/support/identidad-google-repository.double.ts`, plus
  `application/ports/identidad-google-repository.port.spec.ts` (design D-07, verified single-double
  claim).
  - Verify: `pnpm api exec tsc --noEmit`, then `pnpm api test -- identidad-google-repository`.
  - Tag: VINC041-03/04, design §5.1.

- [ ] **2.6** RED then GREEN: `PrismaIdentidadGoogleRepository.buscarPorId` — `findUnique where {id}`,
  same `select` shape as the other lookups, private mapper reused.
  - Files: `infrastructure/persistence/prisma-identidad-google.repository.ts` (+ `.spec.ts`).
  - Spec: `where` deep-equals `{ id: userId }`, same `select`, `null` when absent.
  - Verify: `pnpm api test -- prisma-identidad-google.repository`.
  - Tag: VINC041-03, design §3.3.

- [ ] **2.7** RED then GREEN: `IniciarVinculacionGoogleUseCase` — guard order
  `esDemo → creds.buscarCredencialPorId → hasher.verificar → identidades.buscarPorId → iniciador.iniciar()`.
  `esDemo` is a **required** input (`req.esDemo!`), per D-05 — this use case has a session, so omitting
  the gate must be a compile error.
  - **GUARD note (§P1 ordering)**: the `409 GOOGLE_YA_VINCULADO` pre-flight read runs **after** password
    verification, not before — a `409` discloses account state, and gating a state disclosure behind
    the password is free. This is UX, not the security control (the real control is
    `VincularGoogleUseCase` step 3/4).
  - Files: `application/use-cases/iniciar-vinculacion-google.use-case.ts` (+ `.spec.ts`).
  - Spec assertions (design §6.2): demo ⇒ error and no repo/hasher/iniciador call; credential `null` ⇒
    `PerfilRechazadoError` and `iniciador` never called; wrong password ⇒ `PerfilRechazadoError` and
    `buscarPorId` never called (proves §P1 ordering); already linked ⇒ `GoogleYaVinculadoError` and
    `iniciador` never called; `iniciar()` failure ⇒ `VinculacionGoogleNoDisponibleError`; happy path
    returns `InicioAutorizacion` verbatim; no log context ever carries a password/email/googleSub.
  - Verify: `pnpm api test -- iniciar-vinculacion-google`.
  - Tag: VINC041-01, design §4.1, §5.2.

- [ ] **2.8** RED then GREEN: `VincularGoogleUseCase.execute({ userId, sub })` — **exactly two fields,
  no `esDemo` input**.
  - **GUARD note (design D-05, non-negotiable)**: `esDemo` is **read from the row** via `buscarPorId`,
    never passed in — there is no session at the callback by construction, and an **optional** `esDemo?`
    (as the proposal sketched) recreates the exact silent-omission hazard the required-input rule exists
    to prevent. This is stronger than an input, not a relaxation: it can't be spoofed by any caller and
    is evaluated against the database at the moment of the write.
  - Steps (design §4.2): `buscarPorId` null/demo ⇒ fail; `googleSub === sub` ⇒ idempotent success,
    **no write**; `googleSub !== null` (different) ⇒ fail, no write; `buscarPorGoogleSub(sub) !== null`
    ⇒ **★ fail, never re-link** (this is the ★ rule's explicit testable home — `googleSub @unique` is
    its second, unconditional line of defence); `vincularGoogleSub(userId, sub)` reused **verbatim**
    (not copied, not re-implemented) ⇒ `false` fails.
  - Files: `application/use-cases/vincular-google.use-case.ts` (+ `.spec.ts`).
  - Spec assertions: fresh link ⇒ `vincularGoogleSub` called once with exactly those args; idempotent
    re-link ⇒ `ok` and `vincularGoogleSub` **never** called; different sub on row ⇒ fail, no write; ★
    binding proof: `buscarPorGoogleSub` returns another user ⇒ fail and `vincularGoogleSub` **never**
    called; demo row ⇒ fail, no write (read-derived gate); row `null` ⇒ fail; write `false` ⇒ fail;
    **CA-05 structural proof**: `Object.keys(input)` deep-equals `['userId','sub']`.
  - Verify: `pnpm api test -- vincular-google`.
  - Tag: VINC041-02/04, CA-05, design §4.2, §5.2 (CORRECTION).

- [ ] **2.9** RED then GREEN: `crear-auth-google.ts` gains a `crypto: ICryptoService` parameter (builds
  a `PrismaUserCredentialRepository` for password verification, mirroring `crearPerfil`'s signature);
  builds `IniciarVinculacionGoogleUseCase` + `VincularGoogleUseCase`; `GoogleAuthGraph` gains both.
  - **GUARD note**: `crearAuthGoogle` **never** calls `deriveBlindIndexKey`/`deriveLinkIntentKey` and
    **never** `new`s an `AesGcmCryptoService`/`HmacBlindIndexService` — it receives instances the
    composition root built once. A second derivation here is the exact hazard class of the 2026-08-02
    production incident (design §3.4, stated three times on purpose in the design — treat this as a
    review blocker, not a style note).
  - Files: `composition/crear-auth-google.ts` (+ `.spec.ts`).
  - Spec: assert the two new use cases are built and that **no key derivation happens inside**.
  - Verify: `pnpm api test -- crear-auth-google`.
  - Tag: design §3.4, D-04.

- [ ] **2.10** `container.ts`: `const linkIntentKey = deriveLinkIntentKey(encryptionKey);` next to the
  existing `blindIndex` derivation (single derivation site), threaded into `crearAuthGoogle` and exposed
  as a `Container` field for `AuthGoogleDeps`.
  - Verify: `pnpm api exec tsc --noEmit`.
  - Tag: design §3.4.

- [ ] **2.11** RED then GREEN: `perfil-google.schema.ts` — `vincularGoogleRequestSchema` (`.strict()`,
  `{ passwordActual: z.string() }`, no `.min()`) and `vincularGoogleResponseSchema`
  (`{ urlAutorizacion: z.string() }`, no `.url()`).
  - **GUARD note (layer-honesty)**: no `.min()` on `passwordActual` — the password is *verified*, not
    *validated*; a length rule in the transport layer would leak the password policy. No `.url()` on
    `urlAutorizacion` — it's server-generated; a format assertion on our own output is theatre.
  - **Decision to record here, not defer silently**: `perfilErrorResponseSchema` reuse for this
    endpoint's error bodies is the **third** occurrence of the `{message, code}` shape (US-040 already
    flagged rule-of-three). Either extract a shared `ErrorResponse` schema now, or explicitly re-defer
    with a one-line reason in the PR description. Do not silently let it pass a fourth time undecided.
  - Files: `infrastructure/http-express/schemas/perfil-google.schema.ts` (+ `.spec.ts`) — **new file**,
    desvincular schema added in PR #3.
  - Verify: `pnpm api test -- perfil-google.schema`.
  - Tag: VINC041-01, design §5.4.

- [ ] **2.12** RED then GREEN: `perfil-google.routes.ts` — `registrarPerfilGoogleVincular(router, deps)`
  mounted on `protectedApi` only when `container.googleAuth !== undefined`, and
  `registrarPerfilGoogleVincularDeshabilitado(router)` mounted otherwise (`404` on
  `POST /perfil/google/vincular`, no body — AUTH-16 parity). `.safeParse()` at the boundary; body and
  Zod issues never echoed.
  - **GUARD note (binding item #4, CRITICAL bug being fixed)**: the proposal's naive wiring —
    unconditionally mounting a route that calls `iniciador.iniciar()` — throws a `TypeError` → `500` in
    **every** environment without `GOOGLE_CLIENT_ID`, including the API's own test environment (no
    `GOOGLE_*` var is set there). "Just don't mount it" also fails: `sessionMiddleware` is mounted via
    `router.use(mw)` on `protectedApi`, which runs for every request whether matched or not, so an
    unmounted path answers `401`, not `404` (the existing `registrarAuthGoogleDeshabilitado` docblock,
    AUTH-16). The split gate above is the fix — implement it exactly as split, not as a per-handler
    guard clause inside a single registrar.
  - Files: `infrastructure/http-express/routes/perfil-google.routes.ts` (+ `.spec.ts`) — new file,
    desvincular registrar added in PR #3.
  - Spec assertions: `200 { urlAutorizacion }` + `Set-Cookie` whose decoded payload carries a `link`
    with a MAC verifiable against the same key; each use-case error → its exact `(status, code)`;
    `400 BODY_INVALIDO` for `{}` and for `{ passwordActual, userId: 'otro' }` (`.strict()` rejects the
    extra field); `esDemo`/`userId` threaded from `req`, never from the body;
    `registrarPerfilGoogleVincularDeshabilitado` ⇒ `404` with no body.
  - Verify: `pnpm api test -- perfil-google.routes`.
  - Tag: VINC041-01, design §1/Q2b (CORRECTION), D-04.

- [ ] **2.13** RED then GREEN: `perfil-http-error.ts` union widens to include
  `IniciarVinculacionGoogleError` (`GoogleYaVinculadoError` → `409 GOOGLE_YA_VINCULADO`,
  `VinculacionGoogleNoDisponibleError` → `503 GOOGLE_NO_DISPONIBLE`); the `const _exhaustive: never`
  guard stays unchanged (it is what makes a new unmapped error class a compile error — and, in reverse,
  adding `VinculacionGoogleFallidaError` to that union would stop compiling, which is the proof it never
  reaches an HTTP body).
  - Files: `infrastructure/http-express/routes/perfil-http-error.ts` (+ `.spec.ts`).
  - Spec: the two new classes map to their exact `(status, code)`; the existing `403 PERFIL_RECHAZADO`
    body stays byte-identical regardless of which endpoint produced it.
  - Verify: `pnpm api test -- perfil-http-error`.
  - Tag: design D-08, §5.3.

- [ ] **2.14** RED then GREEN: `auth-google.routes.ts` callback branching. Order, exactly:
  clear `md_oauth` → Sec-Fetch guard → rate limiter → parse cookie → `state === query.state` check →
  **if `link` present, `verificarLinkIntent`** → `verificador.verificar()` → branch to
  `completarLogin` (unchanged tail) or `completarVinculacion` (new tail,
  `vincularGoogle.execute({userId, sub})`, no session issued). `AuthGoogleDeps` gains `vincularGoogle` +
  `linkIntentKey`. Two new redirect constants: `/configuracion?google=vinculado`,
  `/configuracion?google=error`.
  - **GUARD note (binding item #3, reject-never-fallback)**: `link` present + MAC invalid ⇒ **reject
    the whole callback** to the standard `GENERIC_FAILURE_REDIRECT` (`/login?error=google`) — **never**
    `/configuracion?google=error`, and **never** fall through to the login use case. Design's framing,
    verbatim: falling back would run the *implicit, email-matched* path, which may write a `googleSub`
    via a completely different rule than the one requested **and issues a session** — this is not "a
    slightly worse outcome", it is a **privilege escalation** from "no session issued" to "session
    issued", selected by a byte an attacker can flip. Rejecting costs a legitimate user nothing.
  - **GUARD note (ordering)**: verify the MAC immediately after the `state` check and **before**
    `verificador.verificar()` — the MAC binds to `state` so the state check must come first for the
    binding to mean anything; a forged cookie must never trigger a network call to Google (same
    DoS-amplification reasoning that put the callback behind `googleRateLimiter`); the authorization
    `code` must never be consumed by a request that was going to be rejected anyway.
  - **Logging guard**: on link-intent rejection, log `.warn('Google callback rechazado (link-intent
    inválido)', { path })` **only** — no `userId`, no `mac`, no `state`, because none of those values is
    trusted at that moment.
  - Files: `infrastructure/http-express/routes/auth-google.routes.ts` (+ `.spec.ts`).
  - Spec assertions (new cases, existing login scenarios keep their **exact** assertions — a diff to an
    existing `expect(...)` here is a review red flag per design §6.1): no `link` ⇒ `loginConGoogle`
    called, `vincularGoogle` not; valid `link` ⇒ `vincularGoogle` called with `{userId, sub}`,
    `loginConGoogle` not, no `Set-Cookie` carrying `md_session`, redirect to `…vinculado`; use-case
    failure ⇒ redirect to `…error`; **invalid `link` ⇒ `/login?error=google`, `verificador.verificar`
    NEVER called, both use cases never called** (binding proof (a) at unit level).
  - Verify: `pnpm api test -- auth-google.routes`.
  - Tag: VINC041-02/03, AUTH-12 (delta), design §1/Q1c, §1/Q2a, §4.2.

- [ ] **2.15** `app.ts`: mount `registrarPerfilGoogleVincular`/`registrarPerfilGoogleVincularDeshabilitado`
  on `protectedApi` immediately after `registrarPerfil`, per the `container.googleAuth !== undefined`
  gate (task 2.12). Unlink mounting happens in PR #3.
  - Files: `infrastructure/http-express/app.ts` (+ `app.auth.spec.ts`).
  - Verify: `pnpm api test -- app.auth`.
  - Tag: design §3.3, D-04.

- [ ] **2.16** RED then GREEN: `openapi-document.ts` — `perfilGoogleVincularOperation` +
  `'/api/perfil/google/vincular'` path (append-only); amend `authGoogleCallbackOperation`'s
  **description** (no response-shape change) to document the dual mode and both link redirect targets —
  this description is the cross-workspace source US-042 reads for the `/configuracion?google=…`
  contract (ADR-008 boundary: `apps/web` cannot import an API constant).
  - Files: `infrastructure/http-express/schemas/openapi-document.ts` (+ `.spec.ts`).
  - Verify: `pnpm api test -- openapi-document`.
  - Tag: VINC041-09, design §5.5.

- [ ] **2.17** Regenerate the contract: `pnpm api openapi:emit` →
  `pnpm --filter @moneydiary/api-client generate` → `pnpm api openapi:check` →
  `pnpm --filter @moneydiary/api-client typecheck`. Commit both artifacts with this PR's code.
  - Verify: all four commands, green.
  - Tag: VINC041-09, design §5.6.

- [ ] **2.18** New integration spec `test/vinculacion-google.int-spec.ts` (real Postgres,
  `ALLOW_DESTRUCTIVE_DB=1`), scaffolded from `auth-google-callback.int-spec.ts` (own graph, per-run
  ids, full `afterAll` teardown) plus `test/support/session.fixture.ts`. Cover:
  - VINC041-01: authenticated non-demo + correct password ⇒ `200 { urlAutorizacion }`; assert the raw
    `Set-Cookie` header contains `md_oauth=`, **`Path=/api/auth/google`**, `HttpOnly`, `SameSite=Lax`,
    `Max-Age=600` — **this is guard note #9**: the design explicitly flags the `Path=/api/auth/google`
    assumption (set from a `/api/perfil/...` request) as needing this exact integration assertion, plus
    confirmation in the prod smoke path (record that follow-up, do not skip the header assertion).
  - VINC041-01: wrong `passwordActual` ⇒ `403 PERFIL_RECHAZADO`, no `Set-Cookie` at all, row unchanged.
  - **Binding proof (a)**: three forged-intent requests — `link.userId` swapped to another user; `mac`
    computed over a different `state`; `link` present with `mac: ''` — each ⇒
    `302 /login?error=google`, no `md_session` cookie, and **both users' rows byte-identical** (compare
    full row snapshots taken before/after, not just `googleSub`).
  - VINC041-03: full happy path — initiate → replay the returned cookie into the callback with a faked
    `verificador` ⇒ `302 /configuracion?google=vinculado`, `googleSub` written on the caller's row, and
    **no `Session` row created** (`prisma.session.count` before === after).
  - **Binding proof (c)**: user B owns `sub-X`; user A runs a link flow that returns `sub-X` ⇒
    `302 /configuracion?google=error`, A's `googleSub` still `null`, B's row byte-identical.
  - VINC041-04: idempotent re-link of the same `sub` ⇒ `302 …vinculado`, row unchanged.
  - The OIDC provider is faked exactly as `auth-google-callback.int-spec.ts` already does —
    `verificador: { verificar: vi.fn() }` against real Postgres, self-provisioning
    `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` in `beforeAll` and restoring in `afterAll` (CI's
    integration job sets none). `iniciador` is a stub returning a fixed `InicioAutorizacion` — leg 1
    never touches the network either. **Never live Google.**
  - Verify: `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- vinculacion-google`.
  - Tag: VINC041-01/02/03/04, design §6.3, §6.4.

- [ ] **2.19** Login-regression check: `test/auth-google-callback.int-spec.ts` and
  `auth-google.routes.spec.ts` — **only** their deps/graph literals may grow (new required fields on
  `AuthGoogleDeps`/`GoogleAuthGraph`). No scenario, no `expect(...)`, no expected status, redirect
  target, or DB assertion may change. A diff touching an assertion in either file means the login path
  changed and the change went off-design — treat as a hard stop, not a judgment call.
  - Verify: `git diff` on both files shows only literal/import growth, then
    `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- auth-google-callback` and
    `pnpm api test -- auth-google.routes`.
  - Tag: design §6.1, §6.5.

- [ ] **2.20** AUTH-16-parity integration case: a container built **without** `GOOGLE_CLIENT_ID` ⇒
  `POST /api/perfil/google/vincular` is `404` (not `500`) — this is the exact case the proposal's
  original wiring would have shipped as a `500` (binding item #4). Add to
  `test/vinculacion-google.int-spec.ts` or a dedicated activation-gate spec.
  - Verify: `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- vinculacion-google`.
  - Tag: design §1/Q2b, §6.4 (AUTH-16 parity row).

- [ ] **2.21** Full PR #2 verification (full green bar, design §6.6): `pnpm api test`,
  `pnpm api exec tsc --noEmit`, `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`,
  `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e`, `pnpm api openapi:check`,
  `pnpm --filter @moneydiary/api-client typecheck`, `pnpm web typecheck`,
  `pnpm --filter @moneydiary/mobile exec tsc --noEmit`, `pnpm web test`. All green before opening PR #2.
  - Tag: design §6.6.

---

## PR #3 — Unlink (CA-03, VINC041-05, ADR-034 amendment)

Depends on: PR #2 (targets its branch; needs only the route file and translator PR #2 extends).

- [ ] **3.1** RED then GREEN: `domain/errors/vinculo-requiere-password.error.ts` (+ `.spec.ts`) — fixed
  message: *"configurá una contraseña antes de desvincular Google"*, no interpolated input.
  - Verify: `pnpm api test -- vinculo-requiere-password`.
  - Tag: VINC041-05, design §3.1.

- [ ] **3.2** `IIdentidadGoogleRepository` gains `desvincularGoogleSub(userId): Promise<boolean>`. Let
  `tsc --noEmit` enumerate the fallout: the same single double
  (`test/support/identidad-google-repository.double.ts`) and the port spec.
  - Verify: `pnpm api exec tsc --noEmit`, then `pnpm api test -- identidad-google-repository`.
  - Tag: VINC041-05, design §5.1.

- [ ] **3.3** RED then GREEN: `PrismaIdentidadGoogleRepository.desvincularGoogleSub` — the CA-03
  conditional write.
  - **GUARD note (binding item #5, CA-03 single conditional write — non-negotiable)**:
    ```ts
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, passwordHash: { not: null }, googleSub: { not: null } },
      data:  { googleSub: null },
    });
    return count === 1;
    ```
    This is **one statement**, not a read-then-write. The invariant "never leave an account without an
    access method" lives in the `WHERE`, not in an application pre-check — a read-then-write would leave
    a TOCTOU window and **voids this guarantee entirely** (design §1/Q4 states this explicitly). The
    application-layer read that precedes this call (task 3.4, step 2) is **for the error message only**;
    if the read and the `WHERE` ever disagree, the `WHERE` wins and the outcome stays safe. No
    `try/catch` — this write touches no unique column, so any Prisma error is a real infra failure and
    must propagate to `errorMiddleware` (`500`).
  - Files: `infrastructure/persistence/prisma-identidad-google.repository.ts` (+ `.spec.ts`).
  - Spec assertion (this literal **is** the CA-03 invariant): the `updateMany` argument deep-equals
    `{ where: { id, passwordHash: { not: null }, googleSub: { not: null } }, data: { googleSub: null } }`
    — a spec that only asserts `count === 1` would pass against a predicate-less update, which is why
    the exact literal is asserted, not just the outcome. `count === 0` ⇒ `false`. No `try/catch` swallows
    a Prisma error (an arbitrary rejection propagates).
  - Verify: `pnpm api test -- prisma-identidad-google.repository`.
  - Tag: VINC041-05, design §1/Q4, D-06.

- [ ] **3.4** RED then GREEN: `DesvincularGoogleUseCase` — steps `esDemo → buscarCredencialPorId (null
  ⇒ VinculoRequierePasswordError) → hasher.verificar (false ⇒ PerfilRechazadoError) →
  desvincularGoogleSub(userId) (true or false ⇒ 204)`. `esDemo` is a **required** input
  (`req.esDemo!`) — this use case has a session (D-05).
  - Files: `application/use-cases/desvincular-google.use-case.ts` (+ `.spec.ts`).
  - Spec assertions: demo ⇒ error, `desvincularGoogleSub` never called; credential `null` ⇒
    `VinculoRequierePasswordError`, write never called (binding proof (b)); wrong password ⇒
    `PerfilRechazadoError`, write never called; write `true` ⇒ `ok`; write **`false` ⇒ `ok`**
    (idempotent — the requested end state already holds).
  - Verify: `pnpm api test -- desvincular-google`.
  - Tag: VINC041-05, design §4.3, §5.2.

- [ ] **3.5** RED then GREEN: `crear-perfil.ts` — builds
  `new PrismaIdentidadGoogleRepository(prisma, blindIndex)` and `DesvincularGoogleUseCase`;
  `PerfilGraph` gains `desvincularGoogle`. This use case goes in `PerfilGraph`, not `GoogleAuthGraph` —
  it must work when Google is off (design §1/Q2b, D-04).
  - Files: `composition/crear-perfil.ts` (+ `.spec.ts`).
  - Verify: `pnpm api test -- crear-perfil`.
  - Tag: design D-04, §3.4.

- [ ] **3.6** RED then GREEN: `perfil-google.schema.ts` gains
  `desvincularGoogleRequestSchema` (`.strict()`, `{ passwordActual: z.string() }`, no `.min()`) —
  extends the file created in task 2.11.
  - Verify: `pnpm api test -- perfil-google.schema`.
  - Tag: VINC041-05, design §5.4.

- [ ] **3.7** RED then GREEN: `perfil-google.routes.ts` gains
  `registrarPerfilGoogleDesvincular(router, perfil)`.
  - **GUARD note (binding item #4, second half — deliberate, not an omission)**: unlink is mounted on
    `protectedApi` **always**, with **no** activation gate. A user who linked while Google was on must
    be able to unlink after it's turned off — gating unlink would trap a permanent access method on
    their account after a config change, which is the exact posture this change exists to remove.
    Clearing `googleSub` needs no OIDC client, no discovery, no credentials, so there is nothing to gate
    on.
  - Spec: `204` with no body on success; error mapping per translator; `esDemo`/`userId` threaded from
    `req`, never the body.
  - Verify: `pnpm api test -- perfil-google.routes`.
  - Tag: VINC041-05, design §1/Q2b, D-04.

- [ ] **3.8** RED then GREEN: `perfil-http-error.ts` gains the `VinculoRequierePasswordError` branch
  (`403 VINCULO_REQUIERE_PASSWORD`); `const _exhaustive: never` guard stays unchanged.
  - Verify: `pnpm api test -- perfil-http-error`.
  - Tag: design D-08.

- [ ] **3.9** `app.ts`: mount `registrarPerfilGoogleDesvincular` on `protectedApi`, unconditionally
  (task 3.7's guard).
  - Verify: `pnpm api test -- app.auth`.
  - Tag: design §1/Q2b.

- [ ] **3.10** RED then GREEN: `openapi-document.ts` — `perfilGoogleDesvincularOperation` +
  `'/api/perfil/google/desvincular'` path (append-only: `204`/`400`/`403`/`401`).
  - Verify: `pnpm api test -- openapi-document`.
  - Tag: VINC041-09, design §5.5.

- [ ] **3.11** Regenerate the contract: `pnpm api openapi:emit` →
  `pnpm --filter @moneydiary/api-client generate` → `pnpm api openapi:check` →
  `pnpm --filter @moneydiary/api-client typecheck`. Commit both artifacts with this PR's code.
  - Verify: all four commands, green.
  - Tag: VINC041-09, design §5.6.

- [ ] **3.12** Integration coverage, extending existing suites rather than duplicating scaffolding:
  - **Binding proof (b)** in `test/vinculacion-google.int-spec.ts`: seed a user directly with
    `passwordHash: null` and a `googleSub`; unlink ⇒ `403 VINCULO_REQUIERE_PASSWORD`, `googleSub`
    unchanged.
  - Happy unlink ⇒ `204`, `googleSub === null`; second unlink ⇒ `204` (idempotent).
  - VINC041-06: `GET /api/auth/me` reports `googleVinculado: false` before, `true` after link, `false`
    after unlink.
  - VINC041-07/09: extend `test/perfil-demo-gate.int-spec.ts` — demo session on **both** endpoints ⇒
    `403 DEMO_SOLO_LECTURA`, nothing written.
  - VINC041-08: extend `test/auth-isolation.int-spec.ts` — user A sends either body with a field naming
    user B ⇒ `400` (`.strict()` rejects the extra field) and B's row byte-identical.
  - Verify: `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- vinculacion-google perfil-demo-gate
    auth-isolation`.
  - Tag: VINC041-05/06/07/08/09, design §6.3(b), §6.4.

- [ ] **3.13** ADR-034 amendment: append `## Amendment (US-041, 2026-08-13)` to
  `docs/adr/ADR-034-login-con-google-oidc.md`. **Amendment, not a new ADR** — this is an
  explicit-instruction guard note (binding item #8): a mobile link flow would need a new ADR
  (ADR-035 shape, no `md_oauth`, no round trip); this change deviates from nothing ADR-034 committed to,
  it only adds a second entry point. Do **not** rewrite the original decision text — the record of what
  was decided when must survive. State exactly the four numbered clauses, no more, no fewer:
  1. Linking now has two pathways (implicit email-matched, unchanged; explicit userId-bound,
     password-re-verified) — and **why** the `email_verified` gate belongs to the implicit path only
     (the explicit path never consults email, so there is nothing for the gate to protect).
  2. The callback is dual-purpose, distinguished by an HMAC-signed link marker inside `md_oauth`, not a
     second redirect URI — quote `md_oauth`'s original "unsigned by design" sentence and state why it
     stopped holding for the field that names an account.
  3. The ★ no-re-link rule is enforced at two call sites over one database-level invariant
     (`googleSub @unique` + conditional `updateMany`), not inside a single use case.
  4. New account invariant, first-class: an account must never be left without an access method;
     `googleSub` may only be cleared while `passwordHash IS NOT NULL`, enforced in the unlink `WHERE`.
  - Verify: manual review against design §1/Q6b — confirm all four clauses present, nothing else added,
    original text untouched.
  - Tag: design §1/Q6, §6.b.

- [ ] **3.14** Full PR #3 / full-change verification (full green bar, design §6.6): `pnpm api test`,
  `pnpm api exec tsc --noEmit`, `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`,
  `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e`, `pnpm api openapi:check`,
  `pnpm --filter @moneydiary/api-client typecheck`, `pnpm web typecheck`,
  `pnpm --filter @moneydiary/mobile exec tsc --noEmit`, `pnpm web test`. All green before opening PR #3.
  - Tag: design §6.6.

---

## Group 4 — Non-code action items (design §7 "Open action items for the tasks phase")

These are explicitly **not** implementation tasks for this change — do not fold them into PR work.

- [ ] **4.1** Update GitHub issue #275: CA-01 and CA-03 now both require the current password (binding
  decisions 2 and 4), and the issue doesn't mention the demo gate. Update the issue text so verification
  isn't checked against stale wording.
  - Tag: design §7 action item 1.

- [ ] **4.2** File a new debt issue: "typecheck `apps/mobile/test/`" — `apps/mobile/tsconfig.json`'s
  `include` (`["app", "src", "*.ts", "*.tsx", "nativewind-env.d.ts"]`) never covers `test/`, which is
  why `auth-navigation.integration.spec.tsx`'s fixture drifted silently after US-040 and needed a manual
  fix in task 1.7. Reference this change and the US-040 drift as evidence the gap is not theoretical.
  Do **not** widen the `include` as part of this change — the true error count under `test/` is unknown,
  and discovering it inside a change that also carries a cryptographic mechanism is the wrong place.
  - Tag: design §1/Q5b, §7 action item 2.

- [ ] **4.3** Confirm the `ErrorResponse` schema decision made in task 2.11 (extract now vs. re-defer
  with a stated reason) is recorded somewhere durable (PR description or a follow-up issue) — this is
  the third occurrence of the `{message, code}` shape and US-040 already flagged the rule-of-three
  trigger.
  - Tag: design §7 action item 3, §5.4.
