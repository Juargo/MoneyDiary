# Design — versioning-release-automation

> SDD design phase (HOW at architecture level). Bindings come from ADR-030 (independent
> per-workspace semver via release-please **manifest mode**), ADR-020 (commitlint enforcement,
> closed fully here), baseline **0.x**, hybrid CD (Render/Vercel path filters + `mobile-v*`→EAS),
> release-please owns `app.json` `version` / EAS `autoIncrement` owns `versionCode`/`buildNumber`
> (`appVersionSource:"remote"` already set). Store: **hybrid** (this file + engram
> `sdd/versioning-release-automation/design`).
>
> **Context7 status:** the Context7 MCP tools were NOT available in this phase (`resolve-library-id`
> returned "No such tool available"). release-please config/manifest schema, action v4 permissions,
> and EAS remote-versioning behavior are taken from the **explore phase's** cited Context7 lookups
> (`/googleapis/release-please`, `/googleapis/release-please-action`, `/expo/eas-cli`). Vercel
> `ignoreCommand` and Render `buildFilter` shapes below are the **documented shapes** and could not be
> re-verified via Context7 in this phase — flagged inline as CONFIRM-AT-APPLY.

---

## Answers to the three open questions (decided)

1. **Workflow permissions** → `contents: write` + `pull-requests: write` + `issues: write`.
   `issues: write` IS required for v4: release-please attaches labels (`autorelease: pending`,
   `autorelease: tagged`) to its release PRs, and GitHub label mutation goes through the **Issues
   API** (`POST /repos/{owner}/{repo}/issues/{n}/labels`). Without `issues: write` the action fails
   when labeling. This matches the action's own README (explore §Context7). No broader scope is needed.

