# Design: DAST CI Wiring (ADR-021 DAST layer activation)

## Technical Approach

Add a single path-filtered `dast` job to `.github/workflows/ci.yml` that is a
near-clone of the existing `integration` job: same ephemeral Postgres service
container, same test env, same `test:db:setup`. It then **boots the real API**
against that seeded DB, waits on the `GET /` health endpoint, mints an auth
token via a login pre-step, and runs **ZAP baseline + Schemathesis** against
`http://localhost:3000`, importing `apps/api/openapi.json`. Gating is strict on
the two things ADR-021 names (unexpected 5xx / contract violations), lenient
elsewhere. Slice 1 covers passive scan + read-only property fuzzing; active
scan and write fuzzing are deferred to a scheduled workflow.

## Architecture Decisions

### Decision: Boot with `start:prod` (built dist) against the ephemeral DB
**Choice**: `pnpm api build` then `pnpm api start:prod &`, backgrounded, then a
curl-poll on `GET /` (returns 200 "Hello World!", public, no api-key) as the
readiness probe. Env mirrors `integration`: `NODE_ENV=test`, localhost
`DATABASE_URL`, `API_KEY`, fresh `ENCRYPTION_KEY` (`openssl rand -base64 32`),
`COOKIE_SECURE=false`, `PORT=3000`, `SEED_USER_*`.
**Alternatives**: `start` (ts-node) — rejected: slower boot, not the deployed
artifact; scanning the built server is closer to prod. A dockerized app image —
rejected: no Dockerfile exists, overkill (YAGNI).
**Rationale**: `test` env + localhost passes both the `env.ts` superRefine and
the `db-safety` gate, so the scanners can safely fuzz/mutate a throwaway DB —
exactly the ADR-021 "ephemeral env, never Supabase" constraint.

### Decision: Authenticate scanners via two static headers (Bearer, not cookie)
**Choice**: A pre-step curls `POST /api/auth/login` (with `x-api-key`) using the
seeded creds and captures `.token` from the JSON body. Both scanners then send
`x-api-key: <key>` **and** `Authorization: Bearer <token>`.
**Alternatives**: (a) capture the `md_session` cookie and replay it — rejected:
cookie handling in ZAP/Schemathesis is fiddlier than a static header; (b)
public-surface-only first slice (401 contract) — rejected as too thin now that
Bearer makes authed scanning cheap.
**Rationale**: `extractToken` already accepts `Authorization: Bearer`, so a
static header authenticates the full protected surface with zero cookie state.
Honest, real coverage — not a silently-unauthenticated scan.

### Decision: Slice 1 = ZAP baseline (passive) + Schemathesis read-only
**Choice**: ZAP **baseline** profile (passive, fast, per-PR). Schemathesis with
checks `not_a_server_error` + `response_schema_conformance`, restricted to
read methods (`--exclude-method POST,PUT,PATCH,DELETE`).
**Alternatives**: full active ZAP + full write fuzzing per PR — rejected: slow,
noisy, and multipart upload fuzzing (`POST /api/ingestas`) is genuinely hard to
make non-flaky.
**Rationale**: catches real issues (missing security headers, 5xx, contract
drift) green-on-clean without blocking on the hardest surface.

### Decision: Least-privilege — disable ZAP issue-writing
**Choice**: ZAP action `allow_issue_writing: false`; job keeps `contents: read`.
**Rationale**: the action defaults to opening a GitHub issue (needs
`issues: write`) — the repo's ADR-021 posture is least-privilege; findings gate
via exit code + SARIF/artifact, not repo writes (same stance as gitleaks).

## Data Flow

    changes(paths-filter) ─▶ dast job
      postgres service ─▶ test:db:setup (migrate+seed)
      build ─▶ start:prod & ─▶ poll GET / (200)
      POST /api/auth/login (x-api-key) ─▶ token
      ├─▶ ZAP baseline  (openapi.json + 2 headers) ─▶ fail on High
      └─▶ Schemathesis  (openapi.json + 2 headers) ─▶ fail on 5xx/schema
    dast ─▶ ci-success (needs)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | Modify | Add `dast` job (clone `integration` env+service); add `dast` to `ci-success` needs; path-filter `api || shared` (already covers `openapi.json` via `apps/api/**`). |
| `.zap/rules.tsv` | Create | ZAP alert-threshold tuning: downgrade known-noisy passive alerts to WARN so only High FAILs. |
| `.github/workflows/dast-full.yml` | Create (deferred, slice 2) | Scheduled (`schedule` + `workflow_dispatch`) ZAP **full/active** scan + Schemathesis write fuzzing, same boot pattern. |

## Interfaces / Contracts

- Health/readiness: `GET /` → `200` (existing, unauthenticated).
- Auth for scanners: `x-api-key: $API_KEY` + `Authorization: Bearer $TOKEN`.
- Scanner input: `apps/api/openapi.json` (OpenAPI 3.1.0, 14 ops). Note: it has
  **no `servers` block and no `securitySchemes`** → base URL and auth are
  supplied via CLI/action flags, not read from the schema.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| CI job | Boot + health + login pre-step succeed | curl-poll + assert token non-empty; fail fast |
| DAST (passive) | Security headers, misconfig, 5xx | ZAP baseline, fail on High |
| DAST (contract) | No unexpected 5xx, response-schema conformance | Schemathesis read-only checks |

Note: BOLA/IDOR (`user_id` isolation) is **out of scope** — owned by
integration tests (ADR-021 / RNF-SEC-006). DAST does not replace them.

## Gating (fail vs warn)

- **FAIL the build**: any ZAP **High** alert; any Schemathesis `not_a_server_error`
  (unexpected 5xx) or `response_schema_conformance` failure.
- **WARN only**: ZAP Medium/Low/Informational (triage via `.zap/rules.tsv`),
  deferred write-fuzz findings. Start strict on 5xx/contract, lenient elsewhere.

## Migration / Rollout

Additive CI only — no runtime/app code change, no data migration. Slice 1 lands
the per-PR `dast` job; the scheduled full/active scan is a separate follow-up.

## Open Questions (confirm at apply via Context7/docs)

- [ ] ZAP action exact ref + inputs: `zaproxy/action-api-scan` version, how to
      pass custom headers (`cmd_options` replacer rules vs `-z`), `rules_file_name`,
      `fail_action`, `allow_issue_writing: false`.
- [ ] Schemathesis CLI: v4 uses `st run`; confirm `--url`, `--header`,
      `--checks`, `--exclude-method`, and the non-zero-exit-on-failure flag.
- [ ] Optionally add `securitySchemes` (apiKey + bearer) to `openapi.json` so
      scanners auto-negotiate auth — nice-to-have, not required for slice 1.
