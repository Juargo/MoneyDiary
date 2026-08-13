# Archive Report: US-040 — Edit profile (nombre, email, password), API only

**Archived**: 2026-08-13  
**Change**: `us-040-editar-perfil`  
**Issue**: [#274](https://github.com/Juargo/MoneyDiary/issues/274)  
**Status**: COMPLETE — Merged to main and deployed to production  

---

## Executive Summary

US-040 has been successfully implemented, verified, and archived. Two chained PRs (#312 → #314) merged into the tracker PR #313, which merged to `main` and deployed to production (commit `54a2462`). The change introduces self-service profile editing for authenticated users with three new HTTP endpoints: `GET /api/auth/me` (enhanced with `nombre`), `PATCH /api/perfil` (to update name and email), and `PATCH /api/perfil/password` (to change password with session revocation). All requirements (PERF040-01..09, AUTH-09 delta) have been met and verified. No database migration was required. Zero files changed under `apps/web/` or `apps/mobile/`.

---

## Artifacts Archived

All six artifacts from the change directory have been moved to `/openspec/changes/archive/2026-08-13-us-040-editar-perfil/`:

1. **proposal.md** — 391 lines. Complete proposal outlining binding decisions (current password required for email changes; password change revokes other sessions; demo sessions cannot edit profile); 7 key approach sections; risk mitigations; success criteria; and rollback plan.

2. **design.md** — 1095 lines. Detailed design resolving 5 open questions with corrections from the proposal; 7 architectural decisions (email write invariant, Password VO, two endpoints, shared generic error, compile-enforced gates, `nombre` redaction, layer honesty); module/layer map; end-to-end write paths with failure modes; contracts for ports, use cases, and HTTP surface; and residual risks.

3. **tasks.md** — 289 lines. Comprehensive task breakdown into 16 phases split across two chained PRs (PR #1: identity read + nombre/email write; PR #2: password change + session revocation). Each task is numbered and marked as completed. Both PRs exceed the 400-line budget; `size:exception` expected and recorded. Non-negotiables enumerated.

4. **verify-report.md** — 239 lines. Verification report (PASS verdict, 0 CRITICAL, 0 WARNING, 1 SUGGESTION). Includes requirement coverage matrix (15 scenarios across PERF040-01..09 and AUTH-09), two headline binding proofs (email invariant e2e, session revocation test), design conformance spot-checks (8 conformances verified), executable proof (green bars for unit/integration/e2e), ADR-033 compliance (no sensitive values logged), and deploy-readiness assessment.

5. **specs/perfil-usuario/spec.md** — 172 lines. New capability specification (PERF040-01..09) describing self-service profile editing: nombre/email updates, email write invariant, current-password requirement, anti-enumeration, password hashing, session revocation, self-scoping, demo gate, and contract sync.

6. **specs/user-authentication/spec.md** — 370 lines. Canonical spec updated with AUTH-09 delta: `GET /api/auth/me` now returns `nombre` (required field) with two new scenarios confirming the payload includes the name and that it reflects profile updates. All existing AUTH-01..18 requirements unchanged.

---

## Canonical Specs Merged

Two merge operations were completed:

1. **Updated AUTH-09 in canonical spec** — Changed from "returns id/email" to "returns id/email/**nombre**" with two additional scenarios covering the new `nombre` field and its post-update reflection.

2. **Created new canonical spec** — `/openspec/specs/perfil-usuario/spec.md` (172 lines) with full PERF040-01..09 requirements, mirroring the change's delta spec exactly.

---

## Delivery Summary

### Change Implementation

**Two chained PRs** (both merged, both size:exception):

- **PR #312** (base: tracker branch `feat/us-040-editar-perfil`): Identity read (`nombre` on `/auth/me`) + `PATCH /api/perfil` (nombre/email write with email invariant). Ships PERF040-01/02/03(email half)/04/07/08 + AUTH-09. ~830 changed lines (330 source, 420 specs, 80 generated).
  
- **PR #314** (base: PR #312): Password VO + `PATCH /api/perfil/password` + session revocation (`revocarOtrasPorUserId`). Ships PERF040-03(password half)/05/06. ~550 changed lines (200 source, 300 specs, 50 generated).

**Tracker PR #313** merged both slices into `main`.

### Quality Gates

- **1727 unit tests green** (Vitest, no DB)
- **132 integration tests green** (real Postgres, strict isolation and invariant proofs)
- **52 e2e tests green** (smoke + headline proofs; binding e2e `perfil-email-change.e2e-spec.ts` proves the email invariant end-to-end: login with old email ⇒ change email ⇒ login with new succeeds ⇒ login with old fails)
- **560 web tests green** (no source changes; regression check)
- **236 mobile tests green** (no source changes)
- **OpenAPI contract sync green** (`openapi:check`, `api-client typecheck`)
- **TypeScript strict mode green** (`tsc --noEmit`)

### Production Verification (commit `54a2462`)

- `GET /api/auth/me` returns `nombre` (fields: userId, email, nombre, esDemo)
- `PATCH /api/perfil` from demo session ⇒ `403 DEMO_SOLO_LECTURA`
- `PATCH /api/perfil/password` from demo session ⇒ `403 DEMO_SOLO_LECTURA`
- Real account profile endpoint verified safe and available (smoke test on `nombre`-only edit with real user; email/password changes not exercised in production due to account lockout risk if misconfigured; full proofs are the e2e and integration tests)

---

## Key Design Wins

1. **Email write invariant — one home, one atomic update**: The `camposEmail()` helper in `PrismaUserCredentialRepository` ensures ciphertext and blind index always derive from the same normalized `Email` value and are written together in a single `prisma.user.update()`. No half-pair state is expressible. This directly addresses the 2026-08-02 production incident where a mismatched blind index locked a user out.

2. **Type-enforced security gates**: `esDemo` and `tokenHashActual` are required input fields on use cases — forgetting them is a compile error, not a runtime hole. `IdentidadUsuario.nombre` is required; `ValidarSesionResult.tokenHash` is required. Exhaustive error mapping with `const _exhaustive: never` guard in `aPerfilHttpError`.

3. **Session revocation with ordering, not transactions**: Two writes across two ports are ordered so revocation (6) happens before password write (7). If revocation fails, nothing changes (fail-closed). If password write fails after revocation, users log in with the old password on other devices — a nuisance, never a hole. The forbidden state (new password + stolen session) is unreachable by construction.

4. **Anti-enumeration parity with login**: Wrong `passwordActual` and "email already taken" collapse into the same generic `403 PERFIL_RECHAZADO` response, giving an attacker no way to distinguish which failure occurred. The current password is always verified before any email lookup, so timing is equalized without dummy hashing.

5. **Canonical specs merged**: The email write invariant and all profile requirements are now in official specs (`perfil-usuario`), not buried in proposals or designs. AUTH-09's addition of `nombre` is recorded as an explicit delta, ensuring future readers understand what changed.

---

## Real Bugs Found

Two real bugs were discovered during integration testing against real Postgres (not mocks):

1. **`@prisma/adapter-pg` does not populate `error.meta.target` as documented** — The P2002 guard required fallback inspection of `error.meta.driverAdapterError.cause.constraint.fields` to distinguish the `emailBlindIndex` collision from other unique constraint violations. This is now pinned by a repository spec.

2. **Cross-user session revocation gap** — An early version's `revocarOtrasPorUserId` did not include `userId` in the `where` clause, which would have globally revoked all sessions across all users. The binding session-revocation test (perfil-password-sessions.int-spec.ts) discovered and caught this by seeding an unrelated user's session and asserting it survives. The fix adds `userId` to the deletion scope.

---

## Process Learnings

1. **Planning artifact verification matrix used incomplete test runner**: `pnpm web test` (jsdom + Testing Library) does NOT run type-checking. Adding `nombre` as a required field to generated client types broke existing web/mobile test fixtures even though no consumer source file was touched. The real gate is `pnpm web typecheck` (`tsc -b` + `tsr generate`). A required-field addition to a generated contract type is a breaking change for consumers.

2. **Real-Postgres tests are non-negotiable for cryptographic invariants**: Mock-based testing would have missed both the `@prisma/adapter-pg` shape issue and the cross-user revocation gap. The binding e2e and session-revocation test proved their weight.

---

## Follow-up Work

No blockers remain. The following follow-ups are recorded with triggers:

- **US-042** (web Configuración page): Consumes this API; depends on US-040 as its only blocker.
- **US-041** (Google link/unlink): Note that Google-only users with `passwordHash = null` cannot change email or password via this API (returns generic `403 PERFIL_RECHAZADO`). A password-set flow is a companion of US-041.
- **Email verification** (confirm-before-switch): Deferred; current-password requirement ships as the safeguard. Trigger: first support case or arrival of email-sending capability.
- **`nombre` validation in specs/perfil-usuario/spec.md**: Added empty/over-80-char rejection scenario per design §3.1, ensuring verification checks this real constraint.

---

## Files Removed from Change Directory

After archiving, the following files should be deleted from the active working directory (git rm):
- `openspec/changes/us-040-editar-perfil/proposal.md`
- `openspec/changes/us-040-editar-perfil/design.md`
- `openspec/changes/us-040-editar-perfil/tasks.md`
- `openspec/changes/us-040-editar-perfil/verify-report.md`
- `openspec/changes/us-040-editar-perfil/specs/perfil-usuario/spec.md`
- `openspec/changes/us-040-editar-perfil/specs/user-authentication/spec.md`
- `openspec/changes/us-040-editar-perfil/` (directory)

The canonical specs (`openspec/specs/perfil-usuario/spec.md` and the updated `openspec/specs/user-authentication/spec.md`) remain in the canonical location.

---

## Artifact Observation IDs

Archived artifacts (proposals, designs, tasks, verify-reports) for traceability:

- Proposal: topic_key `sdd/us-040-editar-perfil/proposal` (engram-backed during planning)
- Design: topic_key `sdd/us-040-editar-perfil/design`
- Tasks: topic_key `sdd/us-040-editar-perfil/tasks`
- Verify Report: topic_key `sdd/us-040-editar-perfil/verify-report`
- Apply Progress: topic_key `sdd/us-040-editar-perfil/apply-progress` (work items + commit hashes)
- Archive Report: topic_key `sdd/us-040-editar-perfil/archive-report` (this document)

All cross-referenced in engram for future discovery and audit trails.