2. **Combined vs separate release PRs** → `separate-pull-requests: true` (one PR per package).
   The binding is *independent per-workspace semver*. The default (`false`) merges all components into
   ONE combined release PR whose merge cuts tags for **every** changed package at once — that couples
   release cadence (web can't ship without also shipping api) and directly contradicts independence.
   Separate PRs give each package its own reviewable changelog, its own merge decision, its own tag,
   and — because our CD is path/tag-scoped — its own isolated deploy. SRP/KISS: one release PR = one
   package = one reason to change. Cost (more open PRs) is acceptable and is the correct shape here.

3. **Exact 0.x seed** → **`0.1.0` for all four** (`api`/`web`/`landing`/`mobile`), root untracked.
   All packages are at `0.0.1` with no prior version tag. Binding forbids `1.0.0`. `0.0.1` reads as
   "nothing shipped yet", which is false — api/web/landing run in prod, mobile MVP is built. `0.1.0`
   is the conventional "first functioning pre-stable" baseline. **Critical companion decision:** set
   `bump-minor-pre-major: true` so that in 0.x a breaking change bumps the MINOR (0.1.0→0.2.0) instead
   of promoting to `1.0.0` — without this flag release-please would jump to 1.0.0 on the first
   `feat!:`/`BREAKING CHANGE`, violating the "not 1.0.0" binding. In 0.x with these settings:
   `feat`→minor, `fix`→patch, breaking→minor. Promotion to 1.0.0 stays a deliberate manual act
   (`Release-As: 1.0.0` footer). Seed the manifest AND set each `apps/*/package.json` to `0.1.0` in
   the same bootstrap commit so there is zero manifest↔package.json drift.

---

## Architecture approach

Four **independent release trains**, one per `apps/*` workspace, driven off a single Conventional-
Commit history on `main`. release-please (manifest mode) reads the history, groups commits **by the
file path they touch** (not by commit scope), and maintains one release PR + one changelog + one
`<component>-vX.Y.Z` tag per package. The root workspace is deliberately **not** a release train
(excluded by simply not listing it in the `packages` map).

Layering / boundaries (each owns exactly one concern — SRP):

| Concern | Owner | Boundary rule |
|---|---|---|
| Commit-message validity | commitlint (hook + **CI gate**) | CI is the real enforcement; hooks are convenience (`--no-verify`-skippable per ADR-020) |
| Version numbers + changelogs + tags | release-please manifest | Bumps derived only from commits touching each package's path |
| Mobile marketing `version` (`app.json`) | release-please (`expo` strategy) | Writes `expo.version` + `package.json` version. Never touches build numbers |
| Mobile `versionCode`/`buildNumber` | EAS (`autoIncrement`, remote source) | Owned entirely on EAS servers. Never written by release-please |
| Per-workspace CI | one `ci.yml`, path-filtered jobs + aggregate gate | A job runs only when its workspace (or a shared root) changed |
| Per-platform deploy | platform-native filters (Render/Vercel) + `mobile-v*`→EAS | Each platform rebuilds only when its own workspace changed |

Data flow (merge → release → deploy):

```
dev commits (Conventional) ──► main
        │                         │
        │                         ├─► ci.yml: changes-filter ─► per-workspace jobs + commitlint gate ─► ci-success (required check)
        │                         │
        │                         └─► release-please.yml ─► opens/updates 1 release PR per changed package (0.1.0→…)
        │                                                        │  (merge a package's PR)
        │                                                        ▼
        │                                    push version-bump commit + cut <component>-vX.Y.Z tag
        │                                                        │
        ├─ apps/api/**  changed ──────────────────────────────► Render buildFilter matches ─► api redeploy
        ├─ apps/web/**  changed ──────────────────────────────► Vercel ignoreCommand proceeds ─► web redeploy
        ├─ apps/landing/** changed ───────────────────────────► Vercel ignoreCommand proceeds ─► landing redeploy
        └─ tag mobile-v* pushed ──────────────────────────────► mobile-release.yml ─► eas build --profile production
                                                                                          └─ EAS reads app.json version, increments remote buildNumber
```

---

## 1. release-please (Slice B)

### `release-please-config.json` (repo root)

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "separate-pull-requests": true,
  "include-component-in-tag": true,
  "tag-separator": "-",
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance" },
    { "type": "refactor", "section": "Refactors" },
    { "type": "docs", "section": "Documentation" },
    { "type": "test", "section": "Tests", "hidden": true },
    { "type": "ci", "section": "CI", "hidden": true },
    { "type": "chore", "section": "Chores", "hidden": true }
  ],
  "packages": {
    "apps/api": { "component": "api" },
    "apps/web": { "component": "web" },
    "apps/landing": { "component": "landing" },
    "apps/mobile": { "component": "mobile", "release-type": "expo" }
  }
}
```

Notes:
- **Root exclusion**: root (`.`) is not a key in `packages` → not tracked/bumped. No explicit exclude
  needed. Because release-please only sees files under each configured path, a change to a root file
  (`package.json`, `pnpm-lock.yaml`, `render.yaml`, `.github/**`) bumps **no** package. This is the
  structural guard against cross-cutting commits corrupting versions.
- **Tag shape**: `component` + `include-component-in-tag:true` + `tag-separator:"-"` →
  `api-v0.1.0`, `web-v0.1.0`, `landing-v0.1.0`, `mobile-v0.1.0`. The mobile tag `mobile-v*` is exactly
  the CD trigger for Slice D4 — no separate tagging step.
- **`release-type: node`** (default) updates `apps/<pkg>/package.json` version + CHANGELOG. Mobile
  overrides to **`expo`**, which additionally updates `apps/mobile/app.json` `expo.version` (the
  binding: release-please owns app.json `version`). CONFIRM-AT-APPLY that the installed release-please
  version exposes the `expo` strategy; **fallback** if not: `"release-type": "node"` for mobile plus
  `"extra-files": [{ "type": "json", "path": "app.json", "jsonpath": "$.expo.version" }]` to bump the
  app.json version generically. Either way `ios.buildNumber`/`android.versionCode` are never written
  (keys don't exist in app.json — explore §1).
- **`bump-minor-pre-major: true`** is load-bearing for the "not 1.0.0" binding (see open-Q #3).

### `.release-please-manifest.json` (repo root)

```json
{
  "apps/api": "0.1.0",
  "apps/web": "0.1.0",
  "apps/landing": "0.1.0",
  "apps/mobile": "0.1.0"
}
```

Bootstrap commit also sets `apps/api|web|landing|mobile/package.json` `version` to `0.1.0` and
`apps/mobile/app.json` `expo.version` to `0.1.0`, so manifest == on-disk from day one. Root
`package.json` stays `0.0.1` (untracked, irrelevant). `mvp-v1` tag is left untouched — it does not
match any `<component>-v*` pattern, so release-please ignores it.

### `.github/workflows/release-please.yml` (new)

```yaml
name: release-please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  issues: write

concurrency:
  group: release-please-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

Notes:
- **Manifest mode** is entered by **omitting** the `release-type` action input (explore §Context7:
  the action builds an inline single-package manifest only when `release-type` is set). We pass
  `config-file`/`manifest-file` instead.
- `cancel-in-progress: false` and a group distinct from CI — never cancel a half-done release run.
- **Known gotcha (registered debt):** PRs opened by `GITHUB_TOKEN` do **not** trigger other
  workflows (GitHub's recursion guard), so the release PR itself won't run `ci.yml`. Accepted for now
  — release-PR content is mechanical (CHANGELOG + version + manifest), and the post-merge push to main
  **does** run CI + CD. **Trigger to revisit:** if branch protection requires status checks *on the
  release PR*, swap `token` to a GitHub App / PAT token so the PR triggers CI.

---

## 2. ADR-020 enforcement (Slice A) — reconciled with "nothing installed today"

Explore confirmed: no `.husky/`, no `commitlint.config.*`, root `package.json` has **no**
`devDependencies` and no `prepare` script. So this slice is greenfield install at the **root only**
(ADR-020: installing husky in `apps/*` leaves it inert).

### Root `package.json` additions

```jsonc
{
  "scripts": {
    // ...existing (api, web, landing, test, build, lint)...
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "@commitlint/cli": "^19.6.1",
    "@commitlint/config-conventional": "^19.6.0",
    "lint-staged": "^15.2.11"
  }
}
```

`husky` v9's `prepare: "husky"` installs the git hooks path on `pnpm install`. (CONFIRM-AT-APPLY:
exact latest patch versions via the registry at install time; pins above are current-major shapes.)

### `.husky/commit-msg` (the hard gate that makes release-please trustworthy)

```sh
pnpm exec commitlint --edit "$1"
```

### `.husky/pre-commit`

```sh
pnpm exec lint-staged
```

### `.husky/pre-push` (convenience per ADR-020; CI is enforcement)

```sh
pnpm --filter "...[origin/main]" test
```

(`...[origin/main]` = pnpm's changed-since filter → tests only affected workspaces. Convenience only —
`--no-verify` skips it and CI re-runs everything.)

husky v9 hooks are plain scripts (no v8 sourcing boilerplate). Created via `pnpm exec husky init`
then overwriting the three files above.

### `commitlint.config.js` (repo root, CommonJS — root has no `"type":"module"`)

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  // NO scope-enum on purpose — see rationale below.
};
```

**Deliberate YAGNI call — no `scope-enum`:** explore found real history uses scopes far beyond the 4
workspaces (`sdd`, `openspec`, `auth`, `persistence`, …). release-please groups by **file path, not
commit scope**, so restricting scopes adds friction with **zero** benefit to versioning and would
reject legitimate existing patterns. Merge commits ("Merge pull request #N…") are ignored by
commitlint's `defaultIgnores`, so they don't trip the gate.

### CI commitlint gate — the real enforcement (added to `ci.yml`, detailed in §3)

Validates the full commit range of a PR (and the pushed range on `main`). This is what ADR-020 means
by "CI must re-run the same checks" — hooks are skippable, this is not.

---

## 3. CI restructure (Slice C)

### Topology decision: ONE workflow, path-filtered jobs, aggregate gate

Rejected **multiple workflow files** (one per workspace with native `on.pull_request.paths`): native
path filters live only at the trigger level, and a workflow *skipped by paths* never reports its
check — so any branch-protection "required check" on it **hangs forever** waiting. Rejected
**unconditional jobs** (current state): no path split at all, which the proposal explicitly requires.

Chosen: keep **one `ci.yml`** (SRP: "validate a PR" is one responsibility; one file to reason about —
KISS), always triggered, with a `changes` job (`dorny/paths-filter@v3`) emitting per-workspace
booleans, each workspace job gated by `if: needs.changes.outputs.<ws> == 'true'`, plus a final
`ci-success` aggregation job that **always runs** and is the single stable required check. This is the
documented monorepo pattern and it fixes the skipped-required-check hang.

### Path-mapping convention (risk mitigation — cross-workspace commits)

```yaml
filters: |
  api:     ['apps/api/**']
  web:     ['apps/web/**']
  mobile:  ['apps/mobile/**']
  landing: ['apps/landing/**']
  shared:  ['pnpm-lock.yaml', 'package.json', 'pnpm-workspace.yaml', '.node-version', '.github/workflows/**']
```

Convention (documented so authors and release-please agree):
- A file under `apps/<ws>/**` belongs to `<ws>`. Keep commits **path-coherent per workspace** so
  changelog attribution is clean.
- A **shared-root** change (`shared` filter) fans out to **all** workspace CI jobs (safety — a lockfile
  or root-config change can affect any build) but bumps **no** package in release-please (root is
  excluded; release-please sees no package-path files → no version change).
- A commit that legitimately spans two workspaces contributes to **both** packages' changelogs, each
  attributed by its own files — regardless of the commit's scope token. The scope is cosmetic to
  release-please. This is the concrete resolution of the "cross-workspace commits break path→package
  mapping" risk.

### `ci.yml` job graph (preserving every existing check)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read          # least-privilege; paths-filter + checkout need only read

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.f.outputs.api }}
      web: ${{ steps.f.outputs.web }}
      mobile: ${{ steps.f.outputs.mobile }}
      landing: ${{ steps.f.outputs.landing }}
      shared: ${{ steps.f.outputs.shared }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: f
        with:
          filters: |
            api:     ['apps/api/**']
            web:     ['apps/web/**']
            mobile:  ['apps/mobile/**']
            landing: ['apps/landing/**']
            shared:  ['pnpm-lock.yaml','package.json','pnpm-workspace.yaml','.node-version','.github/workflows/**']

  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - if: github.event_name == 'pull_request'
        run: pnpm exec commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
      - if: github.event_name == 'push'
        run: pnpm exec commitlint --from ${{ github.event.before }} --to ${{ github.sha }} --verbose

  api:
    needs: changes
    if: ${{ needs.changes.outputs.api == 'true' || needs.changes.outputs.shared == 'true' }}
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
      DIRECT_URL: postgresql://ci:ci@localhost:5432/ci
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm api exec prisma generate          # Generate Prisma client
      - run: pnpm api exec tsc --noEmit             # Typecheck API
      - run: pnpm api env:example:check             # .env.example drift guard (ADR-029)
      - run: pnpm api test                          # Unit tests API
      - run: pnpm api build                         # Prod build (rootDir violations)

  web:
    needs: changes
    if: ${{ needs.changes.outputs.web == 'true' || needs.changes.outputs.shared == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm web typecheck
      - run: pnpm web test
      - run: pnpm web build                         # needed for the secret-scan below
      - name: Web secret-scan (fail on bundled API key)
        run: |
          ! grep -rEni 'VITE_.*(KEY|SECRET|TOKEN)' apps/web/src
          test -d apps/web/dist
          ! grep -rEn 'x-api-key' apps/web/dist

  mobile:                                            # NEW job (ADR-017)
    needs: changes
    if: ${{ needs.changes.outputs.mobile == 'true' || needs.changes.outputs.shared == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @moneydiary/mobile exec tsc --noEmit   # CONFIRM tsconfig noEmit at apply
      - run: pnpm --filter @moneydiary/mobile test                # jest-expo 57 (jest@29) + RNTL

  landing:
    needs: changes
    if: ${{ needs.changes.outputs.landing == 'true' || needs.changes.outputs.shared == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm landing exec astro check
      - run: pnpm landing build
      - name: Secret grep
        run: '! grep -rE "(API_KEY|DATABASE_URL|-----BEGIN)" apps/landing/dist/ -q || { echo "Secret found in bundle!"; exit 1; }'
      - name: Smoke test
        run: |
          cd apps/landing/dist/ && python3 -m http.server 8787 &
          SERVER_PID=$!; sleep 2
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/)
          kill $SERVER_PID 2>/dev/null || true
          [ "$STATUS" = "200" ] || { echo "Smoke test failed: got $STATUS"; exit 1; }

  ci-success:                                        # single stable required check
    if: always()
    needs: [changes, commitlint, api, web, mobile, landing]
    runs-on: ubuntu-latest
    steps:
      - name: Verify no required job failed
        run: |
          results='${{ join(needs.*.result, ",") }}'
          echo "job results: $results"
          case "$results" in
            *failure*|*cancelled*) echo "A required job failed"; exit 1 ;;
            *) echo "All required jobs passed or were skipped" ;;
          esac
```

Preserved-checks audit (nothing lost vs current `ci.yml`): api prisma-generate, api `tsc --noEmit`,
`env:example:check`, api unit tests, api build; web typecheck, web unit tests, web build, web
secret-scan; landing astro check, landing build, landing secret grep, landing smoke test — all
present. **Added:** commitlint gate, mobile typecheck+jest job, path-scoped execution, `permissions`
block, `node-version-file` pin (22.22.3 → matches `.node-version` + `render.yaml`, killing the `22`
major-only drift), aggregate `ci-success` gate.

**Branch-protection migration note:** job/check names change (single "Typecheck & unit tests" → per-
workspace + `ci-success`). Update the required-checks list to require **`ci-success`** (and optionally
`commitlint`) — the aggregate job is the stable contract so future job additions don't need protection
edits.

CONFIRM-AT-APPLY: `dorny/paths-filter@v3` current major; mobile has a `test` script (confirmed in
CLAUDE.md commands) and a tsconfig that supports `--noEmit`.

---

## 4. Hybrid CD (Slice D — LAST, per-platform, verified)

Ownership: web/api/landing keep **platform auto-deploy** (no CD moves into Actions — proposal
non-goal); we only add *filters* so each rebuilds when its own workspace changed. Mobile is the sole
platform driven from Actions, via the `mobile-v*` tag.

### D1 — api → Render `buildFilter` (in `render.yaml`)

Add to the `moneydiary-api` service:

```yaml
    buildFilter:
      paths:
        - apps/api/**
        - pnpm-lock.yaml
        - pnpm-workspace.yaml
        - render.yaml
      ignoredPaths:
        - apps/api/**/*.spec.ts
        - apps/api/test/**
        - apps/api/**/*.md
