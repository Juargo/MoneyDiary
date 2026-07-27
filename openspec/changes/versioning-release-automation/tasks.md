# Tasks — versioning-release-automation

Delivery strategy: **ask-on-risk** (see Review Workload Forecast below for the
recommendation). Four independent frontiers, MANDATORY dependency order per
design §5 (riskiest / production-touching LAST):

```
Slice A (commit enforcement) ──► Slice B (release-please) ──► Slice C (CI split) ──► Slice D (hybrid CD)
   no prod impact                  no prod impact, manual        CI-only               PRODUCTION —
                                    validation gate before                              per-platform,
                                    merging generated PRs                               verified + revertible
```

**No `apps/*` domain/application code is touched by this change** — every
task below is repo tooling/CI-CD config (JSON/YAML/shell + version bumps).
**Strict TDD (`pnpm api test`) does not apply here.** Testability split:

- Tasks with a **unit/CLI-checkable** done-criterion (e.g. `commitlint`
  exit code) are verified that way.
- Tasks marked **[observed]** describe CI/CD platform behavior that cannot be
  unit-tested — they are verified by triggering a real PR/push/tag and
  inspecting the workflow run, deploy log, or GitHub Release, per this repo's
  existing layered-verification discipline (ADR-015, same pattern as
  `api-access-control`'s AC-05 runbook verification). Do not fake a unit test
  for these.
- Tasks marked **CONFIRM-AT-APPLY** carry a documented-but-unverified detail
  (Context7 was unavailable during design) that must be checked against live
  docs/the actual platform UI before or during implementation.

Every task maps to one or more spec requirement IDs
(`openspec/changes/versioning-release-automation/spec.md`).

---

## Slice A — ADR-020 commit enforcement (root-only, no prod impact)

**Precondition for everything else**: release-please only works if the
commit history it parses is trustworthy Conventional Commits. Nothing in
Slice B may land before this slice's CI gate (A.7) is live. Greenfield
install — explore confirmed no `.husky/`, no `commitlint.config.*`, no
`prepare` script exist today.

- [x] **A.1** Root `package.json` — add `"prepare": "husky"` to `scripts`;
  add devDeps `husky ^9.1.7`, `@commitlint/cli ^19.6.1`,
  `@commitlint/config-conventional ^19.6.0`, `lint-staged ^15.2.11`.
  File: `package.json`. CONFIRM-AT-APPLY: exact latest patch versions at
  install time (pins above are current-major shapes per design).
  Done: `pnpm install` succeeds and sets `core.hooksPath` to `.husky/_`.
  Maps to: CMT-01 (precondition).
  **APPLIED**: installed `husky^9.1.7`, `@commitlint/cli^21.2.1`,
  `@commitlint/config-conventional^21.2.0` (commitlint majors moved to 21
  since design time — well-aged, resolved via `pnpm audit`/registry publish
  dates), `lint-staged^17.1.0` (pinned below the `latest` 17.2.0 tag, which
  was only 4 days old at apply time — violates `.npmrc`'s
  `minimum-release-age=10080`; pnpm 11.2.2 does not enforce that key
  automatically, verified manually). `core.hooksPath` confirmed
  `.husky/_`. Audit fixup: `@commitlint/cli`'s transitive deps resolved to
  `js-yaml@4.1.1`/`fast-uri@3.1.2`, both with open high-severity
  advisories — added `pnpm-workspace.yaml` overrides
  `js-yaml: '>=4.3.0 <5.0.0'` / `fast-uri: '>=3.1.4 <4.0.0'` (same-major
  patched versions), re-verified `pnpm audit --audit-level=high` clean of
  any husky/commitlint/lint-staged/js-yaml/fast-uri findings.

- [x] **A.2** Scaffold the hooks directory: `pnpm exec husky init` (creates
  `.husky/pre-commit` + `.husky/_/husky.sh`), then overwrite the three hook
  files per A.3–A.5 (husky v9 hooks are plain scripts, no v8 boilerplate).
  File: `.husky/` (new dir). Done: `.husky/_/husky.sh` exists.
  **APPLIED**: `pnpm exec husky init` ran; `.husky/_` (gitignored per husky
  convention, added to `.gitignore`) confirmed present with `husky.sh`.

- [x] **A.3** `.husky/commit-msg` — the hard local gate.
  Content: `pnpm exec commitlint --edit "$1"`.
  Done [CMT-01 scenario, manual smoke]: committing
  `feat(api): add resumen anual endpoint` locally succeeds; committing
  `updated stuff` locally is rejected and no commit is created.
  Maps to: CMT-01.
  **APPLIED & VALIDATED**: `git commit --allow-empty -m "updated stuff"` →
  rejected (`type may not be empty`, `subject may not be empty`, exit 1,
  no commit created — confirmed via `git log`). `git commit --allow-empty
  -m "not a conventional commit"` → same rejection, re-confirmed after all
  Slice A commits landed. Valid Conventional Commit messages (all 4 real
  commits on this branch, `test: ...` smoke commit) → accepted, exit 0.

- [x] **A.4** `.husky/pre-commit` — lint-staged, routed by workspace glob.
  Files: `.husky/pre-commit` (content: `pnpm exec lint-staged`) +
  new `.lintstagedrc.json` (root) with per-workspace patterns (e.g.
  `apps/api/**/*.ts` → `pnpm --filter @moneydiary/api exec eslint --fix`,
  `apps/web/**/*.{ts,tsx}` → web's eslint, `apps/landing/**/*.astro` →
  Prettier only, `apps/mobile/**/*.{ts,tsx}` → mobile's eslint), matching
  CLAUDE.md's ADR-020 description ("ESLint --fix + Prettier + typecheck del
  workspace tocado, routing por glob"). CONFIRM-AT-APPLY: exact glob/command
  syntax — design left this file's contents open (ADR-020 pins behavior,
  not exact lint-staged config). Done: staging a `.ts` file under one
  workspace and committing only lints that workspace's files.
  **APPLIED — SCOPE ADJUSTED**: `.lintstagedrc.json` routes only
  `apps/api/**/*.ts` → `pnpm --filter @moneydiary/api exec eslint --fix`
  and `apps/web/**/*.{ts,tsx}` → `pnpm --filter @moneydiary/web exec
  eslint --fix`. **`apps/landing` and `apps/mobile` were deliberately
  left OUT** of `.lintstagedrc.json` — explore confirmed landing has no
  eslint/prettier installed at all and mobile has no eslint (ADR-018
  defers mobile a11y-eslint post-MVP; no mobile "lint" script exists
  today). Inventing a new devDependency for those two workspaces was out
  of Slice A's authorized scope; their CI typecheck/build steps remain the
  real gate meanwhile. Validated by staging a dummy `.ts` file under
  `apps/api/src/` and `apps/web/src/` and running `pnpm exec lint-staged
  --debug`: confirmed each glob matched only its own workspace's 1 file
  and ran only that workspace's `eslint --fix`, in parallel, both passing
  — test files then unstaged and deleted (not committed).

- [x] **A.5** `.husky/pre-push` — convenience, test-affected-only.
  Content: `pnpm --filter "...[origin/main]" test`.
  Done (manual smoke): pushing with no workspace changes runs no tests;
  pushing an api-only change runs only `pnpm api test`.
  **APPLIED — GOTCHA FOUND**: validated the filter logic with
  `pnpm --filter "...[origin/main]" ls` (not a real `git push`, per this
  phase's no-push constraint). **Finding**: the workspace ROOT itself
  (`moneydiary`) is a pnpm workspace member (confirmed via `pnpm -r ls`),
  and its own `"test"` script is `"pnpm -r test"` (recursive, runs EVERY
  workspace). Any commit that touches only root-level tooling files (as
  this entire Slice A PR does) makes pnpm consider the ROOT package
  "affected" by the `[origin/main]` filter — so `pnpm --filter
  "...[origin/main]" test` will invoke root's own `pnpm -r test` and run
  the FULL test suite, not "no tests" as the literal done-criterion
  states. This fails safe (over-tests rather than under-tests) and is
  accepted as-is — pre-push is explicitly a convenience gate, not the
  hard enforcement (that's A.7's CI job) — but is a real deviation from
  the task's literal wording, recorded here rather than silently
  resolved. Not fixed in this slice (would require changing root
  `package.json`'s `"test"` script semantics, out of scope).

- [x] **A.6** `commitlint.config.js` (root, CommonJS — root has no
  `"type":"module"`). Content: `module.exports = { extends:
  ['@commitlint/config-conventional'] }` — **deliberately no `scope-enum`**
  (YAGNI: release-please groups by file path not commit scope; existing
  history uses scopes beyond the 4 workspaces; a strict enum would reject
  legitimate history for zero versioning benefit — design DD7).
  Done: `echo "feat(api): x" | pnpm exec commitlint` exits 0;
  `echo "bad msg" | pnpm exec commitlint` exits 1.
  Maps to: CMT-01/02 (precondition).
  **APPLIED & VALIDATED EXACTLY PER DONE-CRITERION**: `echo "feat(api): x"
  | pnpm exec commitlint` → exit 0. `echo "bad msg" | pnpm exec commitlint`
  → `type may not be empty`/`subject may not be empty`, exit 1.

- [x] **A.7** CI commitlint gate job — the REAL enforcement (ADR-020: local
  hooks are `--no-verify`-skippable, CI is not). File:
  `.github/workflows/ci.yml` — add a standalone `commitlint` job to the
  CURRENT 2-job file (`ci`, `landing`): checkout with `fetch-depth: 0`,
  `pnpm/action-setup@v4`, `actions/setup-node@v4`, `pnpm install
  --frozen-lockfile`, then `pnpm exec commitlint --from
  ${{ github.event.pull_request.base.sha }} --to
  ${{ github.event.pull_request.head.sha }}` on `pull_request` /
  `--from ${{ github.event.before }} --to ${{ github.sha }}` on `push`.
  This is a minimal, surgical addition to the file as it exists TODAY — the
  full path-filtered rewrite is Slice C, not this task.
  Done **[CMT-02, observed]**: a PR with only valid Conventional Commits
  passes the new `commitlint` check; a PR containing a malformed commit
  message fails it and shows a failing required check.
  Maps to: CMT-02.
  **APPLIED; LIVE-CI OBSERVATION PENDING** (this phase does not push/open
  a PR — see apply-progress). Job added exactly as specified, purely
  additive (`git diff` shows only the new job block, zero lines touched in
  the existing `ci`/`landing` jobs). YAML syntax validated with `js-yaml`.
  Locally simulated the exact command CI will run: `pnpm exec commitlint
  --from main --to HEAD` over all 4 real Slice A commits → exit 0 (1
  cosmetic `footer-leading-blank` warning, non-blocking). Also simulated
  the negative case: created a commit with `--no-verify` (bypassing local
  hooks, the exact scenario ADR-020's CI gate exists for) and ran
  `commitlint --from <prev> --to HEAD` → correctly failed with exit 1. The
  real GitHub Actions run against a live PR is the remaining
  `[observed]` confirmation, deferred to when this branch is pushed/PR'd
  (outside this apply phase's scope per its STOP instruction).

---

## Slice B — release-please bootstrap (no deploy; manual validation gate)

Depends on Slice A (trustworthy commit history going forward). This slice's
OWN PR has zero deploy impact. The generated release PRs it produces are a
SEPARATE, later, manually-reviewed decision — do not auto-merge them (B.6).

- [ ] **B.1** `release-please-config.json` (repo root, new). Content per
  design §1: `release-type: node`, `bump-minor-pre-major: true`,
  `bump-patch-for-minor-pre-major: false`, `separate-pull-requests: true`,
  `include-component-in-tag: true`, `tag-separator: "-"`,
  `changelog-sections` (feat/fix/perf/refactor/docs visible;
  test/ci/chore hidden), `packages`: `apps/api→{component:api}`,
  `apps/web→{component:web}`, `apps/landing→{component:landing}`,
  `apps/mobile→{component:mobile, release-type:expo}`. Root (`.`) is
  deliberately NOT a key (structural exclusion — REL-05).
  CONFIRM-AT-APPLY: the installed `release-please-action@v4` exposes the
  `expo` release-type; **fallback** if not — `release-type: node` for
  mobile + `extra-files: [{type:json, path:"app.json",
  jsonpath:"$.expo.version"}]` (design §1 fallback).
  Done: a dry-run / first real workflow run proposes exactly 4 separate
  release PRs, none referencing root.
  Maps to: REL-01, REL-02, REL-03, REL-05, REL-06.

- [ ] **B.2** `.release-please-manifest.json` (repo root, new). Content:
  `{"apps/api":"0.1.0","apps/web":"0.1.0","apps/landing":"0.1.0",
  "apps/mobile":"0.1.0"}`.
  Done: manifest keys match `packages` keys in B.1 exactly (a mismatch
  errors the release-please workflow at run time).
  Maps to: REL-06.

- [ ] **B.3** Bootstrap on-disk versions to `0.1.0` — same commit as B.1/B.2
  (zero manifest↔package.json drift). Files: `apps/api/package.json`,
  `apps/web/package.json`, `apps/landing/package.json`,
  `apps/mobile/package.json` (`version` `0.0.1`→`0.1.0` each) +
  `apps/mobile/app.json` (`expo.version`→`0.1.0`). Root `package.json`
  version stays `0.0.1` (untracked, irrelevant).
  Done: all 4 workspace versions + `expo.version` read `0.1.0`; root
  unchanged; `mvp-v1` tag untouched (matches no `<component>-v*` pattern).
  Maps to: REL-06.

- [ ] **B.4** `.github/workflows/release-please.yml` (new). Content per
  design §1: `on: push: branches: [main]`; `permissions: contents: write,
  pull-requests: write, issues: write` (all three required — `issues:write`
  needed because v4 labels release PRs via the Issues API, design DD3);
  `concurrency: {group: release-please-${{ github.ref }},
  cancel-in-progress: false}`; `googleapis/release-please-action@v4` with
  `config-file`/`manifest-file` inputs (manifest mode = **omit**
  `release-type` action input — passing it would build an inline
  single-package manifest instead).
  Done: workflow YAML is syntactically valid; on the first push to `main`
  after this + B.1–B.3 merge, exactly 4 separate release PRs open.
  Maps to: REL-01, REL-04, REL-05.
  **Registered gotcha (accepted, not a task to fix now):** PRs opened by
  `GITHUB_TOKEN` don't trigger `ci.yml` (GitHub recursion guard) — so the
  release PR itself won't show CI checks. Accepted because its content is
  mechanical (version+CHANGELOG+manifest) and the post-merge push to `main`
  DOES run CI+CD. Trigger to revisit: if branch protection later requires
  checks on the release PR itself, swap the token to a GitHub App/PAT.

- [ ] **B.5** CHANGELOG bootstrap — confirm no manual file is needed.
  Action: do NOT hand-create `CHANGELOG.md` files in this PR — release-please
  creates each component's `CHANGELOG.md` on its OWN first release PR.
  Document this explicitly in the PR description so a reviewer doesn't flag
  it as a missed task.
  Done: after B.4's first live run, each of the 4 opened release PRs' diff
  includes a newly-created `apps/<pkg>/CHANGELOG.md`.
  Maps to: REL-01, REL-04.

- [ ] **B.6** VALIDATION GATE — inspect, do not blind-merge.
  Action: after B.1–B.4 land on `main` and release-please runs once, manually
  inspect all 4 opened release PRs: exactly 4 SEPARATE PRs (not one
  combined), correct component tag names (`api-v0.1.x`, `web-v0.1.x`,
  `landing-v0.1.x`, `mobile-v0.1.x`), correct changelog sections, none
  reference root or another component. Per design §5: **do NOT merge any of
  them until validated.**
  Done **[REL-01/02/03/05/06, observed — this is the acceptance test for
  every REL requirement]**: 4/4 PRs match expectations. Merging these
  generated PRs is an explicit, separate, human-reviewed decision — out of
  this task list's automatic execution scope (each merge cuts a real tag).

---

## Slice C — CI restructure: path-scoped jobs + `ci-success` aggregate + mobile job + Node pin

Depends on Slice A (the `commitlint` job added in A.7 must already exist to
carry over into the restructured file). Independent of Slice B. CI-only
impact — no deploy. **Preserve every existing check verbatim** — this is a
surgical extension of the current 2-job `ci.yml`, not a from-scratch rewrite.

- [ ] **C.1** Wire the existing `.node-version` (`22.22.3`, already present
  at repo root, matches `render.yaml`'s `NODE_VERSION`) into every
  `setup-node` step via `node-version-file: .node-version`, replacing the
  hardcoded `node-version: 22` (kills major-only drift — design DD5).
  File: `.github/workflows/ci.yml`.
  Done: every job's `setup-node` step uses `node-version-file`, none uses a
  literal `node-version: 22`.
  Maps to: CI-03.

- [ ] **C.2** `changes` job — `dorny/paths-filter@v3` emitting
  api/web/mobile/landing/shared booleans. File: `.github/workflows/ci.yml`.
  Filters: `api: ['apps/api/**']`, `web: ['apps/web/**']`,
  `mobile: ['apps/mobile/**']`, `landing: ['apps/landing/**']`,
  `shared: ['pnpm-lock.yaml','package.json','pnpm-workspace.yaml',
  '.node-version','.github/workflows/**']`.
  Done **[CI-01, observed]**: a PR touching only `apps/landing/**` produces
  `changes` outputs `landing=true`, all four others `false`.
  Maps to: CI-01.

- [ ] **C.3** Split the current `ci` job into `api`/`web` jobs (rename +
  gate), each `needs: changes`, `if: needs.changes.outputs.<ws> == 'true' ||
  needs.changes.outputs.shared == 'true'`. File:
  `.github/workflows/ci.yml`. **Every existing step stays unchanged**:
  `prisma generate`, `tsc --noEmit`, `env:example:check`, `pnpm api test`,
  `pnpm api build` (api); `pnpm web typecheck`, `pnpm web test`,
  `pnpm web build`, web secret-scan grep (web). Also add root-level
  `permissions: {contents: read}` (least privilege — `paths-filter` +
  checkout only need read).
  Done: preserved-checks audit — diff the new file against the current one
  step-by-step; every existing `run:` line is present, unchanged, only
  wrapped in `needs`/`if` gating.
  Maps to: CI-01, CI-03.

- [ ] **C.4** Gate the `landing` job the same way (`needs: changes`,
  `if: needs.changes.outputs.landing == 'true' ||
  needs.changes.outputs.shared == 'true'`), steps unchanged (astro check,
  build, secret grep, smoke test). File: `.github/workflows/ci.yml`.
  Done: a PR touching only `apps/api/**` does NOT run the `landing` job.
  Maps to: CI-01.

- [ ] **C.5** NEW `mobile` job (ADR-017 — jest-expo/RNTL job doesn't exist
  today). File: `.github/workflows/ci.yml`. Steps: checkout,
  `pnpm/action-setup@v4`, `setup-node` (`node-version-file`),
  `pnpm install --frozen-lockfile`,
  `pnpm --filter @moneydiary/mobile exec tsc --noEmit`,
  `pnpm --filter @moneydiary/mobile test` (jest-expo 57/jest@29 + RNTL).
  Gated: `needs: changes`, `if: needs.changes.outputs.mobile == 'true' ||
  needs.changes.outputs.shared == 'true'`.
  CONFIRM-AT-APPLY: `apps/mobile`'s tsconfig supports standalone
  `--noEmit` (its `test` script is confirmed present per CLAUDE.md's
  commands table).
  Done **[CI-02, observed]**: a PR confined to `apps/mobile/**` runs and
  passes this job; a PR confined to `apps/api/**` does not trigger it.
  Maps to: CI-02.

- [ ] **C.6** `ci-success` aggregate job — the new stable required check.
  File: `.github/workflows/ci.yml`. `if: always()`,
  `needs: [changes, commitlint, api, web, mobile, landing]`; fails if any
  needed job's result is `failure` or `cancelled` (skipped ≠ fail).
  Done: a PR where only `landing` runs (others skipped by path filters)
  still reports `ci-success` as PASSING.
  Maps to: CI-01 (fixes the "skipped required-check hangs forever" failure
  mode named in design DD4).

- [ ] **C.7** Branch-protection migration (out-of-band GitHub repo setting,
  not a file diff). Action: update `main`'s required-checks list to require
  `ci-success` (and optionally `commitlint`) INSTEAD OF the old job names
  (`Typecheck & unit tests`, `Typecheck & build landing`), which stop
  existing after C.1–C.6 land.
  Done **[observed — platform setting]**: branch protection shows
  `ci-success` as required; the old job names are removed from the list.
  Maps to: CI-01, CI-02, CI-03 (unblocks merges once check names change).

---

## Slice D — Hybrid CD (LAST — touches production; per-platform, sequential, each independently verified + revertible)

Do NOT start until A, B, and C are merged and verified. Structurally
independent of B/C content, but sequenced last per design §5 because it is
the only slice touching real deploys. One platform part at a time.

- [ ] **D.1** api → Render `buildFilter`. File: `render.yaml` — add under
  the `moneydiary-api` service: `buildFilter: {paths: [apps/api/**,
  pnpm-lock.yaml, pnpm-workspace.yaml, render.yaml], ignoredPaths:
  [apps/api/**/*.spec.ts, apps/api/test/**, apps/api/**/*.md]}`.
  CONFIRM-AT-APPLY: exact Render `buildFilter.paths`/`ignoredPaths` schema
  (documented shape only — Context7 unavailable during design; re-check
  current Render docs before applying).
  Done **[CD-01, observed]**: push a web-only commit to `main` → no new
  Render api deploy triggers; push an api-only commit → it DOES.
  Rollback: remove `buildFilter` → Render reverts to build-on-every-push.
  Maps to: CD-01.

- [ ] **D.2** web → NEW `apps/web/vercel.json` with `ignoreCommand`. File:
  `apps/web/vercel.json` (new). Content: `{"$schema":
  "https://openapi.vercel.sh/vercel.json", "ignoreCommand": "git diff
  --quiet HEAD^ HEAD -- . ../../pnpm-lock.yaml"}`. **Constraint**: additive
  only — must NOT add `rewrites`/`routes` that would disturb the existing
  `apps/web/api/[...path].ts` proxy function (the server-side API-key
  boundary from Tarea 0-W).
  CONFIRM-AT-APPLY: (1) the web Vercel project's Root Directory is actually
  `apps/web`; (2) `HEAD^` resolves on Vercel's shallow clone — if not,
  fall back to `VERCEL_GIT_*` env vars or `git fetch --deepen=1` inside the
  command.
  Done: a push touching only `apps/api/**` does NOT trigger a new web
  Vercel build; a push touching `apps/web/**` DOES; the existing proxy
  route still works post-deploy (smoke test `/api/*` through it).
  Rollback: delete `apps/web/vercel.json` → build on every push.
  Maps to: CD-01 (same behavioral class, web platform).

- [ ] **D.3** landing → extend existing `apps/landing/vercel.json` with the
  same `ignoreCommand`, keeping ALL existing headers
  (CSP/HSTS/nosniff/Referrer-Policy) verbatim. File:
  `apps/landing/vercel.json` (edit, additive only).
  Done: diff shows only the added `ignoreCommand` key, headers block
  byte-identical; a non-landing push does not trigger a landing rebuild.
  Rollback: remove the `ignoreCommand` key, keep headers.
  Maps to: CD-01 (same behavioral class, landing platform).

- [ ] **D.4** mobile → NEW `.github/workflows/mobile-release.yml`,
  triggered by `mobile-v*` tags. File: `.github/workflows/
  mobile-release.yml` (new). `on: push: tags: ['mobile-v*']`;
  `permissions: {contents: read}`; steps: checkout, `pnpm/action-setup@v4`,
  `setup-node` (`node-version-file`), `pnpm install --frozen-lockfile`,
  `expo/expo-github-action@v8` (`token: ${{ secrets.EXPO_TOKEN }}`), then
  `eas build --platform all --profile production --non-interactive
  --no-wait` run from `apps/mobile`. Submission to stores stays manual
  (ADR-022 — out of scope).
  Precondition (out-of-band): repo secret `EXPO_TOKEN` must be added in
  GitHub settings before this workflow can succeed.
  Done **[CD-02, observed]**: pushing a test tag `mobile-v0.0.0-test`
  starts an EAS build in Actions (then delete the test tag); no other
  tag/push starts this workflow.
  Rollback: delete the workflow file → tags stop building; EAS remains
  manually runnable (status quo ante).
  Maps to: CD-02.

- [ ] **D.5** release-please↔EAS version-ownership boundary — verify only
  (already structurally guaranteed by B.1's `expo` release-type + EAS's
  existing `appVersionSource:"remote"`/`autoIncrement:true`, which this
  change does not modify). Action: after the first real `feat(mobile): ...`
  release PR merges and cuts `mobile-v0.x.0`, inspect (a) the release PR
  diff — only `app.json > version` + `package.json` version + CHANGELOG
  changed, `versionCode`/`buildNumber` absent/untouched; (b) the resulting
  EAS build — its consumed `versionCode`/`buildNumber` came from EAS's own
  remote counter, not from any file in the diff.
  Done **[CD-03, observed — cross-system behavior, no unit test possible]**:
  both inspections confirm disjoint writes (release-please owns `version`,
  EAS owns build numbers, write-before-tag / read-after-tag).
  Maps to: CD-03.

- [ ] **D.6** End-to-end verify + rollback confirmation, per design §5's
  rollback table. Action: for each of D.1–D.4, execute the paired
  verify+rollback check (e.g. D.1: push docs-only → no api rebuild, then
  remove `buildFilter` → confirms fallback to build-on-every-push). Record
  results in the PR description / apply-progress notes.
  Done: all 4 platform parts individually verified AND individually
  confirmed revertible without touching the other 3.
  Maps to: CD-01, CD-02, CD-03 (closes the loop on every CD requirement).

---

## Review Workload Forecast

**Rough estimated changed lines per slice** (additions + deletions,
surgical/verbatim-preserving style, not full rewrites):

| Slice | Files touched | Est. changed lines |
|---|---|---|
| A | root `package.json`, 3× `.husky/*`, `.lintstagedrc.json`, `commitlint.config.js`, `ci.yml` (+1 job) | ~45–60 |
| B | `release-please-config.json` (new), `.release-please-manifest.json` (new), `release-please.yml` (new), 4× `package.json` + `app.json` version bumps | ~65–90 |
| C | `ci.yml` (surgical: gating + node pin + 2 new jobs, existing steps untouched) | ~55–80 |
| D | `render.yaml`, `apps/web/vercel.json` (new), `apps/landing/vercel.json`, `mobile-release.yml` (new) | ~40–55 |
| **Total (all 4 slices combined)** | | **~205–285** |

**Estimated changed lines: ~205–285 (rough), under the 400-line budget even
combined into one PR.**

**Chained PRs recommended: Yes — this is a process/risk call, not a
line-count call.** Line budget alone would allow a single PR, but the
design's own "Sequencing & rollback" table (§5) makes a single PR the wrong
shape for three independent reasons:

1. **Slice B has a mandatory manual validation gate** — after B's config
   lands, release-please's FIRST generated release PRs must be inspected
   (exactly 4 separate PRs, correct tags/changelogs) BEFORE any of them are
   merged. That inspection can only happen after B is live on `main`, which
   requires B to be merged independently of C/D.
2. **Slice D is the only production-touching slice** and design explicitly
   sequences it last, one platform at a time, each independently verified
   against a real trigger and independently revertible. Bundling D with
   A/B/C removes the ability to land the safe, no-prod-impact slices (A, B,
   C) while D's CONFIRM-AT-APPLY items (Vercel `ignoreCommand` polarity on a
   shallow clone, Render `buildFilter` schema) are still being verified live.
3. **Hard dependency order** (A→B→C→D) with distinct verification methods
   per slice (local CLI checks for A, generated-PR inspection for B, live PR
   path-filter checks for C, live deploy/tag checks for D) means each slice
   has its own done-criterion that can't be confirmed until the previous
   slice is live on `main`.

**400-line budget risk: Low** (per-slice PRs are all well under 400 lines;
even the combined total is under 400).

**Decision needed before apply: Yes.** Per `ask-on-risk`, confirm before
`sdd-apply` starts:
- Chain strategy: **`stacked-to-main` fits this shape best** — each slice
  is designed to be independently mergeable and independently revertible
  (design §5's rollback column is written per-slice, not as a single
  all-or-nothing unit), which is exactly what stacked-to-main enables
  (each PR merges to `main` before the next starts, no long-lived tracker
  branch holding back production-safe slices A–C while D is still being
  verified).
- Confirm the user wants Slice B's generated release PRs (the 4 PRs
  release-please itself opens, distinct from this task list's own 4 PRs)
  reviewed and merged as a separate, later, explicit action — not
  auto-merged as part of applying this SDD change.

**Proposed PR boundary map** (`stacked-to-main`, 4 PRs, in order):

1. **PR 1 — Slice A** (`feat(repo): add commitlint + husky commit enforcement,
   ADR-020`): A.1–A.7. No prod impact. Merges first; unblocks B.
2. **PR 2 — Slice B** (`feat(repo): bootstrap release-please, ADR-030`):
   B.1–B.5 as the PR's diff; B.6 (validation gate) is a post-merge manual
   step performed against the live workflow, not part of the PR diff. No
   deploy impact.
3. **PR 3 — Slice C** (`feat(ci): path-scoped jobs + mobile test job +
   ci-success gate`): C.1–C.6 as the PR's diff; C.7 (branch-protection
   settings) is a post-merge out-of-band GitHub settings change. CI-only
   impact.
4. **PR 4 — Slice D** (`feat(cd): hybrid CD — Render/Vercel path filters +
   mobile-v* → EAS`): D.1–D.5 as the PR's diff; D.6 (rollback drill) is
   executed and recorded during/after this PR's own live verification.
   **Production-touching — merges last, only after PRs 1–3 are live and
   verified.**
