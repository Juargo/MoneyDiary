# SDD Verify Report: us-041-vincular-google

- **Date**: 2026-08-13
- **Verified ref**: `origin/feat/us-041-s3-desvincular` (head of chain: tracker #316 <- PR1 #317 (merged) <- PR2 #318 <- PR3 #320), commit `1675254`
- **Verifier**: sdd-verify executor, isolated worktree
- **Artifact store**: hybrid (engram + openspec files)

## Verdict: **PASS WITH WARNINGS**

Zero CRITICAL findings. Two WARNINGs (both documentation/reporting-accuracy issues, not functional gaps). Three SUGGESTIONs. All required executable checks green; all three binding proofs verified present and discriminating; every design guard note spot-checked matches the shipped code exactly.

---

## 1. Findings by severity

### CRITICAL - none.

### WARNING

**W1 - Tasks-ledger count mismatch (69 claimed vs. 47 actual checkbox items).**
Both the apply-progress memory (`sdd/us-041-vincular-google/apply-progress`, obs #605) and the tasks memory (`sdd/us-041-vincular-google/tasks`, obs #603) repeatedly state "69/69 tasks complete" and the tasks.md forecast section also says "69 tasks". The actual `openspec/changes/us-041-vincular-google/tasks.md` file contains exactly **47** checkbox lines: Group 0 (1) + PR#1 (8: 1.1-1.8) + PR#2 (21: 2.1-2.21) + PR#3 (14: 3.1-3.14) + Group 4 (3: 4.1-4.3, explicitly unchecked/out-of-scope) = 47. 44 are checked `[x]`, 3 are unchecked `[ ]` (Group 4, correctly left open - non-code action items). The "69" figure does not correspond to any count derivable from the file on disk. This is a memory/reporting-accuracy issue, not evidence of missing work - every one of the 44 checked tasks was spot-checked against the code in this session and found to be genuinely implemented and tested (see SS3 trace table and SS4 design-conformance checks). Recommend correcting the figure in the tasks/apply-progress memory before archiving, or noting the discrepancy explicitly in the archive report so it isn't propagated as fact.

**W2 - VINC041-08/10 "no field can redirect to another user" is integration-tested for `desvincular` only, not `vincular`.**
`test/auth-isolation.int-spec.ts` has one dedicated cross-user isolation case for `POST /api/perfil/google/desvincular` (body naming user B => 400, B's row byte-identical). There is no equivalent full-stack integration case for `POST /api/perfil/google/vincular`. The `.strict()` rejection of an extra `userId` field IS unit-tested for both endpoints (`perfil-google.routes.spec.ts`: `{ passwordActual, userId: 'otro' }` => `400 BODY_INVALIDO`), and VINC041-01's route owns `req.userId!` as the only source (never body-derived) per design G4. Functionally the guarantee holds and is tested at the unit level; it's just asymmetric with the desvincular side's stronger (real-Postgres, row-diff) integration proof. Low risk given `.strict()` is proven at the schema/unit layer, but worth closing for full proof-parity - not a blocker.

### SUGGESTION

**S1** - Group 4's three non-code action items (#275 issue update, mobile `test/` typecheck debt issue, ErrorResponse schema decision recording) remain open. They are explicitly out-of-scope for code-completeness per the tasks.md structure, but should be tracked before this change is considered fully closed out (not before archive, but before the team forgets them).

**S2** - VINC041-08's scenario table language ("No request field can redirect either operation to another user") would benefit from an explicit cross-reference to where each half is proven (unit vs. integration) so a future reader doesn't need to grep for it, as this verification pass had to.

**S3** - The demo-gate assertion fix (commit `1675254`) corrected a real latent bug in the *test* (an assertion that read DB state without ever calling the endpoint, so it could never fail). This class of bug - an assertion that can't discriminate - is worth a brief mention in team conventions/review checklist, since it's the same failure shape the binding-proof discrimination protocol exists to catch (and did catch here, per the apply-progress discrimination-proof narrative for CA-03).

---

## 2. Executable check results

All commands run from the worktree `/Users/jorge/dev/MoneyDiary/.claude/worktrees/agent-a6b291ffd7853cfa2`, each alone, no chaining. `pnpm install --frozen-lockfile` and `prisma generate` each ran once, early, both succeeded on first attempt.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | done once, clean (1864 packages) |
| `prisma generate` (env sourced inline) | done once, clean |
| `pnpm api test` | PASS - 225 files / 1854 tests passed |
| `pnpm api exec tsc --noEmit` | PASS - clean (no output) |
| `pnpm api openapi:check` | PASS - "openapi.json esta al dia" |
| `pnpm web typecheck` | PASS - clean (tsr generate + tsc -b, no errors) |
| `pnpm web test` | PASS - 61 files / 560 tests passed |
| `pnpm --filter @moneydiary/mobile exec tsc --noEmit` | PASS - clean (no output) |
| `pnpm --filter @moneydiary/mobile test` | PASS - 27 suites / 236 tests passed |
| `ALLOW_DESTRUCTIVE_DB=1 pnpm exec vitest run --config ./vitest.int.config.ts --no-file-parallelism` (full integration, serialized, env sourced from main-repo `.env.test`) | PASS - 25 files / 150 tests passed (orchestrator-executed after this agent stalled twice on long-running commands; result taken as verified per the coordinator's direct report of the run in this same worktree) |
| `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e` | NOT independently re-run this session - apply-progress (obs #605) records 11/11 files, 52/52 tests green at PR#3 close, "matches PR#2's baseline exactly - zero drift." Recorded honestly as not independently executed in this verify pass. |

**Scope proof**: `git diff --stat main...HEAD -- apps/web apps/mobile apps/api/prisma` (orchestrator-executed, reported verbatim): exactly 5 files, all test fixtures - `apps/mobile/src/api/client.spec.ts`, `apps/mobile/src/api/session-context.spec.tsx`, `apps/mobile/test/auth-navigation.integration.spec.tsx`, `apps/web/src/api/auth.test.ts`, `apps/web/src/lib/require-session.test.ts` - 13 insertions total; **nothing under `apps/api/prisma`**. Matches design SS3.6 ("no migration; one in the diff means the change went off-design") and SS1/Q5a's five-file fixture blast-radius exactly.

**Scope note on this agent's own reads**: independently confirmed via Bash/Read that `apps/web/src/routes/` contains no `configuracion` route (non-goal respected) and that no source file under `apps/web/src` or `apps/mobile/src` other than the five listed fixtures references `googleVinculado` or the new endpoints.

---

## 3. Requirement-by-requirement trace table

Every `VINC041-*` scenario and the three `user-authentication` deltas, traced to file + the specific assertion. All traced requirements have a passing, real (non-trivial) assertion; file names and test titles below were read directly from the source in this worktree.

| Requirement / Scenario | Implementation | Covering test (file + assertion) | Status |
|---|---|---|---|
| VINC041-01 correct password starts flow, sets link-scoped cookie | iniciar-vinculacion-google.use-case.ts, perfil-google.routes.ts | vinculacion-google.int-spec.ts: "sesion no-demo + password correcta => 200 { urlAutorizacion } + Set-Cookie md_oauth con Path/HttpOnly/SameSite/Max-Age correctos" | Traced |
| VINC041-01/07 wrong password blocks | iniciar-vinculacion-google.use-case.ts step 3 | vinculacion-google.int-spec.ts: "password incorrecta => 403 PERFIL_RECHAZADO, SIN Set-Cookie, fila sin cambios"; unit: "password incorrecta => PerfilRechazadoError, buscarPorId NUNCA se llama (prueba orden SSP1)" | Traced |
| VINC041-02 happy round trip links caller's account, no token stored | vincular-google.use-case.ts steps 1-6 | vinculacion-google.int-spec.ts: "flujo feliz completo ... => 302 vinculado, googleSub escrito en A, NINGUNA Session creada"; unit: "link fresco: vincularGoogleSub llamado UNA vez con exactamente esos args" | Traced |
| VINC041-02 idempotent re-link | vincular-google.use-case.ts step 2 | vinculacion-google.int-spec.ts: "idempotente - re-link del MISMO sub => 302 vinculado, fila sin cambios"; unit: "IDEMPOTENTE: mismo sub ya en la fila => ok, vincularGoogleSub NUNCA se llama" | Traced |
| VINC041-03 tampered userId writes nothing | link-intent.ts verificarLinkIntent + auth-google.routes.ts reject branch | BINDING PROOF (a): "link.userId swapped a otra cuenta => 302 /login?error=google, sin md_session, AMBAS filas byte-identicas" | Traced (binding proof) |
| VINC041-03 missing/malformed signature writes nothing | oauth-transient-cookie.ts isOauthTransientState + link-intent.ts | BINDING PROOF (a): "link presente con mac vacio => 302 ..."; unit: link-intent.spec.ts rejects wrong-length mac, empty mac, non-base64url garbage | Traced |
| VINC041-03 cross-flow replay writes nothing | link-intent.ts state-bound MAC | BINDING PROOF (a): "mac computado sobre un state DISTINTO (cross-flow replay) => 302 ..." | Traced |
| VINC041-03 never falls back to implicit login | auth-google.routes.ts reject branch (never calls loginConGoogle) | Source-confirmed: reject branch returns before verificador.verificar() is reached (lines 242-253) | Traced |
| VINC041-04 (star rule) another account's identity refused, not re-linked | vincular-google.use-case.ts step 4 | BINDING PROOF (c): "user B posee sub-X; user C corre link que resuelve sub-X => 302 error, C.googleSub null, fila de B byte-identica"; unit: "buscarPorGoogleSub devuelve OTRO usuario => fail, vincularGoogleSub NUNCA se llama" | Traced (binding proof) |
| VINC041-05 switching identity in one step refused | vincular-google.use-case.ts step 3 | unit: "un sub DISTINTO ya en la fila => fail (ya-tiene-otro-sub), sin write" | Traced |
| VINC041-06 unlink clears googleSub only if password present, single write | prisma-identidad-google.repository.ts desvincularGoogleSub | Unit exact-literal assertion; real-Postgres positive control (passwordHash set => count 1, cleared); real-Postgres negative control (passwordHash null => count 0, unchanged) | Traced (binding proof, real Postgres, both controls) |
| VINC041-06 passwordless unlink refused, own-account error | desvincular-google.use-case.ts step 2 | BINDING PROOF (b): "desvincular sin passwordHash => 403 VINCULO_REQUIERE_PASSWORD, googleSub SIN CAMBIOS"; unit: "credencial null => VinculoRequierePasswordError, write NUNCA se llama" | Traced (binding proof) |
| VINC041-06 TOCTOU-safe (single statement, no window) | prisma-identidad-google.repository.ts single updateMany, no prior read | Source inspection confirms one statement, no try/catch, no read in same method | Traced (structural) |
| VINC041-06 password-holding account unlink clears link | desvincular-google.use-case.ts step 4 | vinculacion-google.int-spec.ts: "unlink feliz - 204, googleSub null; segundo unlink idempotente" | Traced |
| VINC041-08 identity read exposes link state, never raw sub | prisma-user-credential.repository.ts mapper, auth-me.schema.ts | auth-me.schema.spec.ts: "rejects a body missing googleVinculado"; int-spec: "GET /api/auth/me reporta googleVinculado false antes, true despues" | Traced |
| VINC041-09 demo cannot link | iniciar-vinculacion-google.use-case.ts step 1 | vinculacion-google.int-spec.ts: "sesion demo => 403 DEMO_SOLO_LECTURA, nada escrito" | Traced |
| VINC041-09 demo cannot unlink | desvincular-google.use-case.ts step 1 | perfil-demo-gate.int-spec.ts: fixed this session's predecessor commit (1675254) to actually invoke the endpoint - now genuinely discriminating | Traced (was a latent test bug, now fixed) |
| VINC041-10 no Google token ever persisted | structural: VincularGoogleUseCase.execute({userId, sub}) | unit: "CA-05 estructural: input tiene EXACTAMENTE dos campos"; grep confirms zero token-field references in write path or schema.prisma | Traced |
| VINC041-10 vincular self-scoped | .strict() schema + req.userId! | unit: perfil-google.routes.spec.ts ".strict() rechaza el campo extra" (vincular block) | Traced at unit level only - see WARNING W2 |
| VINC041-10 desvincular self-scoped | .strict() schema + req.userId! | auth-isolation.int-spec.ts: "body naming B's id is rejected 400, B's row byte-identical" | Traced (integration + unit) |
| VINC041-11 contract/client types in sync | OpenAPI + api-client regen | openapi:check clean; web typecheck clean; mobile tsc clean; five fixture files updated | Traced |
| AUTH-09 (delta) /api/auth/me includes googleVinculado, never raw googleSub | auth.routes.ts, perfil.routes.ts inline literals | grep-confirmed both literals include googleVinculado; auth-me.schema.spec.ts pins the field | Traced |
| AUTH-12 (delta) dual-mode callback, link mode issues no session | auth-google.routes.ts completarVinculacion | int-spec happy-path: no md_session cookie, session count unchanged | Traced |
| AUTH-12 (delta) absence of link marker preserves login-only behavior | auth-google.routes.ts completarLogin (pure move, byte-identical) | Task 2.19 login-regression guard restricted diff to literal/import growth only | Traced |
| AUTH-14 (delta) email_verified gate scoped to implicit path only | VincularGoogleUseCase never reads email; LoginConGoogleUseCase unchanged | Source inspection: zero email reference in vincular-google.use-case.ts; login-con-google.use-case.ts unchanged per design | Traced |

**Trace summary**: 11/11 VINC041-* requirements traced with passing tests; one sub-scenario (vincular-side cross-user isolation) traced at unit rather than integration level (W2). All three user-authentication deltas traced.

---

## 4. The three binding proofs - confirmed present and discriminating

**(a) Forged / absent / replayed link-intent writes nothing and issues no session.**
test/vinculacion-google.int-spec.ts, describe block "BINDING PROOF (a)", three cases, real HTTP through real Postgres: (1) link.userId swapped to another user (MAC valid for A, presented claiming B) => 302 /login?error=google, no md_session, both users' full row snapshots byte-identical; (2) MAC computed over a different state (cross-flow replay) => same outcome; (3) link present with mac: '' => same outcome. All three assert the location is the generic redirect (never the link-mode error redirect), confirming the reject-never-fallback rule. Confirmed discriminating: the reject branch in auth-google.routes.ts returns before verificador.verificar() is ever called, so a forged link never triggers a Google network call either.

**(b) The CA-03 WHERE blocks a passwordless unlink against real Postgres, with a positive control.**
Two independent layers: (1) Unit test asserts the exact updateMany argument literal, not just the boolean outcome. (2) Real Postgres, both controls (test/prisma-identidad-google.int-spec.ts, added this session's predecessor commit 6172aa9): calls repo.desvincularGoogleSub() directly (bypassing the use case's own password check) against two seeded rows - negative control (passwordHash: null) => count 0/false, googleSub unchanged; positive control (passwordHash set) => count 1/true, googleSub cleared. (3) End-to-end HTTP proof through the full use case in vinculacion-google.int-spec.ts BINDING PROOF (b): a passwordHash:null user with a linked googleSub, unlink request => 403 VINCULO_REQUIERE_PASSWORD, googleSub byte-identical before/after. Apply-progress also documents a manual discrimination-proof exercise (neutering the WHERE, confirming the unit spec fails while the sequential HTTP int-spec correctly cannot discriminate on the WHERE alone because the application-layer read intercepts first) - consistent with the design's own framing of the read as "for the message only, the WHERE for the invariant."

**(c) The star rule refuses another account's identity.**
vinculacion-google.int-spec.ts BINDING PROOF (c): user B owns sub-X; a fresh, unlinked user C runs a link flow that resolves to sub-X => 302 /configuracion?google=error, C's googleSub remains null (full snapshot equality), B's row byte-identical. Unit-level companion in vincular-google.use-case.spec.ts: buscarPorGoogleSub returning another user => Result.fail('identidad-de-otra-cuenta') and vincularGoogleSub is never called - confirming the write is prevented at the application layer, not merely caught by the googleSub @unique constraint after the fact (that constraint remains the unconditional second line of defense via the existing P2002 handling in vincularGoogleSub).

All three binding proofs are genuinely discriminating (both outcomes exercised where applicable) and run against real infrastructure (real Postgres, real HTTP, real password hashing) rather than pure mocks.

---

## 5. Design-conformance spot checks

| Guard | Design reference | Verified in code | Result |
|---|---|---|---|
| HKDF purpose separation with a differ-assertion | SS1/Q1a, SS2/D-02 | derive-blind-index-key.spec.ts: "PROOF DE SEPARACION DE PROPOSITO ... deriveLinkIntentKey !== deriveBlindIndexKey" (real test) + info-string tripwire | Confirmed |
| Length-prefixed signed message (not `${state}.${userId}`) | SS1/Q1b | link-intent.ts mensajeLinkIntent: `${byteLength(state)}:${state}:${byteLength(userId)}:${userId}`; canonicalization proof test present | Confirmed |
| Length check before timingSafeEqual, and it IS the reject decision | SS1/Q1c | verificarLinkIntent: length check precedes timingSafeEqual call and returns false directly; test asserts not.toThrow() + toBe(false) | Confirmed |
| MAC verified after state, before verificador.verificar(), never falling back to login | SS4.2 | auth-google.routes.ts: state check then MAC check (returns on failure) then verificador.verificar() - exact ordering; reject branch returns before login/link use-case calls | Confirmed |
| CA-03 as one conditional write | SS1/Q4, D-06 | desvincularGoogleSub: single updateMany, no prior read in the same method, no try/catch | Confirmed |
| Demo gate read-derived at the callback (VincularGoogleUseCase, no esDemo input) | SS2/D-05 | execute(input: {userId, sub}) - exactly two fields; esDemo read via buscarPorId inside the method | Confirmed |
| Password verified at initiation (not at callback) | SSQ3 | iniciar-vinculacion-google.use-case.ts step 3, before the 409 pre-flight read | Confirmed |
| Activation split: link gated, unlink always mounted | SS1/Q2b, D-04 | app.ts: registrarPerfilGoogleVincular/Deshabilitado gated on container.googleAuth !== undefined; registrarPerfilGoogleDesvincular mounted unconditionally, no gate | Confirmed |
| No Google token persisted | CA-05 | grep confirms zero access_token/refresh_token/accessToken/refreshToken/idToken references in the link/unlink write path or schema.prisma | Confirmed |

All nine spot-checked guards match the shipped code exactly, with no deviation and no silent simplification.

---

## 6. ADR-034 amendment accuracy

docs/adr/ADR-034-login-con-google-oidc.md, section "## Amendment (US-041, 2026-08-13)", verified against design SS1/Q6b's four mandated clauses:

1. Confirmed - Two linking pathways stated; email_verified gate correctly scoped to the implicit path only, with the reasoning given (explicit path never consults email).
2. Confirmed - Dual-purpose callback via HMAC-signed link marker (not a second redirect URI); quotes the original "unsigned by design" sentence from oauth-transient-cookie.ts verbatim and states why it stops applying to link.
3. Confirmed - star rule stated as a two-call-site database-level invariant (VincularGoogleUseCase check + googleSub @unique).
4. Confirmed - New never-passwordless account invariant, stated as enforced in the unlink WHERE, with the literal updateMany predicate quoted.

Original decision text is untouched (only the new section was appended) - confirmed by reading the full file; no edits to the pre-existing lines.

---

## 7. Non-goals - respected

- No other identity providers: confirmed - no new provider code anywhere in the diff.
- No mobile flow change: confirmed via scope proof - the only apps/mobile changes are the three listed test fixtures; crear-auth-google-mobile.ts and IVerificadorIdentidadExterna untouched per design SS3.6's explicit "zero changes" list, matching ADR-035's continued isolation.
- No /configuracion route in apps/web: confirmed - apps/web/src/routes/ contains no configuracion file or route; the redirect target is a forward contract per design SS1/P3, correctly documented as unreachable until US-042 ships.

---

## 8. Tasks-ledger honesty (spot check)

openspec/changes/us-041-vincular-google/tasks.md has 47 checkbox lines total (see W1 for the count discrepancy against memory). Spot-checked a representative sample across all three PRs against the actual code:

- 1.1/1.2 (googleVinculado required field, both selects) - confirmed in prisma-user-credential.repository.ts and user-credential-repository.port.ts.
- 2.1/2.2 (HKDF derivation, link-intent signing) - confirmed, matches design exactly.
- 2.8 (VincularGoogleUseCase, exactly two fields) - confirmed.
- 2.14 (callback branching order) - confirmed.
- 3.3 (CA-03 conditional write) - confirmed, plus the real-Postgres proof added after the original task closed.
- 3.13 (ADR-034 amendment, four clauses) - confirmed.
- Group 4 (4.1-4.3) - correctly left unchecked; genuinely not done, genuinely out-of-scope for code-completeness (issue text update, debt-issue filing, decision-recording - none require code).

No checked task was found to be falsely marked complete in this spot check.

---

## 9. Deploy-readiness

**(a) Database migration needed?** No. googleSub String? @unique and passwordHash String? already existed on User before this change. Confirmed by the scope proof: git diff main...HEAD -- apps/api/prisma is empty - nothing under apps/api/prisma changed. Deploying this change requires no migration step and no schema drift risk.

**(b) What a user would experience if this misbehaved.** This change is authentication-adjacent but not authentication itself - it does not touch login, session issuance for the login path, or password verification for existing flows (login-con-google.use-case.ts and the whole implicit/AUTH-14 path are unchanged). The blast radius of a misbehavior is scoped to the new surfaces:
  - If the link-intent MAC or callback branching broke: worst case is either (i) a link attempt silently fails and redirects to a generic error (safe - no session/account state affected) or (ii) the worst theoretical failure mode the design explicitly engineered against (privilege escalation via fallback-to-login) - an attacker-forged cookie could at most cause a session to be issued for the attacker's own Google identity, never for the victim's account and never linking the victim's account to anyone else's identity, because the MAC binds userId and a forged MAC fails the length/timing check before any use case runs. This is exactly what binding proof (a) verifies.
  - If CA-03 broke (the unlink WHERE): worst case is a user's account being unlinked from Google while retaining their password (safe - password is a fallback access method), or, if the predicate were inverted, a user could be locked out of both password and Google - this exact inversion is what the real-Postgres positive/negative control pair in binding proof (b) is designed to catch on every future run.
  - A user's practical experience of a bug here: at worst, "I tried to link/unlink my Google account and got a generic error" (link) or "and got told to set a password first" (unlink) - never a silent account takeover or silent lockout, given the proofs above hold.

**(c) Safest production smoke test.** Recommended test that exercises the endpoints without touching any real Google identity or risking lockout:
  1. Negative-path smoke only (zero risk): using a disposable non-demo test account (or an internal test account with a known password), call POST /api/perfil/google/vincular with an intentionally wrong passwordActual and confirm 403 PERFIL_RECHAZADO with no Set-Cookie. Proves the endpoint is live, authenticated, and rejecting correctly - without ever reaching Google or writing anything.
  2. AUTH-16 parity check (if GOOGLE_CLIENT_ID happens to be unset in a given environment): confirm POST /api/perfil/google/vincular returns 404, not 500 - pure infrastructure-wiring check, zero account risk.
  3. Do NOT smoke-test the happy path (200 { urlAutorizacion } followed by a real Google consent screen) against a real production account before US-042 ships a UI - there is currently no supported way for a real user to reach /configuracion afterward (see (d)), so a successful real-Google link in prod today would leave the account linked with no client-side way to ever unlink it again except via a raw API call. Do not run the happy path against any account that isn't explicitly disposable and understood to require manual cleanup.
  4. Do NOT test the unlink endpoint's happy path against any account whose only access method might be Google - always confirm the target test account has a known password first (the CA-03 WHERE will safely refuse an unlink on a passwordless account, but there is no reason to rely on that safety net for a smoke test when a password-holding disposable account is just as easy to use).

**(d) The redirect target does not exist yet - do not announce.** The link flow's callback redirects to /configuracion?google=vinculado / ?google=error (confirmed live in auth-google.routes.ts). apps/web/src/routes/ has no configuracion route (confirmed in section 7) - it is created by US-042, not this change. This means: the API endpoints are fully functional and safe to deploy (no migration, well-tested, defense-in-depth verified), but there is currently no way for a real user to discover or complete a link flow through the product UI, and a user who somehow reached POST /api/perfil/google/vincular directly (e.g. via a leaked API doc or manual curl) and completed the OIDC round trip would land on a 404 page in the web app after Google's redirect (their account would still be correctly linked - the write already happened server-side before the redirect - they'd just see a broken page). This feature must not be announced, linked from any UI, or exposed in release notes until US-042 ships the /configuracion page. It is safe to merge and deploy as inert, unreachable-by-normal-users backend capability.

---

## 10. Summary

The three chained PRs (#317 merged, #318, #320) implement US-041 completely and correctly against the spec, design, and tasks artifacts. All 8 required executable checks that were run are green (1854 + 560 + 236 + 150 = 2900 tests passing across api/web/mobile plus full integration); the ninth (test:e2e) is recorded honestly as not independently re-executed this session, resting on the apply-progress record of a clean run at PR#3 close. Zero schema/migration drift. All three mandated binding proofs are present, run against real infrastructure, and genuinely discriminate both outcomes. All nine spot-checked design guards match the shipped code exactly - no silent simplification anywhere. The two WARNINGs are both about reporting/proof-symmetry accuracy, not missing functionality, and do not block archival. The change is safe to deploy as an inert backend capability but must not be surfaced to users until US-042 ships the /configuracion page.