```

Only a change under these paths triggers a Render build; a docs-only or other-workspace change no
longer redeploys the api. Shared dependency changes (`pnpm-lock.yaml`, workspace config) still deploy
api because they can change its runtime. CONFIRM-AT-APPLY: Render `buildFilter.paths`/`ignoredPaths`
schema (documented shape; Context7 not available this phase).

### D2 — web → NEW `apps/web/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../../pnpm-lock.yaml"
}
```

`ignoreCommand` semantics: exit 0 ⇒ **skip** build, non-zero ⇒ **build**. `git diff --quiet` exits 0
when there are NO changes in the given paths ⇒ skip; exits 1 when there are ⇒ build. Correct polarity.
Assumes the web Vercel project's **Root Directory = `apps/web`** (so `.` = `apps/web`, and `../../` =
repo root for the lockfile). Additive only — must NOT add `rewrites`/`routes` that would disturb the
existing `apps/web/api/[...path].ts` proxy function (the server-side API-key boundary, Tarea 0-W).
CONFIRM-AT-APPLY: web project Root Directory setting + that `HEAD^` is valid on Vercel's checkout
(Vercel does a shallow clone; if `HEAD^` is unavailable use Vercel's provided `VERCEL_GIT_*` env or
`git fetch --deepen=1`). Context7 not available this phase.

### D3 — landing → extend existing `apps/landing/vercel.json`

Merge an `ignoreCommand` into the current headers-only file (keep all existing headers verbatim):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../../pnpm-lock.yaml",
  "headers": [ /* ...unchanged CSP/HSTS/nosniff/Referrer-Policy block... */ ]
}
```

