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

- [ ] 1.1 Via Context7/docs, confirm `zaproxy/action-api-scan` (or `action-full-scan`) current ref/version, inputs for custom-header injection (`cmd_options`/replacer rules), `rules_file_name`, `fail_action`, `allow_issue_writing: false`.
- [ ] 1.2 Via Context7/docs, confirm Schemathesis v4 `st run` flags: `--url`, `--header`/`-H`, `--checks not_a_server_error,response_schema_conformance`, `--exclude-method`, exit-code-on-failure behavior.
- [ ] 1.3 Record exact pinned SHAs/versions found; if header injection proves too awkward for either tool, fall back to unauthenticated-surface + 401-contract scope only (design-flagged fallback).

## Phase 2: Locally-Testable Helper

- [ ] 2.1 RED: add `apps/api/test/unit/dast-helpers.spec.ts` for `extractLoginToken(body: unknown): string` (parses `.token`, throws on missing) — unit-testable via `pnpm api test`.
- [ ] 2.2 GREEN: implement `apps/api/scripts/dast-helpers.ts` exporting `extractLoginToken`; keep it pure (no network/fs).
- [ ] 2.3 Add thin CLI wrapper (readiness-poll loop against `GET /`, login curl, token echo) as inline shell in the workflow OR a small `apps/api/scripts/dast-readiness.ts` — this orchestration part is CI-only, not unit-tested (no fake server harness added for it).

## Phase 3: `dast` Job in `ci.yml`

- [ ] 3.1 Add `dast` job: `needs: changes`, `if: api == 'true' || shared == 'true'`, clone `integration` job's postgres service container.
- [ ] 3.2 Env: same as `integration` (localhost `DATABASE_URL`/`DIRECT_URL`, `ALLOW_DESTRUCTIVE_DB: '1'`, `API_KEY`, `COOKIE_SECURE: 'false'`, `NODE_ENV: test`, `PORT: 3000`, `SEED_USER_*`) plus fresh `ENCRYPTION_KEY` step.
- [ ] 3.3 Steps: install, prisma generate, `test:db:setup`, `pnpm api build`, `pnpm api start:prod &`, poll `GET /` (curl loop, timeout+fail).
- [ ] 3.4 Login pre-step: `POST /api/auth/login` with `x-api-key` + seeded creds, extract token via helper (2.2), export to `$GITHUB_ENV`.
- [ ] 3.5 ZAP baseline step against `openapi.json` with both headers injected, `allow_issue_writing: false`, using `.zap/rules.tsv`.
- [ ] 3.6 Create `.zap/rules.tsv` downgrading known-noisy passive alerts to WARN.
- [ ] 3.7 Schemathesis `st run` step: `--url http://localhost:3000`, both headers, checks from 1.2, `--exclude-method POST,PUT,PATCH,DELETE`.
- [ ] 3.8 Confirm gating: FAIL on ZAP High / Schemathesis 5xx-or-schema failures; everything else WARN only.

## Phase 4: Wire into `ci-success`

- [ ] 4.1 Add `dast` to `ci-success`'s `needs`. Per the flagged decision above: if advisory, add `continue-on-error: true` on the `dast` job (still visible, doesn't block merge) and note follow-up to promote to required after a burn-in period.

## Phase 5: Verify It Actually Scans

- [ ] 5.1 Run the job on a PR touching `apps/api/**`; confirm ZAP and Schemathesis logs report a non-zero endpoint/operation count (not a silent no-op against a dead server).
- [ ] 5.2 Confirm the job fails when pointed at a deliberately broken auth header (sanity-check the gate isn't vacuously green).
