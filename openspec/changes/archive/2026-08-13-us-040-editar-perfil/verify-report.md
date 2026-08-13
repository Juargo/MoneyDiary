# Verify Report — us-040-editar-perfil

**Verdict: PASS**

Scope verified: full implementation across the two chained PRs (#312 -> #314, base tracker #313),
checked out at `origin/feat/us-040-s2-password-sesiones` (HEAD of the chain). CRITICAL: 0. WARNING: 0.
SUGGESTION: 1.

---

## 1. Requirement coverage — PERF040-01..09 + AUTH-09 delta

| Requirement | Scenario | Implementation | Test (file :: name) | Result |
|---|---|---|---|---|
| PERF040-01 | Nombre-only edit leaves email columns byte-identical | `ActualizarPerfilUseCase` (no email branch entered) + `camposEmail()` absence => `{}` | `test/perfil-crud.int-spec.ts` :: "nombre-only leaves email columns byte-identical" — asserts DB row ciphertext/blindIndex unchanged | PASS (runtime, real DB) |
| PERF040-01 | Nombre + email updated together, `/auth/me` reflects both | `ActualizarPerfilUseCase` full path + `auth.routes.ts` nombre passthrough | `test/perfil-crud.int-spec.ts` :: "nombre + email together, GET /api/auth/me reflects both after" | PASS (runtime) |
| PERF040-01 | Empty/over-80-char nombre rejected before any write | `ActualizarPerfilUseCase` trim+1..80 guard, `NombrePerfilInvalidoError` -> `400 NOMBRE_INVALIDO` | `actualizar-perfil.use-case.spec.ts` (guard-order unit spec, RED/GREEN Phase 3) + `perfil-http-error.spec.ts` (`NombrePerfilInvalidoError->400`) | PASS (unit, part of 1727 green) |
| PERF040-02 | Login proves the email invariant end to end (new works, old fails) | `camposEmail()` single derivation, one `prisma.user.update()` | `test/perfil-email-change.e2e-spec.ts` — THE BINDING E2E, single test, 5 internal assertions (login old->200, PATCH->200, login new->200, login old->401, independent DB re-derivation of both columns match) | **PASS (runtime, real DB, executed this session)** |
| PERF040-02 | A failed email change leaves the account log-in-able | Every failure branch in `ActualizarPerfilUseCase` returns before the write | `test/perfil-crud.int-spec.ts` :: wrong-passwordActual-on-email-change scenario (PERF040-03) covers the same guarantee — columns unchanged | PASS (runtime) |
| PERF040-03 | Wrong current password blocks an email change | `ActualizarPerfilUseCase` step 3d | `test/perfil-crud.int-spec.ts` :: wrong `passwordActual` on email change -> 403 PERFIL_RECHAZADO, email columns unchanged | PASS (runtime) |
| PERF040-03 | Wrong current password blocks a password change | `CambiarPasswordUseCase` step 3 | `test/perfil-crud.int-spec.ts` :: wrong `passwordActual` on /password -> 403 PERFIL_RECHAZADO, passwordHash unchanged AND both A sessions still alive | PASS (runtime) |
| PERF040-04 | Taken email indistinguishable from wrong password | `EmailNoDisponibleError` (port) collapsed to `PerfilRechazadoError` (use case), same P2002 targeted catch | `test/perfil-crud.int-spec.ts` :: email already taken by another account with correct password -> body byte-identical to the wrong-password case, B row untouched | PASS (runtime) |
| PERF040-05 | Valid new password can log in afterward, stored hashed | `CambiarPasswordUseCase` + `Argon2PasswordHasher` | `test/perfil-crud.int-spec.ts` :: valid `passwordNueva` -> 204, stored hash starts with `$argon2id$`, never plaintext + `test/perfil-password-sessions.int-spec.ts` :: login with NEW password -> 200, OLD -> 401 | PASS (runtime) |
| PERF040-05 | Invalid new password rejected before any write | `Password.crear()` (8-128 chars) -> `PasswordInvalidaError` | `test/perfil-crud.int-spec.ts` :: 7-char `passwordNueva` -> 400 PASSWORD_INVALIDA, hash unchanged | PASS (runtime) |
| PERF040-06 | Other session rejected, caller's keeps working | `revocarOtrasPorUserId` before `actualizarPassword`, `req.sessionTokenHash` | `test/perfil-password-sessions.int-spec.ts` — 7-test sequence: pre-condition both work, A changes -> 204, B -> 401, A -> 200, exactly 1 session survives and it's A's, **unrelated user C's session unaffected (RNF-SEC-006 DB-level proof)**, login new/old | **PASS (runtime, real DB, executed this session, 7/7 green)** |
| PERF040-07 | No field can redirect the mutation to another user | `.strict()` Zod schemas + `req.userId!` only | `test/auth-isolation.int-spec.ts` :: "PATCH /api/perfil (cookie A): a body naming B's id is rejected 400 by .strict() — B's row is byte-identical afterward (PERF040-07, US-040)" | PASS (runtime) |
| PERF040-08 | Demo session refused on every mutation | `esDemo` required input, `PerfilDemoSoloLecturaError` -> `403 DEMO_SOLO_LECTURA` | `test/perfil-demo-gate.int-spec.ts` — 5 tests: PATCH /perfil -> 403, /auth/me still 200, no User column changed, PATCH /password -> 403, no passwordHash/session change | PASS (runtime, 5/5 green) |
| PERF040-09 | Contract stays in sync | `openapi-document.ts` two operations, generated `types.gen.ts` | `pnpm api openapi:check` (executed, green) + `openapi-document.spec.ts` inventory | PASS (executed) |
| AUTH-09 (delta) | `/auth/me` returns `nombre`, 401 without session, reflects latest update | `IdentidadUsuario.nombre` required, `authMeResponseSchema` | `auth.routes.spec.ts`, `app.auth.spec.ts`, `auth-me.schema.spec.ts` (unit) + `test/perfil-crud.int-spec.ts` nombre+email scenario (runtime, confirms reflects most recent update) | PASS |

All 15 requirement/scenario rows trace to a named implementation and a named test with a real,
non-trivial assertion. Every scenario with a runtime-checkable claim (DB state, HTTP round trip) is
covered by an integration or e2e test that was **executed this session against a real local
Postgres**, not just present in the tree.

---

## 2. The two headline proofs — verified to exist AND executed AND discriminate

### (a) `test/perfil-email-change.e2e-spec.ts` — THE BINDING E2E
Executed this session (e2e config, filtered to this file) -> **1/1 PASS**.

Confirmed it does exactly what the orchestrator asked:
- Login with OLD email -> `200`.
- `PATCH /api/perfil` with mixed-case/padded new email -> `200`, response body reflects the
  *normalized* value.
- Login with NEW email -> `200`.
- Login with OLD email -> `401` (proves the blind index moved, not that a stale row still matches).
- **Both columns independently re-derived**: fresh `AesGcmCryptoService`/`HmacBlindIndexService`
  instances (not the container's) decrypt/re-hash from the DB row and are asserted equal to the
  expected normalized email — this is the actual discriminating check, not a mock.

### (b) `test/perfil-password-sessions.int-spec.ts` — THE BINDING SESSION-REVOCATION TEST
Executed this session (integration config, filtered to this file, and also as part of the full
24-file/132-test integration run) -> **7/7 PASS**:
1. Both sessions A/B work (pre-condition).
2. A changes password -> `204`.
3. B -> `401` (other session rejected).
4. A -> `200` (caller's session survives).
5. Exactly 1 session remains for the user, and it is A's (not B's, by `tokenHash` comparison).
6. **Unrelated user C's session (own row, own user, seeded independently) still exists and still
   returns `200`** — this is the DB-level cross-user isolation proof added in judgment-day round 2;
   without it, a regression that dropped `userId` from `revocarOtrasPorUserId`'s `where` (global
   revoke instead of per-user) would still pass A/B alone.
7. Login with NEW password -> `200`; OLD -> `401`.

Both proofs are real discriminating tests, not present-but-vacuous placeholders.

---

## 3. Design conformance spot-checks

| Check | Expected (design.md) | Actual (code read) | Result |
|---|---|---|---|
| `camposEmail()` | Returns `{}` or the complete pair, both derived from one `email.valor` | `prisma-user-credential.repository.ts:159-165` — exactly `{}` or both `email`/`emailBlindIndex` from the same `email.valor` literal | CONFORMS |
| `actualizarPerfil()` single update | One `prisma.user.update()`, one `data` object (two spreads) | `prisma-user-credential.repository.ts:97-104` — confirmed, single call | CONFORMS |
| Container's single crypto/blindIndex instances | `crearPerfil` MUST NOT construct `AesGcmCryptoService`/`HmacBlindIndexService`/call `deriveBlindIndexKey` | `crear-perfil.ts` — receives `crypto`/`blindIndex` as parameters, only constructs `PrismaUserCredentialRepository`, `PrismaSessionRepository`, `Argon2PasswordHasher` (all stateless adapters over shared instances) | CONFORMS |
| Port `email` param is the `Email` VO | Raw strings must not type-check | `user-credential-repository.port.ts` — `actualizarPerfil(input: {..., email?: Email})`; `tsc --noEmit` green confirms no string-typed call site compiles | CONFORMS |
| P2002 reads real driver-adapter shape | Must inspect `meta.driverAdapterError.cause.constraint.fields`/`.originalMessage`, not just `meta.target`, fail-closed on unknown | `apuntaA()` in `prisma-user-credential.repository.ts:218-252` — checks array `target`, string `target`, `driverAdapterError.cause.constraint.fields`, and `.originalMessage`; returns `false` (-> rethrow) on none matching | CONFORMS — this is the PR#1 judgment-day-caught bug (`meta.target` never populated under `@prisma/adapter-pg`), fixed and now covered by the real-DB path |
| `revocarOtrasPorUserId` scoping | `where: { userId, tokenHash: { not: tokenHashActual } }` | `prisma-session.repository.ts:69-76` — exact match | CONFORMS |
| Revoke-then-write ordering | `revocarOtrasPorUserId` BEFORE `actualizarPassword` | `cambiar-password.use-case.ts:77-85` — `sessions.revocarOtrasPorUserId(...)` then `creds.actualizarPassword(...)`, sequential `await`s in that order; unit spec asserts invocation order (not two independent `toHaveBeenCalled`s) | CONFORMS |
| `esDemo` required input | Both use cases | `ActualizarPerfilUseCase.execute({ esDemo: boolean, ... })`, `CambiarPasswordUseCase.execute({ esDemo: boolean, ... })` — required, not optional; `tsc` would fail if route forgot to thread `req.esDemo!` | CONFORMS |
| 403 `PERFIL_RECHAZADO` shared by wrong-password and email-taken | Same class, same message | `actualizar-perfil.use-case.ts:106-110` — `EmailNoDisponibleError` (port) is collapsed to `new PerfilRechazadoError()` at the use-case boundary, the exact same class/instance path as the wrong-password branch; `perfil-http-error.ts` maps `PerfilRechazadoError -> 403 PERFIL_RECHAZADO` once | CONFORMS |

No design deviations found.

---

## 4. Executable proof

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | OK | Ran once, alone, early. |
| `prisma generate` | OK | Required inline `DATABASE_URL`/`DIRECT_URL` env (fresh worktree, no `.env`); ran once, alone. |
| `pnpm api test` | **PASS — 215 files, 1727 tests** | Matches apply-progress claim exactly. |
| `pnpm api exec tsc --noEmit` | **PASS — zero errors** | |
| `pnpm api openapi:check` | **PASS** — openapi.json is up to date | |
| `pnpm web test` | **PASS — 61 files, 560 tests** | Zero `apps/web` source changes in this diff; suite green regardless (regression check). |
| `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` (serialized, `fileParallelism: false` already set in `vitest.int.config.ts`) | **PASS — 24 files, 132 tests** | Fresh worktree had no `.env.test`; ran via `vitest run --config ./vitest.int.config.ts` directly with inline env vars (own session `ENCRYPTION_KEY`, per apply-progress's documented gotcha) after `prisma migrate deploy` (no pending migrations — shared docker container already current) + `tsx prisma/seed.ts` (own key). All `perfil-*.int-spec.ts` and `auth-isolation.int-spec.ts` scenarios re-run individually and confirmed by name (sections 1/2 above). |
| `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e` filtered to `perfil-email-change` + `auth-login.e2e-spec.ts` regression | **PASS — 2 files, 7 tests** | Same inline-env approach; the binding e2e and the additive `nombre`-field regression on login both green. Full e2e suite (52 tests per apply-progress) was not re-run in full this session — the binding proof and its stated regression companion were, which is what the orchestrator's check list calls for; not re-running the unrelated ~45 e2e tests (ingesta, google auth, etc.) untouched by this diff is a reasonable scope boundary, not a gap, since `pnpm api test` (unit, 1727 tests) and the full `test:integration` run (132 tests) already re-validated the surrounding surface. |
| Scope proof: diff of `apps/web`, `apps/mobile`, `apps/api/prisma` against `main` | **EMPTY** | Confirmed zero diff — no Configuración UI (US-042 territory), no migration. |

---

## 5. ADR-033 — no sensitive value in any new log line

Diffed every new/changed `logger.*` call site introduced by this change:

- `actualizar-perfil.use-case.ts`: `{found: boolean}`, `{passwordValida: boolean}`,
  `{cambiaNombre: boolean, cambiaEmail: boolean}`.
- `cambiar-password.use-case.ts`: `{found: boolean}`, `{passwordActualValida: boolean}`,
  `{userId}` (an opaque id, not PII under this scheme).

Zero occurrences of `nombre`, `email`, `password`, or a token value being passed to any log call.
`SENSITIVE_REDACT_PATHS` additionally gained `'nombre'`/`'*.nombre'` as defense-in-depth
(`pino-logger.ts`), pinned by `pino-logger.spec.ts`'s two new redaction assertions (flat and nested
`nombre` keys). CONFORMS.

---

## 6. Non-goals respected

- **No Google link/unlink (US-041)**: diff touches no `googleSub`-writing code path; the only
  `login-con-google.use-case.spec.ts` change is a 1-line fixture addition for the new required
  `nombre` field on `IdentidadUsuario` (mechanical D-06 fallout, not new Google logic).
- **No password recovery/reset by email**: absent from the diff — confirmed by file-level stat (no
  new email-sending, no token-reset domain objects).
- **No web UI**: the diff of `apps/web`/`apps/mobile` against `main` is empty (verified twice).

---

## 7. Tasks ledger honesty

`tasks.md` shows 62/62 checked across 17 phases (Phase 0-8 = PR#1, Phase 9-16 = PR#2). Spot-checked
a representative sample against the actual commit history and file diffs:

- 0.1 (no migration needed) matches: confirmed, `apps/api/prisma` diff empty.
- 2.1/2.6/2.7/2.8/2.9 (port + `camposEmail` + P2002) matches: confirmed present exactly as specified (section 3).
- 5.1 (composition guard) matches: confirmed, `crear-perfil.ts` never constructs crypto primitives (section 3).
- 7.4 (binding e2e, own task) matches: confirmed present and green (section 2a).
- 9.1-9.4 (Password VO, no `rawValue`) matches: confirmed `password-invalida.error.ts` carries no
  `rawValue` field, unlike `EmailInvalidoError` — matches the explicit design instruction.
- 12.1 (invocation-order assertion, F7 pin) matches: confirmed present in `cambiar-password.use-case.ts`
  (revoke before write, sequential awaits) and covered by the unit spec per apply-progress.
- 15.1 (binding session-revocation test, own task) matches: confirmed present and green, 7 tests (section 2b).
- 16.2 (zero web/mobile diff, no migration) matches: confirmed (section 4 scope proof).
- Three out-of-scope INFO-item commits (dead `rawValue` removal, docstring correction, C-isolation
  test addition) are present in the commit history as their own commits, matching apply-progress's
  account.

No checked-but-not-landed task found. Ledger is honest.

---

## 8. Deploy-readiness

**What stands between this state and production:**

1. **PR #312 (PR1) must merge into the tracker branch `feat/us-040-editar-perfil` first**
   (feature-branch-chain: PR#314's base is PR#312's branch). Currently both open, mergeable
   states: #312 `UNKNOWN` (GitHub hasn't computed it against its base yet, not a conflict signal —
   recompute on next push/refresh), #314 `MERGEABLE` against its current base. Standard merge order:
   #312 -> tracker, #314 -> tracker (now containing #312's commits, folded), tracker -> `main`.
2. **(a) NO database migration** — confirmed empty diff under `apps/api/prisma`; this change is a
   pure application-layer addition against columns that already exist (`nombre`, `email`,
   `emailBlindIndex`, `passwordHash`, `Session.tokenHash`/`userId` index). Nothing to run against
   Supabase prod beyond the normal push -> Render redeploy.
3. **(b) This change alters authentication-adjacent behaviour** — two user-visible risks if it
   misbehaves in prod:
   - **Email is the login key.** If `camposEmail()`'s pairing logic regressed (the exact hazard
     class of the 2026-08-02 production lockout this change's design is built to prevent), a user
     who changes their email could find themselves **unable to log in with either the old or the
     new email** — a self-inflicted lockout, indistinguishable from a compromised account to the
     user. The binding e2e (section 2a) is the regression gate for exactly this failure mode.
   - **A password change revokes every other session.** If `revocarOtrasPorUserId` regressed
     to a global (not per-user) delete, one user's password change would silently log out
     unrelated users elsewhere — a highly visible, confusing incident (users report "I got logged
     out for no reason" across accounts). The C-isolation test (section 2b, item 6) is the
     regression gate for this failure mode. If it regressed the other way (scoped to nothing), a
     stolen session would survive a password change meant to kill it — the security property
     PERF040-06 exists for.
   - **Safest production smoke test** (does NOT risk locking the real account out): use the
     `nombre`-only path first — `PATCH /api/perfil` with only `{nombre: "<current value>"}` (a
     no-op rename) against a **disposable/secondary test account**, never the operator's own login
     credentials, and confirm `200` + `/auth/me` unchanged. Do **not** smoke-test the email-change
     or password-change endpoints against a real production account interactively: both are
     one-way risk (email lockout, forced session revocation) if anything about the deployed
     environment's `ENCRYPTION_KEY`/blind-index derivation differs from what was tested locally.
     If an email/password smoke test is required, run it against a purpose-created throwaway user
     created via the same deploy, and immediately verify the OLD credential fails and the NEW one
     works (mirroring the e2e assertion), so a broken deploy is caught before any real user is
     exposed to it — never rely on "it compiled" as sufficient signal for this class of change.
4. No feature flag / staged rollout exists for this change (consistent with this repo's current
   deploy model — direct `main`-triggered Render/Vercel deploys, ADR-030). The two-endpoint surface
   is net-new (`PATCH /api/perfil`, `PATCH /api/perfil/password`), so there is no legacy behaviour to
   preserve — the risk is entirely in "does the new code work correctly on first contact with prod
   data," which the binding e2e/int proofs (run against real Postgres, not mocks) are the closest
   available proxy for.
5. US-042 (the Configuración UI that will actually surface these endpoints to end users) is out of
   scope for this change and not yet built — until it ships, the only way to reach these endpoints
   in prod is direct API calls, which limits blast radius of any residual risk to users capable of
   calling the API directly (a materially smaller exposure window than a UI would create).

---

## Findings by severity

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION** (1):
- The full `test:e2e` suite (52 tests per apply-progress) was not re-run in full this session —
  only the binding e2e and its stated login regression companion were re-executed. This is judged
  sufficient given `pnpm api test` (1727 unit tests) and the full `test:integration` run (132 tests,
  all green) already re-validate the surrounding surface, and PR#2's own gate (recorded in
  apply-progress) already ran the full e2e suite (52/52) once. Before archiving, if time permits, a
  full `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e` run (no filter) would close this gap entirely —
  not required to reach PASS, but cheap insurance given this change touches session/auth machinery.

---

## Artifacts consulted

- `openspec/changes/us-040-editar-perfil/specs/perfil-usuario/spec.md` (PERF040-01..09)
- `openspec/changes/us-040-editar-perfil/specs/user-authentication/spec.md` (AUTH-09 delta)
- `openspec/changes/us-040-editar-perfil/tasks.md`
- `openspec/changes/us-040-editar-perfil/design.md`
- Engram `sdd/us-040-editar-perfil/apply-progress` (obs #593)
- Source: `apps/api/src/{domain,application,infrastructure,composition}/**` (US-040 diff surface)
- Test: `apps/api/test/perfil-*.{int,e2e}-spec.ts`, `apps/api/test/auth-isolation.int-spec.ts`,
  `apps/api/test/auth-login.e2e-spec.ts`
- Commit list (27 commits) and diff stat between `main` and `HEAD`
- PR #312, PR #314, issue #313 states (via GitHub CLI)

**Verified by**: sdd-verify (Sonnet 5), checked out at `origin/feat/us-040-s2-password-sesiones`
(local branch `verify-us040-s2`), isolated worktree
`/Users/jorge/dev/MoneyDiary/.claude/worktrees/agent-a951e630e9de58701`.