Same polarity/assumptions as D2 (landing project Root Directory = `apps/landing`).

### D4 — mobile → `mobile-v*` tag → EAS build (NEW `.github/workflows/mobile-release.yml`)

```yaml
name: mobile-release

on:
  push:
    tags:
      - 'mobile-v*'

permissions:
  contents: read

jobs:
  eas-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .node-version, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - name: EAS build (production)
        working-directory: apps/mobile
        run: eas build --platform all --profile production --non-interactive --no-wait
```

Requires repo secret **`EXPO_TOKEN`** (EAS access token). `--no-wait` returns after enqueue (no
minutes burned waiting for the EAS queue). Submission to stores stays manual (ADR-022).

### release-please ↔ EAS ownership boundary (concrete, ordered — mobile version risk)

1. Devs merge `feat(mobile): …` commits touching `apps/mobile/**` into `main`.
2. release-please (`expo` strategy) opens/updates the **mobile** release PR: bumps
   `apps/mobile/app.json` `expo.version` (e.g. 0.1.0→0.2.0) + `apps/mobile/package.json` version +
   CHANGELOG. Writes **only** `version`. Never touches `ios.buildNumber`/`android.versionCode`.
3. Merging that PR → release-please pushes the bump commit and cuts tag **`mobile-v0.2.0`**.
4. The `mobile-v*` tag fires `mobile-release.yml` → `eas build --profile production`.
5. EAS (`appVersionSource:"remote"` + `autoIncrement:true`) reads the **last remote** versionCode/
   buildNumber from EAS servers, increments it, stamps the binary; it reads `expo.version` (just set
   by release-please) as the store/marketing version string. On the very first `mobile-v*` build no
   remote value exists yet, so EAS bootstraps from `app.json` then increments thereafter (explore
   §Context7 EAS).

