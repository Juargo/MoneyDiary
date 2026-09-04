# Tasks: DAST CI Wiring (ADR-021 DAST layer activation)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280-350 (dast job ~150-180, helper script + test ~90, .zap/rules.tsv ~10, ci-success ~1) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

Separate (non-size) decision flagged for apply: **required vs advisory `dast` gate in `ci-success`** — recommend advisory for slice 1 (DAST is new and can be noisy; ADR-021 calls for triage before hard-blocking). Confirm before merging Task 4.1.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full slice: helper + `dast` job + advisory wiring | PR 1 | Single PR; additive CI only, no app code change |

## Phase 1: Confirm Scanner Syntax (gated — no job code before this)

- [x] 1.1 Via Context7/docs, confirm `zaproxy/action-api-scan` (or `action-full-scan`) current ref/version, inputs for custom-header injection (`cmd_options`/replacer rules), `rules_file_name`, `fail_action`, `allow_issue_writing: false`.
- [x] 1.2 Via Context7/docs, confirm Schemathesis v4 `st run` flags: `--url`, `--header`/`-H`, `--checks not_a_server_error,response_schema_conformance`, `--exclude-method`, exit-code-on-failure behavior.
- [x] 1.3 Record exact pinned SHAs/versions found; if header injection proves too awkward for either tool, fall back to unauthenticated-surface + 401-contract scope only (design-flagged fallback).

## Phase 2: Locally-Testable Helper

- [x] 2.1 RED: add `apps/api/test/unit/dast-helpers.spec.ts` for `extractLoginToken(body: unknown): string` (parses `.token`, throws on missing) — unit-testable via `pnpm api test`.
- [x] 2.2 GREEN: implement `apps/api/scripts/dast-helpers.ts` exporting `extractLoginToken`; keep it pure (no network/fs).
- [x] 2.3 Add thin CLI wrapper (readiness-poll loop against `GET /`, login curl, token echo) as inline shell in the workflow OR a small `apps/api/scripts/dast-readiness.ts` — this orchestration part is CI-only, not unit-tested (no fake server harness added for it).

## Phase 3: `dast` Job in `ci.yml`

- [x] 3.1 Add `dast` job: `needs: changes`, `if: api == 'true' || shared == 'true'`, clone `integration` job's postgres service container.
- [x] 3.2 Env: same as `integration` (localhost `DATABASE_URL`/`DIRECT_URL`, `ALLOW_DESTRUCTIVE_DB: '1'`, `API_KEY`, `COOKIE_SECURE: 'false'`, `NODE_ENV: test`, `PORT: 3000`, `SEED_USER_*`) plus fresh `ENCRYPTION_KEY` step.
- [x] 3.3 Steps: install, prisma generate, `test:db:setup`, `pnpm api build`, `pnpm api start:prod &`, poll `GET /` (curl loop, timeout+fail).
- [x] 3.4 Login pre-step: `POST /api/auth/login` with `x-api-key` + seeded creds, extract token via helper (2.2), export to `$GITHUB_ENV`.
- [x] 3.5 ZAP baseline step against `openapi.json` with both headers injected, `allow_issue_writing: false`, using `.zap/rules.tsv`.
- [x] 3.6 Create `.zap/rules.tsv` downgrading known-noisy passive alerts to WARN.
- [x] 3.7 Schemathesis `st run` step: `--url http://localhost:3000`, both headers, checks from 1.2, `--exclude-method POST,PUT,PATCH,DELETE`.
- [x] 3.8 Confirm gating: FAIL on ZAP High / Schemathesis 5xx-or-schema failures; everything else WARN only.

## Phase 4: Wire into `ci-success`

- [x] 4.1 Add `dast` to `ci-success`'s `needs`. Per the flagged decision above: if advisory, add `continue-on-error: true` on the `dast` job (still visible, doesn't block merge) and note follow-up to promote to required after a burn-in period.

## Phase 5: Verify It Actually Scans

- [x] 5.1 Run the job on a PR touching `apps/api/**`; confirm ZAP and Schemathesis logs report a non-zero endpoint/operation count (not a silent no-op against a dead server).
- [ ] 5.2 Confirm the job fails when pointed at a deliberately broken auth header (sanity-check the gate isn't vacuously green).

---

## Reconciliación 2026-09-04 — el change estaba implementado, no sin empezar

Este `tasks.md` decía 0/17. Verificado contra el repo, las fases 1 a 4 **ya
estaban construidas** y mergeadas desde el 2026-08-03:

- `dast` job en `.github/workflows/ci.yml` (con su servicio postgres, seed, build
  y arranque del API real)
- `.zap/rules.tsv`, `apps/api/scripts/dast-readiness.ts`, script `dast:token`
- el extractor de token con su test — en
  `apps/api/src/infrastructure/http-express/dast/extract-login-token.ts`, **no**
  en `apps/api/scripts/dast-helpers.ts` como decía la tarea 2.2
- `dast` **sí** está en los `needs` de `ci-success` (tarea 4.1), como advisory
- el guard anti-no-op de la tarea 5.1 está codeado y funciona (`Selected: 0/`)

Lo que faltaba no era construir: era **darse cuenta de que el escaneo estaba roto**.

### Hallazgo real

Schemathesis venía saliendo con exit 1 —7 Runtime Errors, fase Fuzzing
bloqueada, 7 de 15 operaciones sin escanear— y el job reportaba **success**,
porque el `continue-on-error` se tragaba el código de salida.

Causa raíz: `uvx schemathesis@4.24.3` fija solo schemathesis; sus deps
transitivas resuelven libres. `jsonschema-rs` 0.50.0 retiró
`CanonicalSchema.is_satisfiable()`, que schemathesis 4.24.3 invoca al generar
parámetros. Frontera verificada reproduciendo local: 0.49.9 OK, 0.50.0 roto.
Subir schemathesis no alcanza (la última declara el mismo rango abierto).

### Estado

La tarea **5.2** (verificar que el gate no esté vacuamente verde) queda abierta,
pero su premisa cambió: el gate no estaba vacío por falta de tráfico, sino por
una malfunción tragada por `continue-on-error`. Se añade un guard que distingue
`Runtime Error` (scanner roto, operación sin escanear) de un hallazgo real.

Único pendiente de trabajo, además de 5.2: **promover el job `dast` de advisory
a bloqueante** — la decisión que este mismo archivo dejó flagged en la tarea 4.1
y que no se puede tomar hasta ver corridas limpias con el pin aplicado.
