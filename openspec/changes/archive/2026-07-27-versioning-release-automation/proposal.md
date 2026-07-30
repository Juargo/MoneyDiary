# Proposal — versioning-release-automation

**Change:** `versioning-release-automation`
**Implements:** ADR-030 (independent per-workspace semver + release-please, manifest mode) with ADR-020 (commitlint enforcement) as a precondition.
**Store:** hybrid (openspec file + engram `sdd/versioning-release-automation/proposal`).
**Status:** decision is made; this document formalizes intent and scope. The "how" (exact config contents, per-package task breakdown) belongs to design/tasks.

---

## Why

Today there is **no release automation and no versioning discipline** in the monorepo. All four workspaces (`@moneydiary/api`, `web`, `mobile`, `landing`) plus the root are stuck at `0.0.1`, there are zero `CHANGELOG.md` files, and the only git tag (`mvp-v1`) is an unrelated MVP reference. Conventional Commits compliance is 100% human discipline — there is **no husky, no commitlint, no CI gate** — even though ADR-020 was "decided" long ago. Deploys are undifferentiated: any commit to `main` retriggers Render (api) and Vercel (web/landing) regardless of which workspace changed, and mobile has no CD path in-repo at all.

This matters now because release-please **derives every version bump from commit history**: an unenforced commit convention silently drops or corrupts bumps, so ADR-020 must be closed as a hard precondition, not left as convenience. Independent per-workspace semver (ADR-030) gives each package its own changelog and tag, which is the foundation for coordinated releases and, eventually, multi-client distribution (ADR-023). Path-scoped CD stops unrelated workspaces from redeploying each other and cuts free-tier build minutes.

**Success looks like:** every merge to `main` that carries a `feat`/`fix` produces or updates a per-package release PR; merging that PR cuts a `<component>-vX.Y.Z` tag + GitHub Release + `CHANGELOG.md` for exactly the packages that changed; malformed commits are rejected by CI; and each platform only rebuilds/redeploys when its own workspace changed (mobile via an explicit `mobile-v*` tag).

---

## In-scope

1. **Close ADR-020 fully (commit enforcement).** Install husky + lint-staged + commitlint at the repo root (`private:true` root gets the `prepare` script + devDependencies it currently lacks). Local hooks are convenience; add a **commitlint gate job in CI** as the real enforcement per ADR-020's own principle. This is the precondition that makes release-please trustworthy.

2. **release-please manifest bootstrap + release workflow.** Add `release-please-config.json` + `.release-please-manifest.json` in manifest mode, keyed by the four `apps/*` paths, each with a `component` so tags become `<component>-vX.Y.Z`. Seed the manifest at **0.x** for all four packages (see Baseline). Add a release workflow using `googleapis/release-please-action@v4` with the correct `permissions:` block. **Root package is excluded** from release-please tracking (it is a workspace root, not a releasable package).

3. **CI split by path + mobile job + Node pin alignment.** Introduce path filters so api/web/mobile/landing CI only runs for their own changes; add the **missing mobile CI job** (jest-expo per ADR-017); align CI's `setup-node` to the pinned `22.22.3` (`.node-version`) instead of the drifting major-only `22`.

4. **Hybrid CD.**
   - **api → Render:** add path filtering (Render ignored-paths) so only `apps/api` (and shared root deps) changes trigger a deploy.
   - **web → Vercel:** create `apps/web/vercel.json` (none exists today) with an `ignoreCommand` that skips builds when `apps/web` is untouched.
   - **landing → Vercel:** add the equivalent build-skip filter to the existing `apps/landing/vercel.json`.
   - **mobile → EAS via Actions:** a `mobile-v*` tag (cut by release-please for the mobile component) triggers an EAS build job in GitHub Actions. release-please owns the `version` field in `app.json`; EAS `autoIncrement` (already configured, `appVersionSource:"remote"`) owns `versionCode`/`buildNumber`. No overlap.

---

## Out-of-scope / Non-goals

- **`runtimeVersion` / expo-updates / OTA** — not configured today and not part of this change.
- **npm publishing** — all packages are `private:true` and stay unpublished.
- **Moving all CD into GitHub Actions** — web/api/landing keep their platform auto-deploy; only mobile deploys via Actions. This is a deliberate hybrid, not a lift-and-shift.
- **App-store / TestFlight / Play submission** — the mobile job builds via EAS; store submission stays manual (ADR-022) and out of scope here.
- **Re-tagging or rewriting existing git history** — the manifest bootstraps from 0.x with no historical reconciliation; the lone `mvp-v1` tag is left untouched.
- **Starting at 1.0.0** — the project is still iterating (see Baseline).

---

## Approach (high-level slices)

Ordered so the riskiest, production-touching work lands **last** and verified.

1. **Slice A — Commit enforcement (ADR-020).** husky + lint-staged + commitlint at root + CI commitlint gate. Independent, low blast radius, unblocks everything downstream.
2. **Slice B — release-please bootstrap.** Config + manifest seeded at 0.x, release workflow with correct permissions, root excluded. Produces release PRs but touches no production deploy path.
3. **Slice C — CI restructure.** Path filters + mobile jest-expo job + Node pin alignment. CI-only; no production impact.
4. **Slice D — Hybrid CD (LAST, per-part, verified).** Render path filter → web `vercel.json` → landing filter → mobile `mobile-v*` → EAS. Each part shipped and verified independently because it touches live deploys.

Detailed config contents and per-package task breakdown are deferred to design/tasks.

---

## Risks & mitigations

- **CD migration touches production.** Wrong path filters can silently stop a needed deploy or trigger a bad one. → Do Slice D **last**, one platform at a time, each verified against a real trigger before moving on.
- **Cross-workspace commits break the path→package mapping.** A commit that edits two workspaces (or shared root deps) can mis-map bumps and deploy filters. → Document the convention; rely on path-based grouping (not commit scope, which the history shows is diverse) and account for shared-root-dep changes explicitly in design.
- **release-please ↔ EAS coordination on the mobile `version`.** Two systems write mobile version data. → Hard boundary: release-please owns `app.json > version`; EAS owns `versionCode`/`buildNumber` remotely (`appVersionSource:"remote"` already set). No field is written by both.
- **Seeding the manifest at 0.x without re-tagging history.** No prior `<pkg>-vX.Y.Z` tags exist, so the first release must bootstrap cleanly from the seeded manifest. → Seed `.release-please-manifest.json` explicitly at 0.x per package; validate the first release PR before merging.
- **CI Node drift (`22` vs `22.22.3`).** Release steps sensitive to Node patch could behave differently than Render. → Align CI `setup-node` to `.node-version` as part of Slice C.

---

## Open questions

*(design/tasks phase, not blocking this proposal)*

- **Workflow permissions scope:** release-please-action's README lists `issues: write` in addition to `contents: write` + `pull-requests: write`. Confirm the minimal required set when writing the release workflow.
- **Combined vs separate release PRs:** `separate-pull-requests` default (false → one combined PR across components) vs one PR per component. Pick in design based on review ergonomics.
- **Exact per-package 0.x baseline numbers** (e.g. all `0.1.0` vs mirroring current `0.0.1`) — a design detail; the binding decision is "0.x, not 1.0.0".