**Disjoint fields, ordered write→read:** release-please writes `version` at PR-merge time (before the
tag); EAS reads it and owns `versionCode`/`buildNumber` at build time (after the tag). No field is
ever written by both. This satisfies the binding exactly.

---

## 5. Sequencing & rollback

Order enforces "riskiest / production-touching LAST", each part independently verifiable & revertible:

| Slice | What | Prod impact | Verify | Rollback |
|---|---|---|---|---|
| **A** | commitlint + husky + lint-staged (root) + CI commitlint gate | none | push a bad commit msg → CI `commitlint` job fails | revert; hooks are `--no-verify`-skippable, CI job removable |
| **B** | release-please config + manifest (0.1.0) + release workflow; set `apps/*` package.json (+app.json) to 0.1.0 | none (no deploy touched) | inspect the **first** release PRs: expect **4 separate** PRs, tags `api/web/landing/mobile-v0.1.x`, correct sections. **Do NOT merge until validated** | delete config/manifest/workflow; no tags exist until a release PR merges |
| **C** | one `ci.yml` w/ paths-filter + mobile job + node-version-file + aggregate gate + permissions | CI-only | open PRs touching one workspace at a time → only that job runs; `ci-success` always reports | revert `ci.yml` (checks preserved verbatim); re-point branch protection |
| **D** | Hybrid CD, one platform at a time | **production** | see per-part rows below | each part independently reverts to build-on-every-push |
| D1 | Render `buildFilter` (api) | api deploy | push docs-only web change → api does NOT rebuild; push api change → it DOES | remove `buildFilter` → Render rebuilds on every push (safe default) |
| D2 | web `vercel.json` ignoreCommand | web deploy | same A/B test on the web Vercel project | delete `vercel.json` → build every push |
| D3 | landing ignoreCommand | landing deploy | same on landing project | remove `ignoreCommand` key (keep headers) |
| D4 | `mobile-release.yml` + EXPO_TOKEN | EAS build | push `mobile-v0.0.0-test` tag → EAS build starts, then delete tag; then first real `mobile-v*` | delete workflow → tags stop building; EAS still runnable manually |

Global rollback property: no part cross-couples. Removing any CD filter reverts to the prior
build-on-every-push behavior; removing the mobile workflow leaves EAS manual (status quo ante).

---

## 6. Risk register (every proposal risk → concrete mitigation)

1. **CD touches production** → Slice D is last, one platform per part, each A/B-verified against a real
   trigger, each independently revertible (§5).
2. **Cross-workspace commits break path→package mapping** → CONVENTION documented (§3): release-please
   groups by changed-file PATH, not commit scope; keep commits path-coherent; shared-root changes fan
   out to all-workspace CI but bump NO package (root excluded); commitlint deliberately omits
   `scope-enum`.
3. **release-please ↔ EAS mobile version** → hard, ordered boundary (§4): release-please writes
   app.json `version` (expo strategy); EAS owns `versionCode`/`buildNumber` remotely; disjoint fields,
   write-before-tag / read-after-tag.
4. **Seeding manifest at 0.x without re-tagging** → seed `.release-please-manifest.json` at 0.1.0
   explicitly AND set package.json/app.json to 0.1.0 in the same bootstrap commit (no drift);
   `bump-minor-pre-major:true` keeps 0.x; **validate the first release PRs before merge**; `mvp-v1`
   ignored (no `<component>-v*` match).
5. **CI Node drift (22 vs 22.22.3)** → all jobs use `node-version-file: .node-version` (single source
   of truth), matching `render.yaml`'s `NODE_VERSION=22.22.3`.
6. **(new) GITHUB_TOKEN release PRs don't trigger CI** → accepted (mechanical content); trigger to add
   a PAT/App token if branch protection requires checks on the release PR (§1).
7. **(new) Required-check names change on CI split** → require the stable `ci-success` aggregate job in
   branch protection; skipped path-filtered jobs no longer hang the merge (§3).
8. **(new) Vercel `HEAD^` on shallow clone** → CONFIRM-AT-APPLY; fallback to `VERCEL_GIT_*` env or
   `git fetch --deepen=1` in `ignoreCommand` (§4 D2).

---

## 7. ADR-style decisions (rationale + rejected alternatives)

- **DD-1 `separate-pull-requests: true`.** Chosen for independent release cadence per package (binding).
  Rejected: default combined PR (couples all changed packages into one merge/tag event).
- **DD-2 Seed 0.1.0 + `bump-minor-pre-major: true`.** 0.1.0 = "functioning pre-stable" and the flag
  keeps breaking changes inside 0.x. Rejected: 0.0.1 (implies unshipped), 1.0.0 (binding forbids),
  default `bump-minor-pre-major:false` (promotes to 1.0.0 on first breaking change — violates binding).
- **DD-3 Permissions `contents`+`pull-requests`+`issues: write`.** `issues:write` needed for PR
  labeling via the Issues API. Rejected: dropping it (label step fails).
- **DD-4 One CI workflow + paths-filter + `ci-success` gate.** SRP (one "validate PR" responsibility)
  + KISS (one file) + reliable required-check reporting. Rejected: multi-file workflows (skipped
  required checks hang); unconditional jobs (no path split — proposal requires it).
- **DD-5 `node-version-file: .node-version`.** Single source of truth kills the 22↔22.22.3 drift.
  Rejected: hardcoding `22.22.3` in every job (re-introduces a drift surface).
- **DD-6 Mobile `release-type: expo`.** Bumps app.json `version` natively, honoring the ownership
  boundary. Rejected: `node` + manual app.json edits (drift); fallback documented (`extra-files` json
  updater) only if the strategy is unavailable.
- **DD-7 commitlint without `scope-enum`.** release-please maps by path, not scope; enforcement would
  break existing diverse scopes for no benefit (YAGNI). Rejected: strict scope-enum.
- **DD-8 Platform-native CD filters + Actions only for mobile.** Preserves Vercel/Render preview
  deploys and free-tier ergonomics. Rejected: moving all CD into Actions (proposal non-goal).
```
